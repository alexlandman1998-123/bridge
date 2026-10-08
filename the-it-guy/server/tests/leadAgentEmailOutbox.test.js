import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHomeSeekersLeadDatabase, HOME_SEEKERS_LEAD_FIXTURE as f } from './fixtures/homeSeekersLeadDatabase.js'

const other = '33333333-3333-4333-8333-333333333333'
const migration = name => readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
async function database({ clientIntros = false } = {}) {
  const db = await createHomeSeekersLeadDatabase()
  await db.exec(`create table organisations(id uuid primary key);
    insert into organisations values('${f.org}'),('${other}');
    create table tasks(task_id uuid primary key default gen_random_uuid(),organisation_id uuid,lead_id uuid,title text,description text,due_date date,status text,priority text);
    alter table private_listings add column assigned_agent_email text,add column branch_id uuid,add column title text;
    alter table leads add column lead_type text,add column acknowledgement_status text,add column source_received_at timestamptz,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
    create table organisation_branches(id uuid,organisation_id uuid);
    create table meta_lead_ads_connections(id uuid,organisation_id uuid,page_id text,connection_status text);
    create table meta_lead_ads_forms(id uuid,organisation_id uuid,page_id text,form_id text,is_active boolean,lead_type text,branch_id uuid,assigned_agent_id uuid,form_name text);
    create table meta_lead_ads_imports(id uuid,organisation_id uuid,connection_id uuid,form_mapping_id uuid,status text);
    create table lead_ingestion_logs(log_id uuid,organisation_id uuid,source text,external_reference text,payload jsonb,status text,lead_id uuid,contact_id uuid,listing_id uuid,assigned_agent_id uuid,processed_at timestamptz);
    create table lead_listing_interests(organisation_id uuid,lead_id uuid,contact_id uuid,listing_id uuid,source text,status text,is_original_enquiry boolean);
    update private_listings set assigned_agent_email='agent@example.test',title='Fixture home';`)
  const pp = await migration('20261005064727_private_property_lead_channel_correction')
  await db.exec(pp.slice(pp.indexOf('create or replace function'), pp.indexOf('revoke all')))
  const meta = await migration('20260906175502_meta_lead_ads_backfill_foundation')
  await db.exec(meta.slice(meta.indexOf('create function public.meta_ingest_lead_ad('), meta.indexOf('revoke all on function public.meta_ingest_lead_ad')))
  await db.exec(await migration('20261008173528_durable_lead_agent_email_outbox'))
  if (clientIntros) await db.exec(await migration('20261008180125_durable_buyer_seller_lead_introductions'))
  return db
}
async function insert(db, source = 'Manual Entry', raw = {}, owner = f.agent, org = f.org) {
  return (await db.query(`insert into leads(organisation_id,assigned_user_id,assigned_agent_id,lead_domain,lead_category,lead_source,status,raw_enquiry_payload)
    values($1,$2,$2,'agency','buyer',$3,'New Lead',$4) returning lead_id`, [org, owner, source, JSON.stringify(raw)])).rows[0].lead_id
}
async function due(db) { await db.exec("update lead_agent_email_jobs set next_attempt_at=now()-interval '1 minute'") }
async function claim(db, limit = 25) { return (await db.query('select * from lead_agent_email_claim($1)', [limit])).rows }
async function complete(db, job, status, provider = null) {
  return db.query('select lead_agent_email_complete($1,$2,$3,$4,$5)', [job.id, job.claim_token, status, provider, status === 'failed' ? 'fixture failure' : null])
}

test('new lead entry points commit one job and historical or website paths retain their policies', async t => {
  const db = await database()
  try {
    for (const source of ['Manual Entry', 'Property24', 'Website', 'Digital business card', 'QR', 'Show Day']) await insert(db, source)
    const pp = (await db.query("select private_property_ingest_lead($1,'PP:fixture','Taylor Buyer','taylor@example.test',null,'Hello',$2,'{}') as id", [f.org,f.sale])).rows[0].id
    assert.equal((await db.query("select private_property_ingest_lead($1,'PP:fixture','Taylor Buyer','taylor@example.test',null,'Hello',$2,'{}') as id", [f.org,f.sale])).rows[0].id, pp)
    await db.query("insert into meta_lead_ads_connections values(gen_random_uuid(),$1,'page','connected')", [f.org])
    await db.query("insert into meta_lead_ads_forms values(gen_random_uuid(),$1,'page','form',true,'buyer',null,$2,'Buyer campaign')", [f.org,f.agent])
    const meta = (await db.query("select meta_ingest_lead_ad('meta-one',$1,'page','form','Meta Buyer','meta@example.test',null,'{}') as id",[f.org])).rows[0].id
    assert.equal((await db.query("select meta_ingest_lead_ad('meta-one',$1,'page','form','Meta Buyer','meta@example.test',null,'{}') as id",[f.org])).rows[0].id, meta)
    assert.equal((await db.query('select count(*)::int as n from lead_agent_email_jobs')).rows[0].n, 8)
    await t.test('rolled-back leads leave no alert jobs', async () => {
      await db.exec('begin;')
      await insert(db, 'Walk-in')
      await db.exec('rollback;')
      assert.equal((await db.query('select count(*)::int as n from lead_agent_email_jobs')).rows[0].n, 8)
    })
    const historical = await insert(db,'Property24',{arch9NotificationHistorical:true})
    const historicalMeta = await insert(db,'Facebook',{arch9_meta:{ingestion_source:'historical'}})
    const site = await insert(db,'Website')
    const event = (await db.query("insert into notification_events(organisation_id,lead_id,assigned_user_id,event_key,recipient_email) values($1,$2,$3,'new_enquiry_assigned_agent','agent@example.test') returning id",[f.org,site,f.agent])).rows[0].id
    await db.query("insert into website_lead_submissions(organisation_id,lead_id,notification_event_id) values($1,$2,$3)",[f.org,site,event])
    await due(db)
    const jobs = await claim(db)
    assert.equal(jobs.length, 8)
    assert.ok(jobs.every(row => row.payload_json.to==='agent@example.test'))
    for (const id of [historical,historicalMeta]) assert.equal((await db.query('select status from lead_agent_email_jobs where lead_id=$1',[id])).rows[0].status,'skipped')
    assert.equal((await db.query('select status from lead_agent_email_jobs where lead_id=$1',[site])).rows[0].status,'delegated')
    assert.equal((await claim(db)).length,0,'a second worker cannot claim leased jobs')
  } finally { await db.close() }
})

test('email retries freeze content, preserve keys, reject stale claims and recover final interrupted attempts', async () => {
  const db = await database()
  try {
    await insert(db)
    await due(db)
    const [job] = await claim(db)
    await assert.rejects(complete(db,job,'sent'),/acceptance/)
    const envelope = {to:'agent@example.test',from:'Arch9 <hello@example.test>',subject:'New lead',html:'<p>Hello</p>',text:'Hello'}
    await db.query('select lead_agent_email_freeze($1,$2,$3)',[job.id,job.claim_token,JSON.stringify(envelope)])
    await complete(db,job,'failed')
    assert.equal((await claim(db)).length,0,'backoff is respected')
    await due(db)
    const [retry] = await claim(db)
    assert.equal(retry.id,job.id)
    assert.deepEqual(retry.envelope_json,envelope)
    assert.notEqual(retry.claim_token,job.claim_token)
    await assert.rejects(complete(db,job,'sent','stale-result'),/claim/)
    assert.deepEqual((await db.query('select lead_agent_email_freeze($1,$2,$3) as value',[retry.id,retry.claim_token,JSON.stringify({...envelope,subject:'Changed'})])).rows[0].value,envelope)
    await db.exec("update lead_agent_email_jobs set attempts=8,lease_until=now()-interval '1 minute'")
    await claim(db)
    assert.equal((await db.query("select status from lead_agent_email_jobs where kind='agent'")).rows[0].status,'needs_attention')
    assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n,1)
    assert.equal((await db.query("select count(*)::int as n from lead_agent_email_jobs where kind='manager'")).rows[0].n,1)
  } finally { await db.close() }
})

test('missing, foreign and changed recipients route to management without losing the later agent alert', async () => {
  const db = await database()
  try {
    const id = await insert(db,'Private Property',{},null)
    await due(db)
    assert.equal((await claim(db)).length,0)
    const [manager] = await claim(db)
    assert.equal(manager.kind,'manager')
    assert.equal(manager.payload_json.to,'principal@example.test')
    await complete(db,manager,'sent','manager-provider-id')
    await db.query('update leads set assigned_user_id=$1,assigned_agent_id=$1 where lead_id=$2',[f.agent,id])
    await due(db)
    const [agent] = await claim(db)
    assert.equal(agent.kind,'agent')
    assert.equal(agent.payload_json.to,'agent@example.test')
    await complete(db,agent,'failed')
    await db.query("update organisation_users set status='inactive' where user_id=$1",[f.agent])
    await due(db)
    assert.equal((await claim(db)).length,0,'inactive frozen recipients cannot be emailed')
    assert.equal((await db.query("select status from lead_agent_email_jobs where kind='agent'")).rows[0].status,'needs_attention')
    const foreign = await insert(db,'Facebook',{},f.agent,other)
    await due(db)
    await claim(db); await claim(db)
    const rows = (await db.query('select * from lead_agent_email_jobs where lead_id=$1',[foreign])).rows
    assert.ok(rows.every(row=>!row.payload_json),'foreign agents and managers receive no data')
    assert.ok(rows.some(row=>row.status==='needs_attention'))
  } finally { await db.close() }
})

test('queue and worker functions are private; routing and retry expiry are explicit', async () => {
  const db = await database()
  try {
    for (const fn of ['lead_agent_email_claim(integer)','lead_agent_email_freeze(uuid,uuid,jsonb)','lead_agent_email_complete(uuid,uuid,text,text,text)','lead_agent_email_status(uuid,uuid)','lead_agent_email_website_agent_eligible(uuid,uuid,text)','lead_agent_email_reconcile_websites()','lead_agent_email_run_dispatcher()']) {
      for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') as allowed',[role,fn])).rows[0].allowed,false)
      assert.equal((await db.query('select has_function_privilege(\'service_role\',$1,\'execute\') as allowed',[fn])).rows[0].allowed,true)
    }
    for (const role of ['anon','authenticated']) assert.equal((await db.query("select has_table_privilege($1,'lead_agent_email_jobs','select') as allowed",[role])).rows[0].allowed,false)
    await insert(db,'Private Property',{arch9RentalLead:true,classification:'rental'})
    await due(db)
    const [job] = await claim(db)
    assert.equal(job.payload_json.rental,true)
    await complete(db,job,'failed')
    await db.exec("update lead_agent_email_jobs set first_attempt_at=now()-interval '24 hours',next_attempt_at=now() where kind='agent'")
    await claim(db)
    assert.equal((await db.query("select status from lead_agent_email_jobs where kind='agent'")).rows[0].status,'needs_attention')
    assert.equal((await db.query('select lead_agent_email_run_dispatcher() as result')).rows[0].result.reason,'vault_configuration_missing')
    await db.exec("insert into vault.decrypted_secrets values('arch9_project_url','https://fixture.test'),('arch9_service_role_key','fixture-key')")
    assert.equal((await db.query('select lead_agent_email_run_dispatcher() as result')).rows[0].result.scheduled,true)
    assert.equal((await db.query("select count(*)::int as n from cron.job where jobname='arch9-lead-agent-email-dispatcher-1m'")).rows[0].n,1)
  } finally { await db.close() }
})

test('real website capture preserves principal alerts and adds the missing sales and rental agent email', async () => {
  const db = await database()
  try {
    for (const listing of [f.sale,f.rental]) {
      await db.query("select website_capture_lead_submission($1,'property_enquiry',$2,null,'Website Buyer','visitor@example.test',null,'Please call',true,false,$3,null,'{}')",[f.host,listing,`website-agent-${listing}`])
    }
    await due(db)
    const jobs = await claim(db)
    assert.equal(jobs.length,2)
    assert.ok(jobs.every(job => job.kind==='agent' && job.payload_json.to==='agent@example.test'))
    assert.equal(jobs.filter(job=>job.payload_json.rental).length,1)
    assert.ok((await db.query('select * from notification_events')).rows.every(e=>e.event_key==='new_website_enquiry_principal' && e.assigned_user_id===f.principal))
    assert.equal((await db.query('select lead_agent_email_website_agent_eligible($1,$2,$3) as allowed',[f.org,jobs[0].lead_id,'agent@example.test'])).rows[0].allowed,true)
    assert.equal((await db.query('select lead_agent_email_website_agent_eligible($1,$2,$3) as allowed',[other,jobs[0].lead_id,'agent@example.test'])).rows[0].allowed,false)
    await db.query("update organisation_users set status='inactive' where user_id=$1",[f.agent])
    assert.equal((await db.query('select lead_agent_email_website_agent_eligible($1,$2,$3) as allowed',[f.org,jobs[0].lead_id,'agent@example.test'])).rows[0].allowed,false)
  } finally { await db.close() }
})

test('final interrupted website claims escalate once while old backlogs stay untouched', async () => {
  const db = await database()
  try {
    const lead = await insert(db,'Website')
    const event = (await db.query("insert into notification_events(organisation_id,lead_id,assigned_user_id,event_key,source,automation_key,channel,status,recipient_email) values($1,$2,$3,'new_enquiry_assigned_agent','agency_website','website_lead_received','email','processing','agent@example.test') returning id",[f.org,lead,f.agent])).rows[0].id
    await db.query("insert into website_lead_submissions(organisation_id,lead_id,notification_event_id,status,routing_json) values($1,$2,$3,'routed','{}')",[f.org,lead,event])
    await due(db); await claim(db)
    await db.query("update notification_events set dispatch_attempt_count=max_dispatch_attempts,last_dispatch_attempt_at=now()-interval '10 minutes' where id=$1",[event])
    assert.equal((await db.query('select lead_agent_email_reconcile_websites() as n')).rows[0].n,1)
    assert.equal((await db.query('select lead_agent_email_reconcile_websites() as n')).rows[0].n,0)
    assert.equal((await db.query('select status from notification_events where id=$1',[event])).rows[0].status,'failed')
    assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n,1)
    const [manager] = await claim(db)
    assert.equal(manager.kind,'manager')
    assert.equal(manager.payload_json.to,'principal@example.test')
    // A website can exhaust its own queue before the shared worker first runs.
    await db.query("update lead_agent_email_jobs set status='pending',attention_task_id=null where lead_id=$1 and kind='agent'",[lead])
    await db.query("update notification_events set metadata_json='{}' where id=$1",[event])
    assert.equal((await db.query('select lead_agent_email_reconcile_websites() as n')).rows[0].n,1)
    assert.equal((await db.query("select status from lead_agent_email_jobs where lead_id=$1 and kind='agent'",[lead])).rows[0].status,'needs_attention')
    await db.query('delete from lead_agent_email_jobs where lead_id=$1',[lead])
    await db.query("update notification_events set metadata_json='{}' where id=$1",[event])
    assert.equal((await db.query('select lead_agent_email_reconcile_websites() as n')).rows[0].n,0,'pre-release receipts are not replayed')
  } finally { await db.close() }
})

test('missing worker configuration surfaces overdue jobs once without cancelling delivery', async () => {
  const db = await database()
  try {
    await insert(db)
    await db.exec("update lead_agent_email_jobs set next_attempt_at=now()-interval '20 minutes'")
    for (let i=0;i<2;i++) assert.equal((await db.query('select lead_agent_email_run_dispatcher() as result')).rows[0].result.reason,'vault_configuration_missing')
    assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n,1)
    const [job] = await claim(db)
    assert.equal(job.status,'processing')
    await db.query("update organisation_users set status='inactive' where user_id=$1",[f.agent])
    await assert.rejects(db.query('select lead_agent_email_freeze($1,$2,$3)',[job.id,job.claim_token,JSON.stringify({to:job.payload_json.to,subject:'New lead',html:'<p>Hello</p>'})]),/no longer eligible/)
  } finally { await db.close() }
})

async function contact(db,email='client@example.test',org=f.org) {
  return (await db.query("insert into contacts(organisation_id,first_name,last_name,email) values($1,'Taylor','Client',$2) returning contact_id",[org,email])).rows[0].contact_id
}

test('buyer and seller intros commit independently of source and agent allocation', async () => {
  const db = await database({clientIntros:true})
  try {
    const person = await contact(db)
    const ids=[]
    for (const category of ['buyer','seller']) for (const source of ['Property24','Private Property','Website','Digital business card','QR','Show Day','Manual Entry','Facebook']) {
      const id=(await db.query("insert into leads(organisation_id,contact_id,lead_domain,lead_category,lead_source,status) values($1,$2,'agency',$3,$4,'New Lead') returning lead_id",[f.org,person,category,source])).rows[0].lead_id
      ids.push(id)
    }
    await due(db)
    const jobs=(await claim(db,100)).filter(row=>row.kind==='client_intro')
    assert.equal(jobs.length,16)
    assert.equal(new Set(jobs.map(row=>row.id)).size,16)
    assert.ok(jobs.every(row=>row.payload_json.to==='client@example.test' && !row.payload_json.agentEmail),'no agent is needed to send an intro')
    assert.equal(jobs.filter(row=>row.payload_json.enquiryKind==='seller').length,8)
    assert.equal(jobs.filter(row=>row.payload_json.enquiryKind==='sale').length,8)
    await db.exec('begin')
    await insert(db)
    await db.exec('rollback')
    assert.equal((await db.query("select count(*)::int as n from lead_agent_email_jobs where kind='client_intro'")).rows[0].n,16)
    for (const raw of [{arch9NotificationHistorical:true},{arch9_meta:{ingestion_source:'historical'}}]) {
      const id=await insert(db,'Property24',raw)
      assert.equal((await db.query("select status from lead_agent_email_jobs where lead_id=$1 and kind='client_intro'",[id])).rows[0].status,'skipped')
    }
  } finally { await db.close() }
})

test('real portal and website captures queue exactly one correctly classified client intro', async () => {
  const db = await database({clientIntros:true})
  try {
    const pp = (await db.query("select private_property_ingest_lead($1,'PP:intro','Portal Buyer','portal@example.test',null,'Hello',$2,'{}') as id",[f.org,f.sale])).rows[0].id
    await db.query("select private_property_ingest_lead($1,'PP:intro','Portal Buyer','portal@example.test',null,'Hello',$2,'{}')",[f.org,f.sale])
    await db.query("insert into meta_lead_ads_connections values(gen_random_uuid(),$1,'intro-page','connected')",[f.org])
    await db.query("insert into meta_lead_ads_forms values(gen_random_uuid(),$1,'intro-page','seller-form',true,'seller',null,$2,'Seller campaign')",[f.org,f.agent])
    const meta=(await db.query("select meta_ingest_lead_ad('meta-intro',$1,'intro-page','seller-form','Meta Seller','seller@example.test',null,'{}') as id",[f.org])).rows[0].id
    await db.query("select meta_ingest_lead_ad('meta-intro',$1,'intro-page','seller-form','Meta Seller','seller@example.test',null,'{}')",[f.org])
    for (const listing of [f.sale,f.rental]) await db.query("select website_capture_lead_submission($1,'property_enquiry',$2,null,'Website Buyer','website@example.test',null,'Please call',true,false,$3,null,'{}')",[f.host,listing,`intro-site-${listing}`])
    const page=(await db.query("select id from website_pages where page_kind='valuation' limit 1")).rows[0].id
    await db.query("select website_capture_lead_submission($1,'valuation_request',null,$2,'Website Seller','valuation@example.test',null,'Please value my property',true,false,'intro-valuation-123456',null,'{}')",[f.host,page])
    await due(db)
    const jobs=(await claim(db)).filter(row=>row.kind==='client_intro')
    assert.equal(jobs.length,5)
    assert.equal(jobs.find(row=>row.lead_id===pp).payload_json.enquiryKind,'sale')
    assert.equal(jobs.find(row=>row.lead_id===meta).payload_json.enquiryKind,'seller')
    assert.equal(jobs.filter(row=>row.payload_json.enquiryKind==='rental').length,1)
    assert.equal(jobs.filter(row=>row.payload_json.enquiryKind==='seller').length,2)
    assert.ok(jobs.every(row=>row.status==='processing'),'website client jobs must not delegate to principal alerts')
  } finally { await db.close() }
})

test('missing client emails create a task and correcting the saved contact wakes the intro', async () => {
  const db = await database({clientIntros:true})
  try {
    const person=await contact(db,null)
    const id=await insert(db)
    await db.query('update leads set contact_id=$1 where lead_id=$2',[person,id])
    await due(db); await claim(db)
    assert.equal((await db.query("select status from lead_agent_email_jobs where lead_id=$1 and kind='client_intro'",[id])).rows[0].status,'waiting_recipient')
    assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n,1)
    await db.query('update contacts set email=$1 where contact_id=$2',['fixed@example.test',person])
    const [job]=(await claim(db)).filter(row=>row.kind==='client_intro')
    assert.equal(job.payload_json.to,'fixed@example.test')
    const envelope={to:'fixed@example.test',from:'Arch9 <hello@example.test>',subject:'Intro',html:'<p>Hello</p>',text:'Hello'}
    await db.query('select lead_agent_email_freeze($1,$2,$3)',[job.id,job.claim_token,JSON.stringify(envelope)])
    await complete(db,job,'failed'); await due(db)
    const [retry]=(await claim(db)).filter(row=>row.kind==='client_intro')
    assert.deepEqual(retry.envelope_json,envelope)
    await db.query('update contacts set email=$1 where contact_id=$2',['different@example.test',person])
    await assert.rejects(db.query('select lead_agent_email_freeze($1,$2,$3)',[retry.id,retry.claim_token,JSON.stringify(envelope)]),/no longer eligible/)
    await complete(db,retry,'failed'); await due(db); await claim(db)
    assert.equal((await db.query('select status from lead_agent_email_jobs where id=$1',[job.id])).rows[0].status,'needs_attention')
    assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n,1,'reuse the existing follow-up task')
  } finally { await db.close() }
})

test('client intro queue is private and foreign contacts cannot supply recipients', async () => {
  const db=await database({clientIntros:true})
  try {
    for (const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'lead_client_intro_status(uuid,uuid)','execute') as allowed",[role])).rows[0].allowed,false)
    const foreign=await contact(db,'foreign@example.test',other)
    const id=await insert(db)
    await db.query('update leads set contact_id=$1 where lead_id=$2',[foreign,id])
    await due(db)
    assert.equal((await claim(db)).filter(row=>row.kind==='client_intro').length,0)
    const job=(await db.query("select * from lead_agent_email_jobs where lead_id=$1 and kind='client_intro'",[id])).rows[0]
    assert.equal(job.status,'waiting_recipient')
    assert.equal(job.payload_json,null)
  } finally { await db.close() }
})
