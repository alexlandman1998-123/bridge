import assert from 'node:assert/strict'
import { createEmailCampaignDatabase } from './fixtures/emailCampaignDatabase.mjs'
const { db, one, org, other, user, asUser, asService } = await createEmailCampaignDatabase()
let checks = 0
const equal = (value, expected) => { assert.deepEqual(value, expected); checks++ }
try {
 await asService()
 await db.query(`insert into email_sending_policies(organisation_id,approved_at) values($1,now())`, [org])
 const campaign = await one(`insert into email_campaigns(organisation_id,name,subject,status,created_by) values($1,'Fixture','News','sending',$2) returning id`, [org,user])
 await db.query(`insert into email_campaign_dispatch_jobs(organisation_id,campaign_id,run_at,status,attempts,last_error,lease_token) values($1,$2,now(),'queued',2,'Waiting for a prior provider response',gen_random_uuid())`, [org,campaign.id])
 const status = async () => (await one('select email_campaign_delivery_status($1) result', [campaign.id])).result
 await asUser()
 const report = await status()
 equal(report.state, 'queued'); equal(report.attempts, 2)
 assert.match(report.message, /sending capacity is unavailable/); checks++
 equal(Object.keys(report).sort(), ['attempts','message','nextAttemptAt','state','updatedAt'].sort())
 equal(await db.query(`select has_table_privilege('authenticated','public.email_campaign_dispatch_jobs','select') allowed`).then(r=>r.rows[0].allowed), false)
 await asService(); await db.query('update email_campaign_account_limits set enabled=true,daily_limit=100,monthly_limit=1000')
 await db.query('update email_sending_policies set manual_paused_at=now() where organisation_id=$1',[org])
 await asUser(); assert.match((await status()).message, /organisation has paused/); checks++
 await asService(); await db.query('update email_sending_policies set manual_paused_at=null where organisation_id=$1',[org])
 await asUser(); equal((await status()).message, 'Waiting for a prior provider response')
 await asService(); await db.query("update email_campaign_dispatch_jobs set status='failed',last_error='The sender is no longer verified.' where campaign_id=$1",[campaign.id])
 await asUser(); equal((await status()).message,'The sender is no longer verified.')
 await asService(); await db.query("update email_campaign_dispatch_jobs set status='completed' where campaign_id=$1",[campaign.id])
 await asUser(); equal((await status()).message,null)
 await asService(); await db.query('delete from email_campaign_dispatch_jobs where campaign_id=$1',[campaign.id])
 await asUser(); equal((await status()).state,'not_queued')
 await asUser(other); await assert.rejects(status(), /not available in your workspace/); checks++
 await db.exec("reset role; set role anon")
 await assert.rejects(status(), /permission denied/); checks++
 await asUser(); await db.exec("set request.jwt.claim.sub=''")
 await assert.rejects(status(), /not available in your workspace/); checks++
 await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user])
 await db.exec("create or replace function public.email_campaign_can_send(p_organisation_id uuid) returns boolean language sql as $$ select null::boolean $$")
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])
 await asUser(); await assert.rejects(status(), /not available in your workspace/); checks++
 console.log(`Campaign delivery diagnostics: ${checks} checks passed; no remote calls.`)
} finally { await db.close() }
