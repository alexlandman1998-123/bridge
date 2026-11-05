import assert from 'node:assert/strict'
import { createEmailCampaignDatabase } from './fixtures/emailCampaignDatabase.mjs'
const { db, one, org, other, user, asUser, asService, shared, reserve } = await createEmailCampaignDatabase()
let checks=0
const check=(value,expected=true)=>{assert.deepEqual(value,expected);checks++}
try {
 await asService(); await db.exec("update email_campaign_account_limits set enabled=true,daily_limit=100,monthly_limit=200")
 await db.query("select email_campaign_apply_platform_status('platform','verified',true)")
 await asUser(); const a=await shared(); await asUser(other); const b=await shared(other,'Second','office@second.co.za')
 await asService()
 const catA=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[org])
 const catB=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[other])
 await asService()
 const campaign=async(scope,sender,category)=>one("insert into email_campaigns(organisation_id,name,subject,created_by,sender_identity_id,subscription_type_id,status) values($1,'Campaign','News',$2,$3,$4,'sending') returning *",[scope,user,sender,category])
 const ca=await campaign(org,a.id,catA.id), cb=await campaign(other,b.id,catB.id)
 await assert.rejects(campaign(org,b.id,catA.id),/same organisation/);checks++
 await assert.rejects(campaign(org,a.id,catB.id),/same organisation/);checks++
 await assert.rejects(db.query('update email_campaigns set organisation_id=$1 where id=$2',[other,ca.id]),/cannot move/);checks++
 await assert.rejects(db.query("insert into email_campaign_recipients(organisation_id,campaign_id,email) values($1,$2,'wrong@example.test')",[other,ca.id]),/same organisation/);checks++
 const recipient=async(c)=>one("insert into email_campaign_recipients(organisation_id,campaign_id,email) values($1,$2,'person@example.test') returning *",[c.organisation_id,c.id])
 const ra=await recipient(ca),rb=await recipient(cb)
 for (const [scope,cat] of [[org,catA],[other,catB]]) {
  await db.query("insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status) values($1,'person@example.test','opted_in')",[scope])
  await db.query("insert into email_marketing_contacts(organisation_id,email) values($1,'person@example.test')",[scope])
  await db.query("insert into contact_email_subscriptions(organisation_id,email,subscription_type_id,status) values($1,'person@example.test',$2,'subscribed')",[scope,cat.id])
 }
 const prefA=await one('select * from contact_marketing_preferences where organisation_id=$1',[org])
 const apply=async(ids)=> (await one('select email_campaign_apply_preferences($1,$2) ok',[prefA.unsubscribe_token,ids])).ok
 await assert.rejects(apply([catB.id]),/this organisation/);checks++
 check((await one('select marketing_consent_status s from contact_marketing_preferences where id=$1',[prefA.id])).s,'opted_in')
 check(await apply([]))
 check((await one('select status from email_campaign_recipients where id=$1',[ra.id])).status,'unsubscribed')
 check((await one('select status from email_campaign_recipients where id=$1',[rb.id])).status,'queued')
 check((await one('select marketing_consent_status s from contact_marketing_preferences where organisation_id=$1',[other])).s,'opted_in')
 await db.query("update email_suppressions set reason='complaint' where organisation_id=$1",[org]);check(await apply([catA.id]))
 check((await one('select reason from email_suppressions where organisation_id=$1',[org])).reason,'complaint')
 // Force a downstream write failure: preference and categories must roll back.
 await db.exec("reset role; create function fail_preferences() returns trigger language plpgsql as $$ begin raise exception 'injected write failure'; end $$; create trigger fail_preferences before insert or update on email_suppressions for each row execute function fail_preferences(); set role service_role")
 await assert.rejects(apply([]),/injected/);checks++
 check((await one('select marketing_consent_status s from contact_marketing_preferences where id=$1',[prefA.id])).s,'opted_in')
 await db.exec('reset role; drop trigger fail_preferences on email_suppressions; set role service_role')
 // Tenant quota and pause changes cannot alter another organisation or a safety stop.
 await asUser(); await db.query('select email_campaign_set_controls($1,false,1)',[org])
 await assert.rejects(db.query('select email_campaign_set_controls($1,false,500)',[other]),/Not authorised/);checks++
 await assert.rejects(db.query('select email_campaign_set_controls($1,false,501)',[org]),/between 1 and 500/);checks++
 await asService();check(await reserve(org,a.id,'one'));check(await reserve(org,a.id,'two'),false)
 check(await reserve(other,b.id,'one'));check(await reserve(other,b.id,'one'))
 check(await reserve(other,a.id,'one'),false)
 await db.query('update email_sending_policies set paused_at=now() where organisation_id=$1',[org]);await asUser()
 await db.query('select email_campaign_set_controls($1,false,500)',[org]);await asService()
 check(Boolean((await one('select paused_at from email_sending_policies where organisation_id=$1',[org])).paused_at))
 check(await reserve(org,a.id,'safety'),false)
 await db.query('update email_sending_policies set paused_at=null where organisation_id=$1',[org])
 await asUser();await db.query('select email_campaign_set_controls($1,true,500)',[org]);await asService()
 check(await reserve(org,a.id,'manual'),false);check(await reserve(other,b.id,'unaffected'))
 await asUser();await db.query('select email_campaign_set_controls($1,false,500)',[org]);await asService()
 await db.exec('update email_campaign_account_limits set daily_limit=3')
 check(await reserve(org,a.id,'global-cap'),false)
 await db.exec('update email_campaign_account_limits set daily_limit=100,monthly_limit=3')
 check(await reserve(org,a.id,'monthly-cap'),false)
 await db.exec('update email_campaign_account_limits set monthly_limit=200,enabled=false')
 check(await reserve(org,a.id,'disabled'),false)
 await db.exec('update email_campaign_account_limits set enabled=true')
 // An old queued reservation needs a new day's allocation, including retries.
 await db.exec('reset role');await db.query("update email_send_reservations set budget_reserved_at=now()-interval '2 days' where organisation_id=$1 and reservation_key='one'",[org]);await asService()
 await db.exec('update email_campaign_account_limits set daily_limit=2')
 check(await reserve(org,a.id,'one'),false)
 await db.exec('update email_campaign_account_limits set daily_limit=100')
 check(await reserve(org,a.id,'one'))
 // Cross-campaign event/revision links cannot borrow another organisation.
 await assert.rejects(db.query("insert into email_campaign_revisions(organisation_id,campaign_id,snapshot) values($1,$2,'{}')",[org,cb.id]),/same organisation/);checks++
 await assert.rejects(db.query("insert into email_events(organisation_id,campaign_id,recipient_id,event_type) values($1,$2,$3,'clicked')",[org,ca.id,rb.id]),/same organisation/);checks++
 // Fair queue order and exclusive leases across an organisation.
 for(const c of [ca,cb])await db.query('insert into email_campaign_dispatch_jobs(organisation_id,campaign_id,run_at) values($1,$2,now())',[c.organisation_id,c.id])
 const claim=async()=>one('select * from email_campaign_claim_dispatch_jobs(1)')
 await db.query("update email_sending_policies set last_dispatch_at=case when organisation_id=$1 then now()-interval '2 hours' else now()-interval '1 hour' end",[org])
 const turnA=await claim();check(turnA.organisation_id,org)
 await db.query("update email_campaign_dispatch_jobs set status='queued',locked_at=null,lease_token=null where id=$1",[turnA.id])
 const turnB=await claim();check(turnB.organisation_id,other)
 await db.exec("update email_campaign_dispatch_jobs set status='queued',locked_at=null,lease_token=null")
 const first=await claim(); check(Boolean(first.id)); const second=await claim();check(second.organisation_id!==first.organisation_id)
 assert.equal(await claim(),undefined);checks++
 const jb=[first,second].find(j=>j.organisation_id===other)
 check(await reserve(other,b.id,`recipient:${rb.id}`))
 const prepare=async()=> (await one('select email_campaign_prepare_send($1,$2,$3,$4) result',[jb.id,jb.lease_token,rb.id,JSON.stringify({to:[rb.email],from:'fixed'})])).result
 check((await prepare()).action,'send')
 await db.exec('reset role');await db.query("update email_campaign_send_attempts set first_attempt_at=now()-interval '2 days' where recipient_id=$1",[rb.id]);await asService()
 check((await prepare()).action,'send') // Quota/rate waiting has never attempted HTTP.
 const slot=async()=> (await one('select email_campaign_acquire_send_slot($1,$2,$3,$4,null,$5,$6,$7) result',[other,b.id,`recipient:${rb.id}`,rb.email,rb.id,jb.id,jb.lease_token])).result
 check((await slot()).action,'send');check((await slot()).action,'wait')
 await db.query('select email_campaign_provider_backoff(120)');check((await slot()).action,'wait')
 await db.exec('reset role');await db.query("update email_campaign_send_attempts set provider_attempted_at=now()-interval '24 hours' where recipient_id=$1",[rb.id]);await asService()
 check((await prepare()).action,'review')
 await db.exec('update email_campaign_account_limits set blocked_until=null,next_request_at=null')
 // Withdrawn consent is checked again after payload preparation.
 const extra=await one("insert into email_campaign_recipients(organisation_id,campaign_id,email) values($1,$2,'withdrawn@example.test') returning *",[other,cb.id])
 check(await reserve(other,b.id,`recipient:${extra.id}`))
 await db.query('select email_campaign_prepare_send($1,$2,$3,$4)',[jb.id,jb.lease_token,extra.id,JSON.stringify({to:[extra.email]})])
 check((await one('select email_campaign_acquire_send_slot($1,$2,$3,$4,null,$5,$6,$7) result',[other,b.id,`recipient:${extra.id}`,extra.email,extra.id,jb.id,jb.lease_token])).result.action,'skip')
 check((await one('select status from email_campaign_recipients where id=$1',[extra.id])).status,'suppressed')
 // Signed provider safety is account-wide; a tenant unsubscribe stays local.
 await db.query("select email_campaign_accept_send($1,'provider-b','{}')",[rb.id])
 await db.query("select email_campaign_record_provider_event('signed-complaint','provider-b','email.complained','{}')")
 check((await one('select count(*)::int n from email_campaign_provider_blocks')).n,1)
 await db.exec('update email_campaign_account_limits set blocked_until=null,next_request_at=null')
 check(await reserve(org,a.id,'test:block'))
 // A test reservation is actor-bound, separate from campaign reservations.
 check((await one('select email_campaign_acquire_send_slot($1,$2,$3,$4) result',[org,a.id,'test:block','person@example.test']).catch(()=>({result:{action:'rejected'}}))).result.action,'rejected')
 await db.query('select email_reserve_send($1,$2,$3,$4,true)',[org,a.id,'test:real',user])
 check((await one('select email_campaign_acquire_send_slot($1,$2,$3,$4,$5) result',[org,a.id,'test:real','person@example.test',user])).result.action,'blocked')
 // Click recording validates both bearer tokens and is atomic with its state.
 const clicked=await one("insert into email_campaign_recipients(organisation_id,campaign_id,email,status,sent_at) values($1,$2,'tracking@example.test','sent',now()) returning *",[org,ca.id])
 const localLink=await one("insert into email_campaign_links(organisation_id,campaign_id,target_url) values($1,$2,'https://agency.test/home') returning *",[org,ca.id])
 const foreignLink=await one("insert into email_campaign_links(organisation_id,campaign_id,target_url) values($1,$2,'https://other.test/home') returning *",[other,cb.id])
 const click=async(token=localLink.tracking_token,recipientToken=clicked.tracking_token)=>(await one('select email_campaign_record_click($1,$2,$3) target',[token,clicked.id,recipientToken])).target
 check(await click(foreignLink.tracking_token),null);check(await click(localLink.tracking_token,'wrong-token'),null)
 await db.exec("reset role; create function fail_click() returns trigger language plpgsql as $$ begin raise exception 'injected click failure'; end $$; create trigger fail_click before update on email_campaign_recipients for each row execute function fail_click(); set role service_role")
 await assert.rejects(click(),/injected click failure/);checks++
 check((await one('select count(*)::int n from email_events where recipient_id=$1',[clicked.id])).n,0)
 await db.exec('reset role; drop trigger fail_click on email_campaign_recipients; set role service_role')
 check(await click(),'https://agency.test/home')
 check((await one('select status from email_campaign_recipients where id=$1',[clicked.id])).status,'clicked')
 await db.exec('update email_campaign_account_limits set daily_limit=0')
 await asUser();check((await one('select email_campaign_controls_status($1) result',[org])).result.account_ready,false)
 await assert.rejects(click(),/permission denied/);checks++
 await asService();await db.exec('update email_campaign_account_limits set daily_limit=100')
 // Library and contact visibility remains isolated even for the same email.
 await db.query("insert into email_templates(organisation_id,name,html,created_by) values($1,'A','<p>A</p>',$3),($2,'B','<p>B</p>',$3)",[org,other,user])
 for(const scope of [org,other]) {
  const id=(await one('select gen_random_uuid() id')).id
  await db.query("insert into email_campaign_assets(id,organisation_id,original_name,mime_type,byte_size,storage_path) values($1,$2,'image.png','image/png',8,$3)",[id,scope,`organisations/${scope}/${id}.png`])
 }
 await asUser()
 check((await one('select count(*)::int n from email_templates')).n,1)
 check((await one('select count(*)::int n from email_campaign_assets')).n,1)
 check((await one('select count(*)::int n from contact_marketing_preferences')).n,1)
 check((await one('select count(*)::int n from email_marketing_contacts')).n,1)
 const ownStatus=await one('select email_campaign_controls_status($1) result',[org]);check(ownStatus.result.reserved_today>=1)
 await assert.rejects(db.query('select email_campaign_controls_status($1)',[other]),/Not authorised/);checks++
 await assert.rejects(db.query('update email_sending_policies set paused_at=null'),/permission denied/);checks++
 await assert.rejects(db.query('select * from email_campaign_account_limits'),/permission denied/);checks++
 await assert.rejects(db.query('select * from email_campaign_provider_blocks'),/permission denied/);checks++
 await assert.rejects(db.query('select email_campaign_apply_preferences($1,$2)',[prefA.unsubscribe_token,[]]),/permission denied/);checks++
 // The same user created both campaigns; removed membership must defeat creator access.
 check((await one('select count(*)::int n from email_campaigns')).n,1)
 await db.query("select set_config('test.org','',false)")
 check((await one('select count(*)::int n from email_campaigns')).n,0)
 console.log(`Organisation isolation database checks passed: ${checks} assertions, two organisations, atomic preferences, ownership, quotas, pauses, fair leases, shared rate slots, provider safety and removed membership.`)
} finally { await db.close() }
