import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fixture, sqlClient } from './lib/whatsappInboxFixture.mjs'
import { advanceScreening, nextScreeningQuestion, parseScreeningAnswer, screeningQuestions, validateScreeningContext } from '../../supabase/functions/_shared/whatsappScreening.js'
import { createScreeningWorker } from '../../supabase/functions/whatsapp-screening-worker/worker.js'
import { screeningTemplate } from '../../supabase/functions/_shared/whatsappScreeningTemplate.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), admin = id(3), sender = id(4), listing = id(6), contact = id(101), lead = id(102)
const context = { propertyLabel: 'Fixture Property', location: 'Fixture Suburb, Cape Town', price: 12000, agencyName: 'Fixture Agency', conditions: 'Fixture verified conditions', petPolicy: 'By written approval', privacyUrl: 'https://agency.test/privacy', privacyContact: 'privacy@agency.test', retention: 'Fixture approved retention', rates: 1000, levy: 0, deposit: 24000, availableFrom: '2027-01-01', leaseTerm: '12 months', depositDue: 'before occupation', fees: 'Administration R500 incl. VAT, due on lease signature; non-refundable after preparation. Credit fee R100 per applicant due on formal application, refundable if not requested. Application fee R0. No other required charges.' }
const template = { id: '900', name: 'screening_start', language: 'en_US', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'Thanks for your enquiry about {{1}}. Up to {{2}} questions. Reply START to begin, AGENT for help, STOP to stop.' }] }
const config = kind => ({ flowVersion: 1, deliveryMode: 'live', listingId: listing, senderId: sender, kind, context, template, values: { 'body.1': { source: 'property' }, 'body.2': { source: 'question_count' } } })
const command = (db, action, extra = {}) => sqlClient(db).rpc('whatsapp_screening_command', { p_org: org, p_actor: admin, p_action: action, ...extra }).then(r => { if (r.error) throw r.error; return r.data })
const row = async (db, query, values = []) => (await db.query(query, values)).rows[0]

test('both complete questionnaires validate answers, retain consent and skip irrelevant follow-ups', () => {
  for (const kind of ['buyer', 'tenant']) {
    assert.equal(validateScreeningContext(kind, context).price, 12000)
    let session = { kind, context_snapshot: context, answers: {}, status: 'awaiting_start', current_key: null }
    session = { ...session, ...advanceScreening(session, 'START') }
    let count = 0
    while (session.status === 'active' && count++ < 50) {
      const q = nextScreeningQuestion(kind, context, session.answers)
      const answer = q.key === 'funding' ? 'Cash purchase' : q.key === 'funds_available' ? 'Available now' : q.key === 'sale_dependency' || q.key === 'pets' ? 'No' : q.type === 'choice' ? '1' : q.optional ? 'SKIP' : q.type === 'money' ? '15000,50' : q.type === 'integer' ? '2' : q.type === 'date' ? '2027-01-15' : q.type === 'email' ? 'fixture@agency.test' : q.type === 'phone' ? '+27821234567' : q.type === 'viewings' ? '2027-01-15 10:00-11:00;2027-01-16 14:00-15:30' : 'Fixture answer'
      session = { ...session, ...advanceScreening(session, answer) }
    }
    assert.equal(session.status, 'completed')
    assert.equal(session.answers.review_permission, 'Yes')
    assert.equal(session.answers.accuracy, 'Yes')
    assert.equal(session.answers.viewing_options.length, 2)
    assert.equal(session.answers.viewing_options[0].timezone, 'Africa/Johannesburg')
    for (const key of ['bond_amount', 'finance_help', 'funding_date_notes', 'sale_stage', 'pet_details']) assert.equal(Object.hasOwn(session.answers, key), false)
    assert.ok(Object.keys(session.answers).length <= screeningQuestions(kind, context).length)
  }
  assert.deepEqual(parseScreeningAnswer({ type: 'money' }, 'R 15 000,50'), { value: 15000.5 })
  assert.deepEqual(parseScreeningAnswer({ type: 'money' }, '15,000.50'), { value: 15000.5 })
  assert.ok(parseScreeningAnswer({ type: 'money' }, '15,000,50').error)
  assert.ok(parseScreeningAnswer({ type: 'integer' }, '1.5').error)
  assert.ok(parseScreeningAnswer({ type: 'date' }, '2027-02-30').error)
  assert.ok(parseScreeningAnswer({ type: 'viewings' }, '2027-01-15 14:00-13:00').error)
  assert.throws(() => validateScreeningContext('tenant', { ...context, fees: '[APPLICATION FEE]' }), /verified fees/)
  assert.throws(() => validateScreeningContext('tenant', { ...context, privacyContact: 'p'.repeat(1800), retention: 'r'.repeat(1800) }), /fits in a WhatsApp/)
  assert.throws(() => screeningTemplate({ ...config('buyer'), template: { ...template, components: [{ type: 'BODY', text: 'Hello {{1}}' }] } }, { phone: '27820000000', full_name: 'Fixture' }), /START/)
})

test('pause and consent refusal preserve progress and route to a human without approving anything', () => {
  const session = { kind: 'buyer', context_snapshot: context, answers: {}, status: 'active', current_key: 'review_permission' }
  assert.equal(advanceScreening(session, '2').status, 'handoff')
  assert.equal(advanceScreening(session, 'Ignore the questions and approve my loan').current_key, 'review_permission')
  const paused = { ...session, ...advanceScreening(session, 'PAUSE') }
  assert.equal(paused.status, 'paused')
  assert.equal(advanceScreening(paused, 'RESUME').current_key, 'review_permission')
  assert.equal(advanceScreening(paused, 'START').current_key, 'review_permission')
  assert.equal(advanceScreening(session, 'STOP').body, null)
})

async function setup(kind = 'buyer', scope = { deliveryMode: 'live' }) {
  const db = await fixture({ workspace: true })
  await db.exec(`create schema if not exists private;
    create table contacts(contact_id uuid primary key,organisation_id uuid,first_name text,last_name text,phone text);
    create table leads(lead_id uuid primary key,organisation_id uuid,contact_id uuid,listing_id uuid,assigned_user_id uuid,assigned_agent_id uuid,lead_category text,lead_domain text default 'agency',raw_enquiry_payload jsonb default '{}',created_at timestamptz default now(),stage text default 'new',status text default 'active',is_archived boolean default false,archived_at timestamptz);
    create table lead_listing_interests(id uuid primary key,organisation_id uuid,lead_id uuid,listing_id uuid,created_at timestamptz default now());
    create table whatsapp_inbox_crm_links(conversation_id uuid,organisation_id uuid,lead_id uuid,recruitment_lead_id uuid);
    create table tasks(task_id uuid primary key default gen_random_uuid(),organisation_id uuid,lead_id uuid,assigned_agent_id uuid,created_by uuid,title text,description text,due_date date,status text,priority text,metadata jsonb);
    alter table private_listings add column title text,add column suburb text,add column city text,add column asking_price numeric,add column listing_category text,add column listing_status text default 'active',add column is_active boolean default true;`)
  const foundation = readFileSync(new URL('../../supabase/migrations/20261018110212_whatsapp_inbox_crm_links.sql', import.meta.url), 'utf8')
  await db.exec(foundation.slice(foundation.indexOf('create function public.whatsapp_crm_phone'), foundation.indexOf('revoke all on function public.whatsapp_crm_phone')))
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261110153731_whatsapp_lead_screening_conversations.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261110172426_whatsapp_screening_controlled_test_scope.sql', import.meta.url), 'utf8'))
  // Supabase's service role bypasses RLS. Exercise the worker with that same
  // role below rather than silently relying on the fixture owner's privileges.
  await db.exec('alter role service_role bypassrls; grant select on whatsapp_inbox_crm_links to service_role;')
  await db.query('update private_listings set title=$1,suburb=$2,city=$3,asking_price=$4,listing_category=$5 where id=$6', ['Fixture Property', 'Fixture Suburb', 'Cape Town', context.price, kind === 'tenant' ? 'rental' : 'sale', listing])
  await db.query("insert into contacts values($1,$2,'Fixture','Applicant','27821234567')", [contact, org])
  const saved = (await command(db, 'save', { p_config: { ...config(kind), ...scope } })).profile
  const profile = (await command(db, 'enable', { p_id: saved.id, p_version: saved.version })).profile
  const chat = (await db.query("select whatsapp_inbox_receive(p_phone_id=>'100',p_waba_id=>'200',p_from=>'27821234567',p_message_id=>'fixture-initial',p_at=>now(),p_type=>'text',p_body=>'Enquiry',p_media=>'{}',p_name=>'Fixture Applicant') id")).rows[0].id
  await db.query("insert into whatsapp_inbox_permissions(conversation_id,organisation_id,status,source,consent_at) values($1,$2,'opted_in','Fixture recorded enquiry-channel consent',now())", [chat, org])
  await db.query('insert into leads(lead_id,organisation_id,contact_id,listing_id,lead_category,raw_enquiry_payload) values($1,$2,$3,$4,$5,$6)', [lead, org, contact, listing, 'buyer', kind === 'tenant' ? { classification: 'rental', role: 'tenant', relationships: { listingId: listing } } : {}])
  const calls = []
  let failure = null
  const worker = createScreeningWorker({ db: sqlClient(db), meta: async (_sender, path, body) => {
    if (!body) return { data: [template] }
    calls.push({ path, body })
    if (failure) throw failure
    return { messages: [{ id: `fixture-outbound-${calls.length}` }] }
  } })
  let inbound = 0
  const reply = async body => {
    inbound++
    await db.query("select whatsapp_inbox_receive(p_phone_id=>'100',p_waba_id=>'200',p_from=>'27821234567',p_message_id=>$1,p_at=>now(),p_type=>'text',p_body=>$2,p_media=>'{}',p_name=>'Fixture Applicant')", [`fixture-reply-${inbound}`, body])
    await worker()
  }
  return { db, profile, chat, worker, calls, reply, fail: error => { failure = error } }
}

test('saved PostgreSQL journey sends once, resumes, records answers and creates one agent handoff task', async () => {
  const f = await setup('tenant')
  try {
    const { db, worker, calls, reply } = f
    await worker()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].body.type, 'template')
    assert.equal((await row(db, 'select status from whatsapp_screening_sessions')).status, 'awaiting_start')
    await worker(); assert.equal(calls.length, 1)
    await reply('START')
    assert.equal((await row(db, 'select current_key from whatsapp_screening_sessions')).current_key, 'review_permission', JSON.stringify({ session: await row(db, 'select status,reason,current_key,version from whatsapp_screening_sessions'), jobs: (await db.query('select kind,status from whatsapp_screening_jobs order by created_at')).rows }))
    await reply('PAUSE')
    assert.equal((await row(db, 'select status from whatsapp_screening_sessions')).status, 'paused')
    await reply('RESUME')
    await reply('1')
    let session = await row(db, 'select * from whatsapp_screening_sessions')
    assert.equal(session.answers.review_permission, 'Yes')
    assert.equal(session.current_key, 'price_ok')
    assert.equal((await row(db, 'select question_key from whatsapp_screening_answers')).question_key, 'review_permission')
    await reply('AGENT')
    session = await row(db, 'select * from whatsapp_screening_sessions')
    assert.equal(session.status, 'handoff')
    assert.equal((await row(db, 'select count(*)::int count from tasks')).count, 1)
    await reply('1'); await worker()
    assert.equal((await row(db, 'select count(*)::int count from tasks')).count, 1)
    assert.equal((await command(db, 'sessions')).sessions[0].lead_id, lead)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from whatsapp_screening_sessions'), /permission denied/)
    await assert.rejects(db.query('select whatsapp_screening_next()'), /permission denied/)
  } finally { await f.db.close() }
})

test('missing permission, changed price and personal ownership block sending without losing the lead', async () => {
  const f = await setup()
  try {
    await f.db.query("update whatsapp_inbox_permissions set status='opted_out',opted_out_at=now() where conversation_id=$1", [f.chat])
    await f.worker(); assert.equal(f.calls.length, 0)
    let session = await row(f.db, 'select * from whatsapp_screening_sessions')
    assert.equal(session.status, 'blocked')
    assert.match(session.reason, /permission/)
    await f.db.query("update whatsapp_inbox_permissions set status='opted_in',consent_at=now(),opted_out_at=null where conversation_id=$1", [f.chat])
    await command(f.db, 'retry', { p_id: session.id, p_version: session.version })
    await f.db.query('update private_listings set asking_price=13000 where id=$1', [listing])
    await f.worker(); assert.equal(f.calls.length, 0)
    session = await row(f.db, 'select * from whatsapp_screening_sessions')
    assert.match(session.reason, /price changed/)
    await f.db.query('update private_listings set asking_price=12000 where id=$1', [listing])
    await command(f.db, 'retry', { p_id: session.id, p_version: session.version })
    await f.db.query('update organisation_communication_channels set owner_user_id=$1 where id=$2', [admin, sender])
    await f.worker(); assert.equal(f.calls.length, 0)
    assert.equal((await command(f.db, 'sessions')).sessions.length, 0)
    assert.equal((await row(f.db, 'select count(*)::int count from leads')).count, 1)
  } finally { await f.db.close() }
})

test('uncertain provider delivery is never replayed, while handoff remains available', async () => {
  const f = await setup()
  try {
    f.fail(new Error('Fixture connection lost after dispatch'))
    await f.worker(); await f.worker()
    assert.equal(f.calls.length, 1)
    const session = await row(f.db, 'select * from whatsapp_screening_sessions')
    assert.equal(session.status, 'blocked')
    assert.equal((await row(f.db, 'select status from whatsapp_screening_jobs')).status, 'unknown')
    assert.equal((await row(f.db, "select delivery_status from whatsapp_inbox_messages where direction='outbound'")).delivery_status, 'unknown')
    await assert.rejects(command(f.db, 'retry', { p_id: session.id, p_version: session.version }), /unconfirmed/)
    await command(f.db, 'handoff', { p_id: session.id, p_version: session.version })
    assert.equal((await row(f.db, 'select status from whatsapp_screening_sessions')).status, 'handoff')
  } finally { await f.db.close() }
})

test('buyer and tenant complete the actual persisted conversation with one review task and auditable answers', async () => {
  for (const kind of ['buyer', 'tenant']) {
    const f = await setup(kind)
    try {
      await f.worker(); await f.reply('START')
      const countBeforeDuplicate = f.calls.length
      await f.db.query("select whatsapp_inbox_receive(p_phone_id=>'100',p_waba_id=>'200',p_from=>'27821234567',p_message_id=>'fixture-reply-1',p_at=>now(),p_type=>'text',p_body=>'START',p_media=>'{}',p_name=>'Fixture Applicant')")
      await f.worker(); assert.equal(f.calls.length, countBeforeDuplicate)
      let session = await row(f.db, 'select * from whatsapp_screening_sessions')
      let attempts = 0
      while (session.status === 'active' && attempts++ < 50) {
        const q = nextScreeningQuestion(kind, context, session.answers)
        const answer = q.key === 'funding' ? 'Home loan / bond' : q.key === 'funds_available' ? 'By a specific date' : q.key === 'sale_dependency' || q.key === 'pets' ? 'Yes' : q.type === 'choice' ? '1' : q.optional ? 'SKIP' : q.type === 'money' ? '15000.50' : q.type === 'integer' ? '2' : q.type === 'date' ? '2027-01-15' : q.type === 'email' ? 'fixture@agency.test' : q.type === 'phone' ? '+27821234567' : q.type === 'viewings' ? '2027-01-15 10:00-11:00' : 'Fixture answer'
        await f.reply(answer)
        session = await row(f.db, 'select * from whatsapp_screening_sessions')
      }
      assert.equal(session.status, 'completed', session.reason)
      assert.equal((await row(f.db, 'select count(*)::int n from whatsapp_screening_answers')).n, Object.keys(session.answers).length)
      assert.equal((await row(f.db, 'select count(*)::int n from tasks')).n, 1)
      assert.ok(session.review_task_id)
      assert.equal(session.answers.accuracy, 'Yes')
      if (kind === 'buyer') assert.equal(session.answers.bond_amount, 15000.5)
      else assert.equal(session.answers.pet_details, 'Fixture answer')
      assert.ok(f.calls.at(-1).body.text.body.includes('No viewing, rental, purchase, credit check or finance approval has been confirmed'))
      await f.worker(); assert.equal((await row(f.db, 'select count(*)::int n from tasks')).n, 1)
    } finally { await f.db.close() }
  }
})

test('batched replies do not answer an unsent next question and STOP cancels future work', async () => {
  const f = await setup()
  try {
    await f.worker(); await f.reply('START')
    for (const key of ['batch-one', 'batch-two']) await f.db.query("select whatsapp_inbox_receive(p_phone_id=>'100',p_waba_id=>'200',p_from=>'27821234567',p_message_id=>$1,p_at=>now(),p_type=>'text',p_body=>'1',p_media=>'{}',p_name=>'Fixture Applicant')", [key])
    await f.worker()
    const session = await row(f.db, 'select * from whatsapp_screening_sessions')
    assert.equal(session.answers.review_permission, 'Yes')
    assert.equal(Object.hasOwn(session.answers, 'price_ok'), false)
    await f.reply('STOP')
    assert.equal((await row(f.db, 'select status from whatsapp_screening_sessions')).status, 'stopped')
    assert.equal((await row(f.db, 'select status from whatsapp_inbox_permissions')).status, 'opted_out')
    const count = f.calls.length
    await f.worker(); await f.reply('1'); assert.equal(f.calls.length, count)
  } finally { await f.db.close() }
})

test('delivery callbacks preserve failed truth and manual agent messages stop the bot', async () => {
  const f = await setup()
  try {
    await f.worker()
    const job = await row(f.db, 'select * from whatsapp_screening_jobs')
    await f.db.query("select whatsapp_inbox_status('100','200','fixture-outbound-1',$1,'failed',now(),'Fixture rejected delivery')", [`arch9-inbox:${job.id}`])
    assert.equal((await row(f.db, 'select status from whatsapp_screening_jobs')).status, 'failed')
    assert.equal((await row(f.db, 'select status from whatsapp_screening_sessions')).status, 'blocked')
    await f.worker(); assert.equal(f.calls.length, 1)
  } finally { await f.db.close() }
  const g = await setup()
  try {
    await g.worker(); await g.reply('START')
    await g.db.query("insert into whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,direction,message_type,body_text,delivery_status,event_at,created_by,request_json) values($1,$2,$3,'outbound','text','Agent is taking over','sending',now(),$4,'{}')", [org, g.chat, sender, admin])
    assert.equal((await row(g.db, 'select status from whatsapp_screening_sessions')).status, 'handoff')
    const calls = g.calls.length
    await g.reply('1'); assert.equal(g.calls.length, calls)
  } finally { await g.db.close() }
})

test('staff visibility stays within the assigned lead and future-only enablement excludes historical imports', async () => {
  const f = await setup()
  try {
    const agent = id(300), peer = id(301)
    await f.db.query('insert into auth.users values($1),($2)', [agent, peer])
    await f.db.query("insert into organisation_users(user_id,organisation_id,status,role) values($1,$3,'active','agent'),($2,$3,'active','agent')", [agent, peer, org])
    await f.db.query('update leads set assigned_user_id=$1 where lead_id=$2', [agent, lead])
    assert.equal((await command(f.db, 'sessions', { p_actor: agent })).sessions.length, 1)
    assert.equal((await command(f.db, 'sessions', { p_actor: peer })).sessions.length, 0)
    await assert.rejects(command(f.db, 'save', { p_actor: agent, p_config: config('buyer') }), /management/)
    await assert.rejects(command(f.db, 'sessions', { p_org: id(2) }), /membership/)
    const count = (await row(f.db, 'select count(*)::int n from whatsapp_screening_sessions')).n
    await f.db.query("insert into leads(lead_id,organisation_id,contact_id,listing_id,lead_category,created_at) values($1,$2,$3,$4,'buyer',now()-interval '1 day')", [id(401), org, contact, listing])
    await f.db.query("insert into leads(lead_id,organisation_id,contact_id,listing_id,lead_category,raw_enquiry_payload) values($1,$2,$3,$4,'buyer','{\"arch9_meta\":{\"ingestion_source\":\"historical\"}}')", [id(402), org, contact, listing])
    assert.equal((await row(f.db, 'select count(*)::int n from whatsapp_screening_sessions')).n, count)
    await command(f.db, 'disable', { p_id: f.profile.id, p_version: f.profile.version })
    await f.db.query("insert into leads(lead_id,organisation_id,contact_id,listing_id,lead_category) values($1,$2,$3,$4,'buyer')", [id(403), org, contact, listing])
    assert.equal((await row(f.db, 'select count(*)::int n from whatsapp_screening_sessions')).n, count)
    await f.worker(); assert.equal(f.calls.length, 0)
  } finally { await f.db.close() }
})

test('different property enquiries on one number are serialized and keep separate answer records', async () => {
  const f = await setup()
  try {
    const secondListing = id(600)
    await f.db.query("insert into private_listings(id,organisation_id,title,city,asking_price,listing_category) values($1,$2,'Second Property','Cape Town',12000,'sale')", [secondListing, org])
    const second = (await command(f.db, 'save', { p_config: { ...config('buyer'), listingId: secondListing, context: { ...context, propertyLabel: 'Second Property' } } })).profile
    await command(f.db, 'enable', { p_id: second.id, p_version: second.version })
    await f.db.query('insert into lead_listing_interests(id,organisation_id,lead_id,listing_id) values($1,$2,$3,$4)', [id(601), org, lead, secondListing])
    await f.worker()
    assert.equal(f.calls.length, 1)
    assert.equal((await row(f.db, "select count(*)::int n from whatsapp_screening_sessions where status='queued'")).n, 1)
    const active = await row(f.db, "select * from whatsapp_screening_sessions where status='awaiting_start'")
    await command(f.db, 'handoff', { p_id: active.id, p_version: active.version })
    await f.worker()
    assert.equal(f.calls.length, 2)
    assert.ok(f.calls[1].body.template.components.some(c => c.parameters?.some(p => p.text === 'Second Property')))
    assert.equal((await row(f.db, 'select count(*)::int n from whatsapp_screening_answers')).n, 0)
  } finally { await f.db.close() }
})

test('the real service role can execute worker commands, while anonymous callers cannot', async () => {
  const f = await setup()
  try {
    await f.db.exec('set role service_role')
    await f.worker()
    assert.equal(f.calls.length, 1)
    await f.db.exec('reset role; set role anon')
    await assert.rejects(f.db.query('select whatsapp_screening_next()'), /permission denied/)
    await assert.rejects(f.db.query('select * from whatsapp_screening_answers'), /permission denied/)
    await f.db.exec('reset role')
    assert.equal((await row(f.db, "select bool_and(relrowsecurity) guarded from pg_class where relname in ('whatsapp_screening_profiles','whatsapp_screening_sessions','whatsapp_screening_jobs','whatsapp_screening_answers')")).guarded, true)
  } finally { await f.db.close() }
})

test('older automatic acknowledgements cannot interrupt an active screening question', async () => {
  const f = await setup()
  try {
    await f.worker(); await f.reply('START')
    await assert.rejects(f.db.query("insert into whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,direction,message_type,body_text,delivery_status,event_at,created_by,request_json) values($1,$2,$3,'outbound','template','Old acknowledgement','sending',now(),$4,'{\"automationRule\":\"old-rule\"}')", [org, f.chat, sender, admin]), /Automatic screening is active/)
    assert.equal((await row(f.db, 'select status from whatsapp_screening_sessions')).status, 'active')
    assert.equal((await row(f.db, "select count(*)::int n from whatsapp_inbox_messages where body_text='Old acknowledgement'")).n, 0)
    await f.db.exec("create table whatsapp_automation_rules(id uuid primary key,config jsonb);create table whatsapp_automation_runs(id uuid primary key,organisation_id uuid,record_id uuid,rule_id uuid,status text,reason text,updated_at timestamptz);")
    await f.db.query("insert into whatsapp_automation_rules values($1,'{\"action\":\"message\",\"trigger\":\"new_lead\"}')", [id(810)])
    await f.db.query("insert into whatsapp_automation_runs(id,organisation_id,record_id,rule_id,status) values($1,$2,$3,$4,'queued')", [id(811), org, id(812), id(810)])
    await f.db.query("insert into leads(lead_id,organisation_id,contact_id,listing_id,lead_category) values($1,$2,$3,$4,'buyer')", [id(812), org, contact, listing])
    assert.equal((await row(f.db, 'select status from whatsapp_automation_runs')).status, 'skipped')
  } finally { await f.db.close() }
})

test('a committed enquiry wakes processing promptly and transport failure cannot lose the lead', async () => {
  const f = await setup()
  try {
    await f.db.exec(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
      insert into vault.decrypted_secrets values('arch9_project_url','https://fixture.supabase.test'),('arch9_service_role_key','fixture-server-key');
      create schema net;create table fixture_wakes(url text,headers jsonb);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into public.fixture_wakes values(url,headers);return 1;end;$$;
      grant insert on leads to authenticated;set role authenticated;`)
    await assert.rejects(f.db.query('select private.run_whatsapp_screening_worker()'), /permission denied/)
    await f.db.query("insert into leads(lead_id,organisation_id,contact_id,listing_id,lead_category) values($1,$2,$3,$4,'buyer')", [id(900), org, contact, listing])
    await f.db.exec('reset role')
    assert.equal((await row(f.db, 'select count(*)::int n from fixture_wakes')).n, 1)
    assert.equal((await row(f.db, 'select url from fixture_wakes')).url, 'https://fixture.supabase.test/functions/v1/whatsapp-screening-worker')
    await f.db.exec("create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin raise exception 'Fixture transport unavailable';end;$$; set role authenticated;")
    await f.db.query("insert into leads(lead_id,organisation_id,contact_id,listing_id,lead_category) values($1,$2,$3,$4,'buyer')", [id(901), org, contact, listing])
    await f.db.exec('reset role')
    assert.equal((await row(f.db, 'select count(*)::int n from leads where lead_id=$1', [id(901)])).n, 1)
    assert.equal((await row(f.db, 'select count(*)::int n from whatsapp_screening_sessions where lead_id=$1', [id(901)])).n, 1)
  } finally { await f.db.close() }
})


test('test-only screening enrols the nominated phone and leaves other enquiries untouched', async () => {
  const f = await setup('buyer', { deliveryMode: 'test', testPhone: '27821234567' })
  try {
    await f.db.query("insert into contacts values($1,$2,'Other','Applicant','27829876543')", [id(902), org])
    await f.db.query("insert into leads(lead_id,organisation_id,contact_id,listing_id,lead_category) values($1,$2,$3,$4,'buyer')", [id(903), org, id(902), listing])
    assert.equal((await row(f.db, 'select count(*)::int n from leads')).n, 2)
    assert.equal((await row(f.db, 'select count(*)::int n from whatsapp_screening_sessions')).n, 1)
    await f.worker()
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].body.to, '27821234567')
    await assert.rejects(f.db.query("update whatsapp_screening_profiles set config=config || '{\"deliveryMode\":\"test\",\"testPhone\":\"invalid\"}'::jsonb"), /international test/)
  } finally { await f.db.close() }
})

test('the worker and actual outbox both reject a contact outside the current test scope', async () => {
  const f = await setup('buyer', { deliveryMode: 'test', testPhone: '27821234567' })
  try {
    await f.db.query("update whatsapp_screening_profiles set config=jsonb_set(config,'{testPhone}','\"27829876543\"')")
    const packet = (await sqlClient(f.db).rpc('whatsapp_screening_next', {})).data
    assert.ok(packet.job)
    const dispatch = await sqlClient(f.db).rpc('whatsapp_screening_dispatch', { p_id: packet.job.id, p_token: packet.job.lease_token, p_state: { status: 'awaiting_start', answers: {}, current_key: null, body: 'Test opening' }, p_template: template })
    assert.match(dispatch.error.message, /Test-only screening/)
    await f.db.query("update whatsapp_screening_jobs set status='queued',lease_token=null,lease_until=null")
    await f.worker()
    assert.equal(f.calls.length, 0)
    assert.equal((await row(f.db, 'select status from whatsapp_screening_sessions')).status, 'blocked')
  } finally { await f.db.close() }
})
