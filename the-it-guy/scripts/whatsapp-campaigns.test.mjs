import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildTemplateMessage, normalizePhone, previewTemplate, templateFields, templateIdentity } from '../../supabase/functions/_shared/whatsappCampaign.js'
import { applyWhatsAppCampaignWebhook } from '../../supabase/functions/_shared/whatsappCampaignWebhook.js'
import { createCampaignWorker } from '../../supabase/functions/whatsapp-campaign-worker/worker.js'
import { authorizeCampaignWorker } from '../../supabase/functions/whatsapp-campaign-worker/authorization.js'
import { createCampaignHandler } from '../../supabase/functions/whatsapp-campaigns/handler.js'
const template = { id: '123', name: 'new_listing', status: 'APPROVED', category: 'MARKETING', language: 'en_US', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hi {{1}}, view {{2}}.' }, { type: 'FOOTER', text: 'Reply STOP to opt out.' }, { type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+27123456789' }, { type: 'URL', text: 'View property', url: 'https://example.com/listings/{{1}}' }] }] }
const values = { 'header.media': { text: 'https://example.com/home.jpg' }, 'body.1': { source: 'first_name' }, 'body.2': { text: 'our new home' }, 'button.1': { text: 'home-1' } }
const contact = { phone: '+27 82 123 4567', full_name: 'Alex Buyer' }
test('Meta payload preserves language, media, ordered parameters and zero-based button index', () => {
  assert.deepEqual(buildTemplateMessage(template, values, contact), { messaging_product: 'whatsapp', recipient_type: 'individual', to: '27821234567', type: 'template', template: { name: 'new_listing', language: { code: 'en_US' }, components: [{ type: 'header', parameters: [{ type: 'image', image: { link: 'https://example.com/home.jpg' } }] }, { type: 'body', parameters: [{ type: 'text', text: 'Alex' }, { type: 'text', text: 'our new home' }] }, { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'home-1' }] }] } })
  assert.equal(previewTemplate(template, values, contact), 'Hi Alex, view our new home.\n\nReply STOP to opt out.')
})
test('named parameters retain their exact names', () => {
  const t = { ...template, language: 'en', components: [{ type: 'BODY', text: 'Hello {{customer_name}}' }] }
  assert.deepEqual(buildTemplateMessage(t, { 'body.customer_name': { source: 'full_name' } }, contact).template.components[0].parameters, [{ type: 'text', text: 'Alex Buyer', parameter_name: 'customer_name' }])
})
test('blocks unapproved, unsupported, missing variables and unsafe media', () => {
  assert.throws(() => buildTemplateMessage({ ...template, status: 'PAUSED' }, values, contact), /approve/)
  assert.throws(() => buildTemplateMessage(template, { ...values, 'body.1': { text: '' } }, contact), /Body · 1/)
  assert.throws(() => buildTemplateMessage(template, { ...values, 'header.media': { text: 'http://127.0.0.1/a' } }, contact), /HTTPS/)
  assert.throws(() => buildTemplateMessage(template, { ...values, 'body.1': { text: 'one\ntwo' } }, contact), /single line/)
  assert.ok(templateFields({ ...template, components: [{ type: 'CAROUSEL' }] }).unsupported.length)
  assert.ok(templateFields({ ...template, category: 'AUTHENTICATION' }).unsupported.length)
})
test('static templates and phone validation', () => {
  assert.equal(buildTemplateMessage({ ...template, components: [{ type: 'BODY', text: 'Hello there' }] }, {}, contact).template.components, undefined)
  assert.equal(normalizePhone('082 123 4567'), '27821234567')
  assert.equal(normalizePhone('+44 7700 900123'), '447700900123')
  for (const value of ['abc123', '+0001234567', '123', '0821234567ext2']) assert.equal(normalizePhone(value), '')
})
test('unauthenticated/inactive/foreign users cannot access data or Meta', async () => {
  let touched = false
  const handler = createCampaignHandler({ db: { from() { touched = true; throw Error('no') } }, authorize: async () => null, meta: async () => { touched = true } })
  for (const action of ['workspace', 'templates', 'save', 'save_contact', 'opt_out', 'preflight', 'prepare', 'dispatch', 'resume', 'pause', 'cancel', 'detail']) await assert.rejects(handler({ organisationId: '00000000-0000-0000-0000-000000000001', action }, ''), /active membership/)
  assert.equal(touched, false)
})
test('PostgreSQL tenant isolation, atomic prepare, claims, opt-outs and callback ordering', async () => {
  const db = new PGlite()
  const org = '00000000-0000-0000-0000-000000000001', other = '00000000-0000-0000-0000-000000000002', sender = '00000000-0000-0000-0000-000000000003', cid = '00000000-0000-0000-0000-000000000004', c1 = '00000000-0000-0000-0000-000000000005', c2 = '00000000-0000-0000-0000-000000000006'
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create table auth.users(id uuid primary key); create table organisations(id uuid primary key); create function bridge_is_active_member(target_org uuid) returns boolean language sql as $$select target_org = current_setting('test.org',true)::uuid$$; create table organisation_communication_channels(id uuid primary key, organisation_id uuid, connection_status text, channel_type text, provider text, phone_number_id text, waba_id text);`)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260913134659_whatsapp_campaigns.sql', import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261018082522_whatsapp_campaign_background_delivery.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into organisations values ('${org}'),('${other}'); insert into organisation_communication_channels values ('${sender}','${org}','connected','whatsapp','meta','100','200'); insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone,consent_status,consent_source,consent_at) values ('${c1}','${org}','Alex','27821234567','opted_in','Registration form',now()),('${c2}','${org}','Pat','27821234568','opted_in','Registration form',now()); insert into whatsapp_campaigns(id,organisation_id,name,sender_id,contact_ids) values ('${cid}','${org}','Test campaign','${sender}',array['${c1}','${c2}']::uuid[]);`)
    const msgs = [{ contact_id: c1, payload: { to: '27821234567' } }, { contact_id: c2, payload: { to: '27821234568' } }]
    const prepare = (rev, messages = msgs) => db.query('select whatsapp_campaign_prepare($1,$2,$3,$4,$5)', [cid, org, rev, JSON.stringify(template), JSON.stringify(messages)])
    await assert.rejects(prepare(2), /changed/)
    await assert.rejects(prepare(1, [msgs[0], { ...msgs[1], payload: { to: 'wrong' } }]), /phone changed/)
    assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_recipients')).rows[0].n, 0)
    await prepare(1); await prepare(1)
    assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_recipients')).rows[0].n, 2)
    const recipients = (await db.query('select * from whatsapp_campaign_recipients order by phone')).rows
    const rid = recipients[0].id
    const claim = (id, organisation = org) => db.query('select * from whatsapp_campaign_claim($1,$2)', [id, organisation])
    assert.equal((await claim(rid, other)).rows.length, 0)
    assert.equal((await claim(rid)).rows.length, 1)
    assert.equal((await claim(rid)).rows.length, 0)
    await db.query("update whatsapp_marketing_contacts set consent_status='opted_out',opted_out_at=now() where id=$1", [c2])
    assert.equal((await claim(recipients[1].id)).rows.length, 0)
    assert.equal((await db.query('select status from whatsapp_campaign_recipients where id=$1', [recipients[1].id])).rows[0].status, 'skipped')
    const callback = (status, phone = '100', mid = 'wamid.test') => db.query('select whatsapp_campaign_status($1,$2,$3,$4,$5,now(),$6) ok', [mid, `arch9-wa:${rid}`, phone, '200', status, 'Example failure'])
    assert.equal((await callback('read', '999')).rows[0].ok, false)
    await callback('read'); await callback('sent'); await callback('delivered'); await callback('failed'); await callback('read')
    const delivered = (await db.query('select * from whatsapp_campaign_recipients where id=$1', [rid])).rows[0]
    assert.equal(delivered.status, 'read'); assert.ok(delivered.read_at); assert.ok(delivered.delivered_at); assert.equal(delivered.error_message, null)
    assert.equal((await callback('sent', '100', 'wamid.other')).rows[0].ok, false)
    const performance = (await db.query('select * from whatsapp_campaign_performance')).rows[0]
    assert.equal(performance.display_status, 'partial'); assert.equal(performance.delivered, 1); assert.equal(performance.read, 1); assert.equal(performance.skipped, 1)
    await db.exec(`set role authenticated; set test.org='${other}';`)
    assert.equal((await db.query('select * from whatsapp_campaign_performance')).rows.length, 0)
    assert.equal((await db.query('select * from whatsapp_marketing_contacts')).rows.length, 0)
    await assert.rejects(db.query("update whatsapp_campaigns set name='forged'"), /permission denied/)
    await assert.rejects(db.query('select whatsapp_campaign_claim($1,$2)', [rid, org]), /permission denied/)
    await db.exec(`set test.org='${org}';`)
    assert.equal((await db.query('select * from whatsapp_campaign_performance')).rows.length, 1)
  } finally { await db.close() }
})

test('Meta comparison survives JSONB key ordering', () => {
  const reorder = (value) => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k,reorder(v)])) : value
  assert.equal(templateIdentity(template), templateIdentity(reorder(template)))
  assert.notEqual(templateIdentity(template), templateIdentity({ ...template, language: 'en' }))
})

test('worker authentication rejects users, missing/ambiguous headers and unconfigured keys', async () => {
  const credentials = { legacy: 'service-jwt', secrets: ['sb_secret_worker'] }
  const allowed = (headers) => authorizeCampaignWorker(new Request('https://example.com/worker', { headers }), credentials)
  for (const headers of [{}, { authorization: 'Bearer user-jwt' }, { apikey: 'anon-key' }, { authorization: 'Basic service-jwt' }, { apikey: 'service-jwt', authorization: 'Bearer user-jwt' }, { authorization: 'Bearer sb_secret_worker' }, { apikey: 'sb_secret_other' }]) assert.equal(await allowed(headers), false)
  for (const headers of [{ authorization: 'Bearer service-jwt' }, { apikey: 'service-jwt', authorization: 'Bearer service-jwt' }, { apikey: 'sb_secret_worker' }]) assert.equal(await allowed(headers), true)
  assert.equal(await authorizeCampaignWorker(new Request('https://example.com/worker', { headers: { apikey: 'something' } }), { legacy: '' }), false)
})

test('PostgreSQL schedules, cancellation, lease expiry and browser roles cannot bypass delivery controls', async () => {
  const db = new PGlite()
  const org = '00000000-0000-0000-0000-000000000021', other = '00000000-0000-0000-0000-000000000022', sender = '00000000-0000-0000-0000-000000000023', cid = '00000000-0000-0000-0000-000000000024', person = '00000000-0000-0000-0000-000000000025'
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create table auth.users(id uuid primary key); create table organisations(id uuid primary key); create function bridge_is_active_member(target_org uuid) returns boolean language sql as $$select target_org=current_setting('test.org',true)::uuid$$; create table organisation_communication_channels(id uuid primary key,organisation_id uuid,connection_status text,channel_type text,provider text,phone_number_id text,waba_id text);`)
    // Exercise the actual scheduling SQL using inert local pg_cron/pg_net/Vault
    // contracts. These fake keys and request rows never leave this database.
    await db.exec(`create schema cron; create table cron.job(jobname text primary key,schedule text,command text); create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job values($1,$2,$3) on conflict(jobname) do update set schedule=$2,command=$3 returning 1::bigint$$;
      create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text); insert into vault.decrypted_secrets values('arch9_project_url','https://project.example'),('arch9_service_role_key','fake-service-jwt');
      create schema net; create table public.worker_requests(id bigint generated always as identity,url text,headers jsonb,body jsonb,timeout_milliseconds integer); create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into public.worker_requests(url,headers,body,timeout_milliseconds) values($1,$2,$3,$4) returning id$$;`)
    for (const file of ['20260913134659_whatsapp_campaigns.sql', '20261018082522_whatsapp_campaign_background_delivery.sql']) await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    const cron = (await db.query('select * from cron.job')).rows
    assert.deepEqual(cron, [{jobname:'whatsapp-campaign-worker',schedule:'* * * * *',command:'select private.run_whatsapp_campaign_worker();'}])
    await db.exec(`insert into organisations values ('${org}'),('${other}'); insert into organisation_communication_channels values ('${sender}','${org}','connected','whatsapp','meta','100','200'); insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone,consent_status,consent_source,consent_at) values ('${person}','${org}','Scheduled Buyer','27821234567','opted_in','Form',now()); insert into whatsapp_campaigns(id,organisation_id,name,sender_id,contact_ids,scheduled_at) values ('${cid}','${org}','Future campaign','${sender}',array['${person}']::uuid[],now()+interval '1 hour');`)
    const enqueue = () => db.query('select whatsapp_campaign_enqueue($1,$2,1,$3,$4)', [cid,org,JSON.stringify(template),JSON.stringify([{ contact_id: person, payload: { to: '27821234567' } }])])
    await db.exec("update whatsapp_campaigns set scheduled_at=now()-interval '1 minute'")
    await assert.rejects(enqueue(), /future sending time/)
    assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_recipients')).rows[0].n, 0)
    await db.exec("update whatsapp_campaigns set scheduled_at=now()+interval '1 hour'")
    await enqueue(); await enqueue()
    assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_jobs')).rows[0].n, 1, 'a repeated confirmation creates one job')
    const rid = (await db.query('select id from whatsapp_campaign_recipients')).rows[0].id
    const claimJobs = () => db.query('select * from whatsapp_campaign_jobs_claim(3)')
    const claim = (token = null) => db.query('select * from whatsapp_campaign_claim($1,$2,$3)', [rid,org,token])
    const control = (action, targetOrg = org) => db.query('select whatsapp_campaign_job_control($1,$2,$3)', [cid,targetOrg,action])
    assert.equal((await claimJobs()).rows.length, 0, 'future campaigns never start early')
    await db.query('select private.run_whatsapp_campaign_worker()')
    assert.equal((await db.query('select count(*)::int n from worker_requests')).rows[0].n, 0)
    assert.equal((await claim()).rows.length, 0, 'legacy browser claims cannot bypass a future schedule')
    assert.equal((await db.query('select display_status,sent_at from whatsapp_campaign_performance')).rows[0].display_status, 'scheduled')
    assert.equal((await db.query('select sent_at from whatsapp_campaigns')).rows[0].sent_at, null)
    await assert.rejects(control('cancel',other), /Confirm/)
    await control('pause'); await control('resume')
    assert.equal((await claimJobs()).rows.length, 0, 'resuming a future schedule preserves its time')
    await db.exec("update whatsapp_campaign_jobs set scheduled_for=now()-interval '1 minute'")
    await db.query('select private.run_whatsapp_campaign_worker()')
    const request = (await db.query('select * from worker_requests')).rows[0]
    assert.equal(request.url, 'https://project.example/functions/v1/whatsapp-campaign-worker')
    assert.equal(request.headers.apikey, 'fake-service-jwt')
    assert.equal(request.headers.Authorization, 'Bearer fake-service-jwt')
    assert.equal(request.timeout_milliseconds, 90000)
    await db.exec("update vault.decrypted_secrets set decrypted_secret='sb_secret_fake' where name='arch9_service_role_key'")
    await db.query('select private.run_whatsapp_campaign_worker()')
    const opaque = (await db.query('select * from worker_requests order by id desc limit 1')).rows[0]
    assert.equal(opaque.headers.apikey, 'sb_secret_fake')
    assert.equal(opaque.headers.Authorization, undefined)
    const first = (await claimJobs()).rows[0]
    assert.ok(first.lease_token)
    assert.equal((await claimJobs()).rows.length, 0, 'another worker cannot take an active lease')
    assert.equal((await claim()).rows.length, 0, 'an active lease also blocks tokenless claims')
    await control('pause')
    assert.equal((await claim(first.lease_token)).rows.length, 0, 'pausing invalidates the worker lease')
    await control('resume')
    const second = (await claimJobs()).rows[0]
    assert.notEqual(second.lease_token, first.lease_token)
    await db.exec("update whatsapp_campaign_jobs set lease_until=now()-interval '1 second'")
    assert.equal((await claim(second.lease_token)).rows.length, 0, 'expired workers cannot send')
    const third = (await claimJobs()).rows[0]
    await db.query('select whatsapp_campaign_job_finish($1,$2,$3,$4)',[cid,org,second.lease_token,'stale failure'])
    assert.equal((await db.query('select status from whatsapp_campaign_jobs')).rows[0].status, 'running', 'an old worker cannot finish or pause a new lease')
    await control('cancel')
    assert.equal((await claim(third.lease_token)).rows.length, 0)
    assert.equal((await claimJobs()).rows.length, 0)
    assert.equal((await db.query('select status from whatsapp_campaign_recipients')).rows[0].status, 'skipped')
    assert.equal((await db.query('select display_status from whatsapp_campaign_performance')).rows[0].display_status, 'cancelled')
    await assert.rejects(control('resume'), /finished/)
    const interrupted = '00000000-0000-0000-0000-000000000026'
    await db.query('insert into whatsapp_campaigns(id,organisation_id,name,sender_id,contact_ids) values ($1,$2,$3,$4,$5)', [interrupted,org,'Interrupted after claim',sender,[person]])
    await db.query('select whatsapp_campaign_enqueue($1,$2,1,$3,$4)', [interrupted,org,JSON.stringify(template),JSON.stringify([{ contact_id: person, payload: { to: '27821234567' } }])])
    const interruptedJob = (await claimJobs()).rows[0]
    const interruptedRecipient = (await db.query('select id from whatsapp_campaign_recipients where campaign_id=$1',[interrupted])).rows[0].id
    await db.query('select * from whatsapp_campaign_claim($1,$2,$3)',[interruptedRecipient,org,interruptedJob.lease_token])
    await db.exec("update whatsapp_campaign_jobs set lease_until=now()-interval '1 second' where status='running'; update whatsapp_campaign_recipients set attempted_at=now()-interval '4 minutes' where status='processing'")
    assert.equal((await claimJobs()).rows.length, 0, 'a crashed last attempt is never automatically retried')
    assert.equal((await db.query('select display_status from whatsapp_campaign_performance where id=$1',[interrupted])).rows[0].display_status, 'needs_attention')
    await db.exec(`set role authenticated; set test.org='${other}';`)
    assert.equal((await db.query('select * from whatsapp_campaign_jobs')).rows.length, 0)
    assert.equal((await db.query('select * from whatsapp_campaign_performance')).rows.length, 0)
    await assert.rejects(claimJobs(), /permission denied/)
    await assert.rejects(control('resume'), /permission denied/)
    await assert.rejects(db.query("update whatsapp_campaign_jobs set status='queued'"), /permission denied/)
    await assert.rejects(db.query('select private.run_whatsapp_campaign_worker()'), /permission denied/)
    await db.exec(`set test.org='${org}';`)
    assert.equal((await db.query('select * from whatsapp_campaign_performance')).rows.length, 2)
  } finally { await db.close() }
})

// Small PostgREST adapter for exercising the real handler against isolated SQL.
// It implements only query operations used by the campaign handler in this test.
function sqlClient(db) {
  return {
    rpc: async (name, args) => {
      try { const names = Object.keys(args); const values = Object.values(args).map((v) => v && typeof v === 'object' ? JSON.stringify(v) : v); const rows = (await db.query(`select * from ${name}(${names.map((key, i) => `${key} => $${i + 1}`).join(',')})`, values)).rows; return { data: rows, error: null } } catch (error) { return { data: null, error } }
    },
    from: (table) => {
      let columns = '*', filters = [], values = [], mutation = null, mode = '', limit = '', offset = ''
      const bind = (v) => { values.push(v); return `$${values.length}` }
      const query = {
        select(c = '*') { columns = c; return query },
        eq(k, v) { filters.push(`${k} = ${bind(v)}`); return query },
        neq(k, v) { filters.push(`${k} <> ${bind(v)}`); return query },
        or(filter) { assert.ok(filter.startsWith('consent_at.is.null,consent_at.lte.')); filters.push(`(consent_at is null or consent_at <= ${bind(filter.split('.lte.')[1])})`); return query },
        in(k, vs) { filters.push(`${k} in (${vs.map(bind).join(',')})`); return query },
        order() { return query },
        limit(n) { limit = ` limit ${Number(n)}`; return query },
        range(a, b) { limit = ` limit ${b - a + 1}`; offset = ` offset ${a}`; return query },
        single() { mode = 'single'; return query },
        maybeSingle() { mode = 'maybe'; return query },
        update(patch) { mutation = Object.entries(patch).map(([k, v]) => `${k}=${bind(v)}`).join(','); return query },
        async then(resolve, reject) {
          try {
            const where = filters.length ? ` where ${filters.join(' and ')}` : ''
            const sql = mutation ? `update ${table} set ${mutation}${where} returning ${columns}` : `select ${columns} from ${table}${where}${limit}${offset}`
            const rows = (await db.query(sql, values)).rows
            if (mode === 'single' && rows.length !== 1) throw new Error('Expected one row')
            return resolve({ data: mode ? rows[0] || null : rows, error: null })
          } catch (error) { return resolve({ data: null, error }) }
        },
      }
      return query
    },
  }
}
test('browser closes after prepare: worker leases prevent duplicates, lost responses stay uncertain and invalid templates pause delivery', async () => {
  const db = new PGlite()
  const org = '00000000-0000-0000-0000-000000000011', sender = '00000000-0000-0000-0000-000000000012', cid = '00000000-0000-0000-0000-000000000013', c1 = '00000000-0000-0000-0000-000000000014', c2 = '00000000-0000-0000-0000-000000000015'
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create table auth.users(id uuid primary key); create table organisations(id uuid primary key); create function bridge_is_active_member(target_org uuid) returns boolean language sql as $$select true$$; create table organisation_communication_channels(id uuid primary key, organisation_id uuid, connection_status text, channel_type text, provider text, phone_number_id text, waba_id text, meta_access_token text);`)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260913134659_whatsapp_campaigns.sql', import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261018082522_whatsapp_campaign_background_delivery.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into organisations values ('${org}'); insert into organisation_communication_channels values ('${sender}','${org}','connected','whatsapp','meta','100','200','test-token'); insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone,consent_status,consent_source,consent_at) values ('${c1}','${org}','Alex','27821234567','opted_in','Form',now()),('${c2}','${org}','Pat','27821234568','opted_in','Form',now());`)
    await db.query('insert into whatsapp_campaigns(id,organisation_id,name,sender_id,contact_ids,template,parameter_values) values ($1,$2,$3,$4,$5,$6,$7)', [cid, org, 'Live flow test', sender, [c1,c2], JSON.stringify(template), JSON.stringify(values)])
    let sent = [], paused = false
    const meta = async (_connection, path, payload) => {
      if (path.includes('message_templates')) return { data: [{ ...template, status: paused ? 'PAUSED' : 'APPROVED' }] }
      sent.push(payload)
      if (payload.to.endsWith('8')) throw Error('timeout after request')
      return { messages: [{ id: `wamid.${payload.to}` }] }
    }
    const client = sqlClient(db)
    const handler = createCampaignHandler({ db: client, authorize: async () => 'test-user', meta })
    const worker = createCampaignWorker({ db: client, meta })
    const call = (action, extra = {}) => handler({ organisationId: org, campaignId: cid, action, ...extra }, 'Bearer test')
    await assert.rejects(call('preflight', { revision: 99 }), /draft changed/)
    assert.equal((await call('preflight', { revision: 1 })).recipients, 2)
    await call('prepare', { revision: 1 })
    assert.equal(sent.length, 0, 'preparing a campaign never sends from the browser')
    await Promise.all([worker(), worker()])
    assert.equal(sent.length, 2)
    assert.ok(sent.every((p) => p.biz_opaque_callback_data.startsWith('arch9-wa:')))
    assert.deepEqual((await db.query('select status from whatsapp_campaign_recipients order by phone')).rows.map((r) => r.status), ['sent','unknown'])
    await assert.rejects(call('resume'), /finished/)
    assert.equal(sent.length, 2, 'resume never retries a sent or uncertain recipient')
    assert.equal((await db.query('select display_status from whatsapp_campaign_performance')).rows[0].display_status, 'needs_attention')
    await worker()
    assert.equal(sent.length, 2, 'worker restart never retries uncertain sends')
    const next = '00000000-0000-0000-0000-000000000016'
    await db.query('insert into whatsapp_campaigns(id,organisation_id,name,sender_id,contact_ids,template,parameter_values) values ($1,$2,$3,$4,$5,$6,$7)', [next, org, 'Paused template', sender, [c1], JSON.stringify(template), JSON.stringify(values)])
    await call('prepare', { campaignId: next, revision: 1 })
    paused = true
    const outcome = await worker()
    assert.equal(outcome.paused, 1)
    const pausedRow = (await db.query('select * from whatsapp_campaign_performance where id=$1',[next])).rows[0]
    assert.equal(pausedRow.display_status, 'paused')
    assert.match(pausedRow.delivery_error, /no longer approved/)
    assert.equal(sent.length, 2)
    paused = false
    await call('resume', { campaignId: next })
    await db.query("update whatsapp_marketing_contacts set consent_status='opted_out',opted_out_at=now() where id=$1", [c1])
    await worker()
    assert.equal(sent.length, 2, 'revoked consent is checked again by the server worker')
    assert.equal((await db.query('select skipped from whatsapp_campaign_performance where id=$1',[next])).rows[0].skipped, 1)
    await db.query("update whatsapp_marketing_contacts set consent_status='opted_in',opted_out_at=null where id=$1", [c1])
    const legacy = '00000000-0000-0000-0000-000000000017'
    await db.query('insert into whatsapp_campaigns(id,organisation_id,name,sender_id,contact_ids,template,parameter_values) values ($1,$2,$3,$4,$5,$6,$7)', [legacy,org,'Historical unfinished campaign',sender,[c1,c2],JSON.stringify(template),JSON.stringify(values)])
    await db.query('select whatsapp_campaign_prepare($1,$2,1,$3,$4)',[legacy,org,JSON.stringify(template),JSON.stringify([{contact_id:c1,payload:buildTemplateMessage(template,values,{phone:'27821234567',full_name:'Alex'})},{contact_id:c2,payload:buildTemplateMessage(template,values,{phone:'27821234568',full_name:'Pat'})}])])
    await worker()
    assert.equal(sent.length, 2, 'historical campaigns are not automatically enqueued')
    await assert.rejects(call('dispatch', {campaignId:legacy}), /background/)
    const smallWorker = createCampaignWorker({ db: client, meta, deliveryOptions: { limit: 1 } })
    await smallWorker()
    assert.equal(sent.length, 3, 'explicit resume hands historical recipients to the worker')
    assert.equal((await db.query('select queued from whatsapp_campaign_performance where id=$1',[legacy])).rows[0].queued, 1)
    await smallWorker()
    assert.equal(sent.length, 4, 'another server tick continues the unfinished batch without any browser request')
    await smallWorker()
    assert.equal(sent.length, 4, 'a completed batch is never replayed')
    const timestamp = Math.floor(Date.now() / 1000) + 5
    const stop = { entry: [{ id: '200', changes: [{ value: { metadata: { phone_number_id: '100' }, messages: [{ from: '27821234567', text: { body: 'STOP' }, timestamp: String(timestamp) }] } }] }] }
    await applyWhatsAppCampaignWebhook(sqlClient(db), stop)
    assert.equal((await db.query('select consent_status from whatsapp_marketing_contacts where id=$1', [c1])).rows[0].consent_status, 'opted_out')
    await applyWhatsAppCampaignWebhook(sqlClient(db), stop)
    await db.query("update whatsapp_marketing_contacts set consent_status='opted_in',opted_out_at=null,consent_at=$1 where id=$2", [new Date((timestamp + 60) * 1000).toISOString(), c1])
    await applyWhatsAppCampaignWebhook(sqlClient(db), stop)
    assert.equal((await db.query('select consent_status from whatsapp_marketing_contacts where id=$1', [c1])).rows[0].consent_status, 'opted_in', 'an old STOP retry cannot undo a later, explicit opt-in')
  } finally { await db.close() }
})
