import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export async function runHandoffRecoveryChecks({ db, owner, partner, another, user }) {
  const q = (sql, args = []) => db.query(sql, args)
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261004085417_transaction_handoff_operator_recovery.sql', import.meta.url),'utf8'))
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261006071528_handoff_queue_canonical_authority.sql', import.meta.url),'utf8'))
  const tx=(await q(`insert into transactions(id,organisation_id,finance_type,finance_managed_by,onboarding_status) values(gen_random_uuid(),$1,'bond','bond_originator','signed_otp_received') returning id`,[owner])).rows[0].id
  await q(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status,assignment_status) values(gen_random_uuid(),$1,'bond_originator',$2,'active','active')`,[tx,partner])
  const h=(await q("select * from transaction_handoffs where transaction_id=$1 and role_type='bond_originator'",[tx])).rows[0]
  const job=(await q("select * from transaction_handoff_dispatch_jobs where handoff_id=$1 and channel='workspace' and generation=$2",[h.id,h.dispatch_generation])).rows[0]
  await q("update transaction_handoff_dispatch_jobs set status='exhausted',reason='retries_exhausted',attempt_count=8 where id=$1",[job.id])
  await q('select handoff_private.refresh_dispatch($1)',[h.id])
  await q("select set_config('test.uid',$1,false)",[user])
  const request=(await q('select gen_random_uuid() id')).rows[0].id
  const recover=async (action='retry',id=request,generation=h.dispatch_generation)=> (await q('select bridge_recover_transaction_handoff($1,$2,$3,$4,$5) result',[h.id,generation,action,'Reviewed the current instruction and destination',id])).rows[0].result
  assert.equal((await recover()).code,'organisation_authority_required','partner membership alone cannot recover agency instructions')
  await q(`insert into organisation_users(organisation_id,user_id,status,role,scope_level) values($1,$2,'active','owner','workspace_hq')`,[owner,user])
  await q("update organisation_users set scope_level='branch' where organisation_id=$1 and user_id=$2",[owner,user])
  assert.equal((await recover()).success,false)
  await q("update organisation_users set scope_level='workspace_hq' where organisation_id=$1 and user_id=$2",[owner,user])
  assert.equal((await recover('retry',request,Number(h.dispatch_generation)+1)).code,'handoff_changed')
  await q("alter table transaction_events add constraint injected_recovery_failure check(event_type<>'organisation_handoff_recovery_requested')")
  await assert.rejects(recover(),/injected_recovery_failure/)
  assert.equal((await q('select status,max_attempts from transaction_handoff_dispatch_jobs where id=$1',[job.id])).rows[0].status,'exhausted')
  assert.equal((await q('select count(*)::int n from handoff_private.recovery_decisions')).rows[0].n,0)
  await q('alter table transaction_events drop constraint injected_recovery_failure')
  const result=await recover()
  assert.equal(result.success,true,JSON.stringify({result,h,current:(await q('select * from transaction_handoffs where id=$1',[h.id])).rows[0]}))
  const register=(await q('select bridge_read_transaction_handoffs($1) result',[tx])).rows[0].result
  assert.equal(register.items.find(item=>item.id===h.id).last_recovery.reason,'Reviewed the current instruction and destination')
  assert.deepEqual(await recover(),result,'lost-response resumption is idempotent')
  assert.equal((await recover('release_review')).code,'request_conflict')
  assert.equal((await q('select max_attempts from transaction_handoff_dispatch_jobs where id=$1',[job.id])).rows[0].max_attempts,12)
  const claimed=(await q('select * from claim_transaction_handoff_dispatch(25)')).rows.find(j=>j.id===job.id)
  assert.ok(claimed,'extended allowance is used by the real worker claim function')
  await q("update transaction_handoff_dispatch_jobs set status='exhausted',reason='delivery_confirmation_uncertain',first_provider_attempt_at=now()-interval '24 hours',lease_token=null,lease_expires_at=null where id=$1",[job.id])
  await q('select handoff_private.refresh_dispatch($1)',[h.id])
  assert.equal((await recover('retry',(await q('select gen_random_uuid() id')).rows[0].id)).success,false)
  // A reviewed historical hold releases existing jobs, preserving a sent email receipt.
  await q("update transaction_handoff_dispatch_jobs set status='blocked',reason='historical_delivery_review_required',first_provider_attempt_at=null where id=$1",[job.id])
  await q(`insert into transaction_handoff_dispatch_jobs(handoff_id,generation,channel,recipient_key,destination_organisation_id,status,provider_id) values($1,$2,'email','already-sent',$3,'sent','preserved-receipt')`,[h.id,h.dispatch_generation,partner])
  await q('select handoff_private.refresh_dispatch($1)',[h.id])
  assert.equal((await recover('release_review',(await q('select gen_random_uuid() id')).rows[0].id)).success,true)
  assert.equal((await q("select provider_id from transaction_handoff_dispatch_jobs where handoff_id=$1 and status='sent'",[h.id])).rows[0].provider_id,'preserved-receipt')
  await q(`insert into transaction_bond_applications(transaction_id,application_type,bank_name,status,assigned_organisation_id,assignment_status,assigned_user_id,metadata) values($1,'originator_intake','Intake','pending',$2,'fully_assigned',$3,'{"buyerDraft":"preserve"}')`,[tx,partner,user])
  // Reviewing cannot move a progressed bank application to the replacement.
  await q(`insert into transaction_bond_applications(transaction_id,application_type,bank_name,status,assigned_organisation_id,assignment_status) values($1,'bank_application','Bank','submitted',$2,'fully_assigned')`,[tx,partner])
  await q('update transaction_role_players set assigned_organisation_id=$1 where transaction_id=$2 and role_type=\'bond_originator\'',[another,tx])
  const changed=(await q('select * from transaction_handoffs where id=$1',[h.id])).rows[0]
  const reviewRequest=(await q('select gen_random_uuid() id')).rows[0].id
  assert.equal((await recover('release_review',reviewRequest,changed.dispatch_generation)).code,'existing_finance_owner_required')
  await q('update transaction_role_players set assigned_organisation_id=$1 where transaction_id=$2 and role_type=\'bond_originator\'',[partner,tx])
  const restored=(await q('select * from transaction_handoffs where id=$1',[h.id])).rows[0]
  assert.equal((await recover('release_review',reviewRequest,restored.dispatch_generation)).success,true)
  assert.equal((await q("select assigned_organisation_id,status from transaction_bond_applications where transaction_id=$1 and application_type='bank_application'",[tx])).rows[0].assigned_organisation_id,partner)
  const intake=(await q("select assigned_user_id,assignment_status,metadata from transaction_bond_applications where transaction_id=$1 and application_type='originator_intake'",[tx])).rows[0]
  assert.deepEqual(intake,{assigned_user_id:user,assignment_status:'fully_assigned',metadata:{buyerDraft:'preserve'}})
  await q('set role authenticated')
  await assert.rejects(q('select * from handoff_private.recovery_decisions'),/permission denied/)
  await q('reset role');await q('set role anon')
  await assert.rejects(recover(),/permission denied/)
  await q('reset role')
  console.log('Handoff recovery: organisation authority, bounded retries, worker claim, source fencing, private audit, atomic rollback, receipt preservation and finance ownership checks passed')
}
