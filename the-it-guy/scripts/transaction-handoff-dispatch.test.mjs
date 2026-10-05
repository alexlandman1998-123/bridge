import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandoffFixture } from './helpers/transaction-handoff-fixture.mjs'
const { db, owner, partner, other, matter, rp } = await createHandoffFixture()
const query=(sql,args=[])=>db.query(sql,args)
const lane=async(role='bond_originator')=>(await query('select * from transaction_handoffs where transaction_id=$1 and role_type=$2',[matter,role])).rows[0]
const claim=async()=> (await query('select * from claim_transaction_handoff_dispatch(25)')).rows
const prepare=async j=>(await query('select prepare_transaction_handoff_workspace($1,$2,$3) as data',[j.id,j.attempt_count,j.lease_token])).rows[0].data
const complete=async(j,status,provider=null,reason=null)=>(await query('select complete_transaction_handoff_dispatch($1,$2,$3,$4,$5,$6) as result',[j.id,j.attempt_count,j.lease_token,status,provider,reason])).rows[0].result
const freeze=async(j,payload)=>(await query('select freeze_transaction_handoff_email($1,$2,$3,$4) as payload',[j.id,j.attempt_count,j.lease_token,payload])).rows[0].payload
const due=async()=>query("update transaction_handoff_dispatch_jobs set next_attempt_at=now()-interval '1 second' where status='retry'")
try {
 assert.equal((await claim()).length,0,'pre-OTP and historical-ready work stay blocked')
 assert.equal((await query("select dispatch_reason from transaction_handoffs where transaction_id='20000000-0000-0000-0000-000000000099' and role_type='transfer_attorney'")).rows[0].dispatch_reason,'historical_delivery_review_required')
 await query(`update organisations set company_email='intake@betabond.co.za' where id=$1`,[partner])
 await query(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status) values ($1,$2,'bond_originator',$3,'selected')`,[rp,matter,partner])
 await query(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status) values (gen_random_uuid(),$1,'transfer_attorney',$2,'selected')`,[matter,other])
 await query("update transactions set onboarding_status='awaiting_signed_otp' where id=$1",[matter])
 assert.equal((await claim()).length,0)
 await query('begin')
 await query("update transactions set onboarding_status='signed_otp_received' where id=$1",[matter])
 assert.equal((await query("select count(*)::int as n from transaction_handoff_dispatch_jobs where status='queued'")).rows[0].n,2)
 await query('rollback');assert.equal((await claim()).length,0)
 await query("update transactions set onboarding_status='signed_otp_received' where id=$1",[matter])
 const before=(await lane()).dispatch_generation
 await query("update transactions set onboarding_status='signed_otp_received' where id=$1",[matter])
 assert.equal((await lane()).dispatch_generation,before)
 const work=await claim();assert.equal(work.length,2);assert.equal((await claim()).length,0)
 const bondId=(await lane()).id
 const bond=work.find(j=>j.handoff_id===bondId), attorney=work.find(j=>j.handoff_id!==bondId)
 assert.equal((await prepare(attorney)).reason,'attorney_firm_not_linked')
 assert.equal((await prepare(bond)).prepared,true)
 assert.equal((await query('select count(*)::int as n from transaction_bond_applications')).rows[0].n,1)
 assert.equal((await query('select count(*)::int as n from partner_portal_notifications')).rows[0].n,1)
 assert.ok((await lane()).workspace_prepared_at)
 assert.equal((await lane()).acceptance_status,'awaiting_receipt')
 const [email]=await claim();assert.equal(email.channel,'email')
 const payload={to:email.recipient_key,from:'Arch9 <no-reply@arch9.co.za>',subject:'Instruction',html:'Frozen body',idempotencyKey:`transaction-handoff:${email.id}`}
 assert.deepEqual(await freeze(email,payload),payload)
 assert.equal(await complete(email,'failed',null,'delivery_failed'),true)
 assert.equal((await lane()).delivery_status,'failed')
 await query("update transaction_handoff_dispatch_jobs set next_attempt_at=now()-interval '1 second' where id=$1",[email.id]);const [retry]=await claim();assert.equal(retry.id,email.id);assert.equal(retry.attempt_count,2)
 assert.deepEqual(await freeze(retry,{...payload,html:'Changed body'}),payload)
 assert.equal(await complete(email,'sent','obsolete-lease'),false)
 assert.equal(await complete(retry,'sent','provider-id'),true)
 assert.deepEqual((await query('select status from transaction_handoff_dispatch_attempts where job_id=$1 order by attempt',[email.id])).rows.map(r=>r.status),['failed','sent'])
 assert.equal((await lane()).delivery_status,'sent');assert.equal((await lane()).acceptance_status,'awaiting_receipt')
 assert.equal((await query("select count(*)::int as n from transaction_events where event_type='organisation_handoff_delivered'")).rows[0].n,1)
 assert.equal(await complete(retry,'sent','provider-id'),false)
 await query(`insert into attorney_firms values ('50000000-0000-0000-0000-000000000001',$1)`,[other])
 await query(`update organisations set company_email='   ' where id=$1`,[other])
 await query(`insert into organisation_users values ($1,null,'director@firm.co.za','active','director_partner','organisation',null),($1,null,'owner@firm.co.za','active','owner','workspace_hq',null),($1,null,'branch@firm.co.za','active','owner',null,gen_random_uuid())`,[other])
 await due();const [legal]=await claim();assert.equal((await prepare(legal)).prepared,true)
 assert.equal((await query('select count(*)::int as n from transaction_attorney_assignments')).rows[0].n,1)
 assert.equal((await query('select firm_acceptance_status from transaction_attorney_assignments')).rows[0].firm_acceptance_status,'awaiting_firm_acceptance')
 assert.equal((await query("select count(*)::int as n from queued_legal_notifications where event_type='attorney_instruction_ready'")).rows[0].n,0,'canonical instruction emails defer to the organisation queue')
 const legalEmails=await claim();assert.equal(legalEmails.length,2)
 const legalEmail=legalEmails.find(j=>j.recipient_key==='director@firm.co.za')
 const legalSuccess=legalEmails.find(j=>j.id!==legalEmail.id)
 assert.equal(await complete(legalSuccess,'sent','successful-recipient'),true)
 assert.equal(await complete(legalEmail,'failed',null,'delivery_failed'),true)
 assert.equal((await lane('transfer_attorney')).delivery_status,'failed')
 await due()
 const [legalRetry]=await claim();assert.equal(legalRetry.id,legalEmail.id,'successful recipients are never resent')
 await query("update transaction_handoff_dispatch_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[legalRetry.id])
 const [reclaimed]=await claim();assert.equal(reclaimed.id,legalEmail.id);assert.equal(reclaimed.attempt_count,3)
 assert.equal(await complete(legalEmail,'sent','stale'),false)
 await query('update transaction_role_players set assigned_organisation_id=$1 where transaction_id=$2 and role_type=$3',[partner,matter,'transfer_attorney'])
 assert.equal(await freeze(reclaimed,{to:reclaimed.recipient_key,idempotencyKey:`transaction-handoff:${reclaimed.id}`}),null)
 assert.equal(await complete(reclaimed,'sent','old-destination'),false)
 assert.equal((await lane('transfer_attorney')).nomination_status,'conflicting')
 // Missing contacts do not falsely complete; bounded retry exhaustion remains visible.
 const missing='20000000-0000-0000-0000-000000000010'
 await query("insert into transactions(id,organisation_id,finance_type,finance_managed_by,onboarding_status) values ($1,$2,'bond','bond_originator','signed_otp_received')",[missing,owner])
 await query('update organisations set company_email=null where id=$1',[partner])
 await query("insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status) values (gen_random_uuid(),$1,'bond_originator',$2,'selected')",[missing,partner])
 const [noContact]=await claim()
 assert.equal((await prepare(noContact)).reason,'organisation_contact_missing')
 assert.equal((await query('select dispatch_reason from transaction_handoffs where id=$1',[noContact.handoff_id])).rows[0].dispatch_reason,'organisation_contact_missing')
 await query("update transaction_handoff_dispatch_jobs set attempt_count=8,next_attempt_at=now()-interval '1 second' where id=$1",[noContact.id])
 assert.equal((await claim()).length,0)
 assert.equal((await query('select status from transaction_handoff_dispatch_jobs where id=$1',[noContact.id])).rows[0].status,'exhausted')
 // Accepted-but-unbound external invitations remain blocked, with no claimed mail.
 const external='20000000-0000-0000-0000-000000000011'
 await query("insert into transactions(id,organisation_id,finance_type,onboarding_status) values ($1,$2,'cash','signed_otp_received')",[external,owner])
 await query("insert into transaction_partner_invitations(id,transaction_id,role_type,company_name,email,status,expires_at) values (gen_random_uuid(),$1,'transfer_attorney','External Attorneys','external@firm.co.za','accepted',now()+interval '1 day')",[external])
 assert.equal((await claim()).length,0)
 assert.equal((await query("select dispatch_reason from transaction_handoffs where transaction_id=$1 and role_type='transfer_attorney'",[external])).rows[0].dispatch_reason,'accepted_invitation_not_bound')
 await query("update transaction_attorney_assignments set instruction_status='accepted',firm_acceptance_status='accepted'")
 assert.equal((await query("select count(*)::int as n from queued_legal_notifications where event_type='attorney_instruction_accepted'")).rows[0].n,1)
 // A failed preparation commit rolls back every dependent matter and inbox row.
 const interrupted='20000000-0000-0000-0000-000000000012'
 await query("insert into transactions(id,organisation_id,finance_type,finance_managed_by,onboarding_status) values ($1,$2,'bond','bond_originator','signed_otp_received')",[interrupted,owner])
 await query("update organisations set company_email='intake@betabond.co.za' where id=$1",[partner])
 await query("insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status) values (gen_random_uuid(),$1,'bond_originator',$2,'selected')",[interrupted,partner])
 const [preparationFailure]=await claim()
 await query("alter table transaction_handoff_dispatch_jobs add constraint test_preparation_failure check(channel<>'email') not valid")
 await assert.rejects(prepare(preparationFailure),/test_preparation_failure/)
 assert.equal((await query('select count(*)::int as n from transaction_bond_applications where transaction_id=$1',[interrupted])).rows[0].n,0)
 assert.equal((await query('select count(*)::int as n from transaction_partner_assignments where transaction_id=$1',[interrupted])).rows[0].n,0)
 await query('alter table transaction_handoff_dispatch_jobs drop constraint test_preparation_failure')
 await complete(preparationFailure,'failed',null,'delivery_failed')
 // Stop before the provider's deduplication window can expire.
 await query("update transaction_handoff_dispatch_jobs set status='retry',attempt_count=2,first_provider_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 second' where id=$1",[email.id])
 assert.equal((await claim()).length,0)
 assert.equal((await query('select reason from transaction_handoff_dispatch_jobs where id=$1',[email.id])).rows[0].reason,'delivery_confirmation_uncertain')
 await query('set role authenticated')
 await assert.rejects(query('select * from transaction_handoff_dispatch_jobs'),/permission denied/)
 await assert.rejects(query('select * from transaction_handoff_dispatch_attempts'),/permission denied/)
 await assert.rejects(query('select * from handoff_private.email_payloads'),/permission denied/)
 await assert.rejects(query('select * from claim_transaction_handoff_dispatch(10)'),/permission denied/)
 await query('reset role');assert.equal(await complete({...email,lease_token:null},'sent','fake'),false)
 // pg_cron/pg_net are represented by local stubs; exercise the real scheduler body.
 await db.exec(`create schema vault;create schema cron;create schema net;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table cron.jobs(id bigserial,name text,schedule text,command text);
 create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.jobs(name,schedule,command) values($1,$2,$3) returning id$$;
 create table net.requests(id bigserial,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into net.requests(url,headers,body,timeout_milliseconds) values($1,$2,$3,$4) returning id$$;`)
 const schedule=readFileSync(new URL('../../supabase/migrations/20261004080224_transaction_handoff_dispatch_schedule.sql',import.meta.url),'utf8').replace(/^create extension.*$/gm,'')
 await db.exec(schedule)
 assert.equal((await query('select handoff_private.run_dispatch() as result')).rows[0].result.reason,'vault_configuration_missing')
 assert.equal((await query('select count(*)::int as n from net.requests')).rows[0].n,0)
 await query("insert into vault.decrypted_secrets values ('arch9_project_url','https://local.example.test'),('arch9_service_role_key','local-test-only-key')")
 assert.equal((await query('select handoff_private.run_dispatch() as result')).rows[0].result.scheduled,true)
 assert.equal((await query('select body from net.requests')).rows[0].body.limit,10)
 assert.equal((await query('select schedule from cron.jobs')).rows[0].schedule,'* * * * *')
 console.log('Durable handoff dispatch: atomic source save, gates, independent preparation, retry, deduplication, leases, frozen payloads, receipts and access checks passed')
}finally{await db.close()}
