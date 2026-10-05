import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export async function runHandoffRetirementChecks({ db, owner, partner, other, matter, user, pending, attorney, another }) {
  const query = (sql, args = []) => db.query(sql, args)
  const sql = file => readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url), 'utf8')
  await db.exec(`
alter table transaction_role_players add column partner_connection_id uuid,add column assigned_by uuid;
alter table transaction_partner_assignments add column partner_connection_id uuid,add column assigned_person_id uuid,add column assigned_queue_id text,add column created_by uuid,add column onboarding_invite_id uuid,add column portal_token text default gen_random_uuid()::text,add column cancelled_at timestamptz,add column updated_at timestamptz;
alter table transaction_bond_applications add column assigned_user_id uuid;
create function bridge_transaction_scope_is_internal_user() returns boolean language sql stable as $$select false$$;
create function bridge_can_access_bond_application_scope(uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.transaction_bond_applications a where a.id=$1 and (a.assigned_user_id=auth.uid() or exists(select 1 from public.organisation_users u where u.organisation_id=a.assigned_organisation_id and u.user_id=auth.uid() and u.status='active')))$$;
create function bridge_lookup_partner_portal_by_token(text) returns jsonb language sql security definer as $$select jsonb_build_object('success',exists(select 1 from public.transaction_partner_assignments where portal_token=$1))$$;
create function bridge_activate_partner_portal_onboarding(text,jsonb default '{}') returns jsonb language plpgsql security definer as $$begin update public.transaction_partner_assignments set assignment_status='active' where portal_token=$1;return jsonb_build_object('success',found);end$$;
create table partner_portal_comments(id uuid primary key default gen_random_uuid(),transaction_partner_assignment_id uuid,content text);
alter table partner_portal_comments enable row level security;
create policy alternate_portal_access on partner_portal_comments for all to authenticated using(true) with check(true);
grant select,insert,update on partner_portal_comments to authenticated;
alter table transaction_attorney_assignments enable row level security;
create policy alternate_attorney_access on transaction_attorney_assignments for select to authenticated using(true);
grant select on transaction_attorney_assignments to authenticated;
alter table transactions enable row level security;
create policy baseline_transaction_access on transactions for select to authenticated using(bridge_can_access_transaction_spine(id));
grant select on transactions to authenticated;
alter table transaction_bond_applications enable row level security;
create policy alternate_bond_access on transaction_bond_applications for select to authenticated using(true);
grant select on transaction_bond_applications to authenticated;
`)
  await db.exec(sql('20260916125643_transaction_partner_workspace_assignment_handoff.sql'))
  await db.exec(sql('20261004083851_transaction_handoff_assignment_retirement.sql'))
  await query("select set_config('test.matter_access','true',false)")
  const oldActor='40000000-0000-0000-0000-000000000002'
  await query(`insert into auth.users values($1,'old@partner.co.za',now())`,[oldActor])
  await query(`insert into organisation_users(organisation_id,user_id,email,status,role,scope_level) values($1,$2,'old@partner.co.za','active','owner','workspace_hq')`,[partner,oldActor])
  const oldPortal=(await query("select portal_token from transaction_partner_assignments where transaction_id=$1 and partner_role='bond_originator' and partner_organisation_id=$2",[matter,partner])).rows[0].portal_token
  const oldAssignment=(await query('select id from transaction_partner_assignments where portal_token=$1',[oldPortal])).rows[0].id
  await query("insert into partner_portal_comments(transaction_partner_assignment_id,content) values($1,'Keep original comment')",[oldAssignment])
  const intake=(await query("select * from transaction_bond_applications where transaction_id=$1 and application_type='originator_intake'",[matter])).rows[0]
  await query('update transaction_bond_applications set metadata=$1 where id=$2',[{persistedBuyerDraft:'keep this data'},intake.id])
  const claimed=(await query('select * from claim_transaction_handoff_dispatch(25)')).rows
  const sent=claimed.find(j=>j.channel==='email' && j.handoff_id===intake.metadata.handoffId)
  assert.ok(sent,'the original email job is claimed before retirement')
  if(sent) await query("select complete_transaction_handoff_dispatch($1,$2,$3,'sent','prior-provider-receipt')",[sent.id,sent.attempt_count,sent.lease_token])
  await query(`insert into transaction_user_access(transaction_id,user_id,access_role,created_by_invitation_id) values($1,$2,'bond_originator',$3)`,[matter,oldActor,pending.id])
  await query("select set_config('test.uid',$1,false)",[oldActor])
  assert.equal((await query('select bridge_can_access_transaction_spine($1) allowed',[matter])).rows[0].allowed,true)
  // A failed source change must restore the old grants and native ownership.
  await query('begin')
  await query("update transaction_role_players set partner_organisation_id=$1 where transaction_id=$2 and role_type='bond_originator'",[another,matter])
  await query('rollback')
  assert.equal((await query('select count(*)::int n from transaction_user_access where user_id=$1 and transaction_id=$2',[oldActor,matter])).rows[0].n,1)
  assert.equal((await query('select assigned_organisation_id from transaction_bond_applications where id=$1',[intake.id])).rows[0].assigned_organisation_id,partner)
  await query("update transaction_role_players set partner_organisation_id=$1 where transaction_id=$2 and role_type='bond_originator'",[another,matter])
  const moved=(await query('select * from transaction_bond_applications where id=$1',[intake.id])).rows[0]
  assert.equal(moved.assigned_organisation_id,another);assert.equal(moved.assignment_status,'organisation_queue')
  assert.deepEqual(moved.metadata,{persistedBuyerDraft:'keep this data'})
  assert.equal((await query('select count(*)::int n from transaction_user_access where user_id=$1 and transaction_id=$2',[oldActor,matter])).rows[0].n,0)
  assert.equal((await query('select count(*)::int n from handoff_private.retired_access_grants where user_id=$1',[oldActor])).rows[0].n,1)
  assert.equal((await query('select bridge_can_access_transaction_spine($1) allowed',[matter])).rows[0].allowed,false)
  assert.equal((await query('select bridge_can_access_bond_application_scope($1) allowed',[intake.id])).rows[0].allowed,false)
  await query('set role authenticated')
  assert.equal((await query('select * from partner_portal_comments where transaction_partner_assignment_id=$1',[oldAssignment])).rows.length,0)
  await assert.rejects(query("insert into partner_portal_comments(transaction_partner_assignment_id,content) values($1,'stale write')",[oldAssignment]),/row-level security/)
  assert.equal((await query('select id from transactions where id=$1',[matter])).rows.length,0,'the policy retains its original function OID but now denies the old partner')
  await assert.rejects(query('select * from handoff_private.retired_access_grants'),/permission denied/)
  await query('reset role')
  assert.equal((await query('select bridge_lookup_partner_portal_by_token($1) result',[oldPortal])).rows[0].result.code,'partner_assignment_retired')
  assert.equal((await query("select bridge_activate_partner_portal_onboarding($1,'{}') result",[oldPortal])).rows[0].result.code,'partner_assignment_retired')
  assert.equal((await query('select bridge_get_partner_handoff_invitation($1) result',[pending.invitation_token])).rows[0].result.reason,'superseded')
  assert.equal((await query("select bridge_accept_transaction_partner_invitation($1,'{}',$2) result",[pending.invitation_token,partner])).rows[0].result.success,false)
  if(sent) assert.equal((await query('select provider_id from transaction_handoff_dispatch_jobs where id=$1',[sent.id])).rows[0].provider_id,'prior-provider-receipt')
  // An independent, manually granted lane survives the targeted retirement.
  await query("insert into transaction_user_access(transaction_id,user_id,access_role) values($1,$2,'developer')",[matter,oldActor])
  assert.equal((await query('select bridge_can_access_transaction_spine($1) allowed',[matter])).rows[0].allowed,true)
  await query("delete from transaction_user_access where transaction_id=$1 and user_id=$2 and access_role='developer'",[matter,oldActor])
  assert.equal((await query('select content from partner_portal_comments where transaction_partner_assignment_id=$1',[oldAssignment])).rows[0].content,'Keep original comment')
  // Attorney records and firm receipt remain as history while the live lane ends.
  await query("select set_config('test.uid',$1,false)",[user])
  const legal=(await query('select * from transaction_attorney_assignments where transaction_id=$1',[attorney.transaction_id])).rows[0]
  await query("update transaction_attorney_assignments set firm_acceptance_status='accepted' where id=$1",[legal.id])
  await query("update transaction_role_players set status='removed',assignment_status='removed',removed_at=now() where transaction_id=$1 and role_type='transfer_attorney'",[attorney.transaction_id])
  assert.equal((await query('select assignment_status,firm_acceptance_status from transaction_attorney_assignments where id=$1',[legal.id])).rows[0].assignment_status,'removed')
  assert.equal((await query('select firm_acceptance_status from transaction_attorney_assignments where id=$1',[legal.id])).rows[0].firm_acceptance_status,'accepted')
  assert.equal((await query("select count(*)::int n from transaction_partner_assignments where transaction_id=$1 and partner_role='transfer_attorney' and assignment_status='active'",[attorney.transaction_id])).rows[0].n,0)
  assert.ok((await query('select count(*)::int n from handoff_private.retired_native_records where transaction_id=$1',[attorney.transaction_id])).rows[0].n>0)
  await query(`insert into organisation_users(organisation_id,user_id,status,role,scope_level) values($1,$2,'active','owner','workspace_hq')`,[other,oldActor])
  await query("select set_config('test.uid',$1,false)",[oldActor])
  await query('set role authenticated')
  assert.equal((await query('select id from transaction_attorney_assignments where id=$1',[legal.id])).rows.length,0)
  await query('reset role')
  await query("select set_config('test.uid',$1,false)",[user])
  // Progressed finance is retained; changing nomination cannot silently move it.
  const progressed=(await query(`insert into transactions(id,organisation_id,finance_type,finance_managed_by,onboarding_status) values(gen_random_uuid(),$1,'bond','bond_originator','signed_otp_received') returning id`,[owner])).rows[0].id
  await query(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status,assignment_status) values(gen_random_uuid(),$1,'bond_originator',$2,'active','active')`,[progressed,partner])
  const bank=(await query(`insert into transaction_bond_applications(transaction_id,application_type,bank_name,status,assigned_organisation_id,assignment_status,metadata) values($1,'bank_application','Bank','submitted',$2,'fully_assigned','{"original":"preserve"}') returning id`,[progressed,partner])).rows[0].id
  await query(`insert into transaction_bond_applications(transaction_id,application_type,bank_name,status,assigned_organisation_id,assignment_status) values($1,'originator_intake','Intake','pending',$2,'organisation_queue')`,[progressed,partner])
  await query("update transaction_role_players set assigned_organisation_id=$1 where transaction_id=$2 and role_type='bond_originator'",[another,progressed])
  const review=(await query("select * from transaction_handoffs where transaction_id=$1 and role_type='bond_originator'",[progressed])).rows[0]
  assert.equal(review.assignment_cleanup_status,'review_required');assert.equal(review.dispatch_status,'blocked');assert.equal(review.dispatch_reason,'retirement_review_required')
  assert.deepEqual((await query('select status,assigned_organisation_id,metadata from transaction_bond_applications where id=$1',[bank])).rows[0],{status:'submitted',assigned_organisation_id:partner,metadata:{original:'preserve'}})
  await query("select set_config('test.uid',$1,false)",[oldActor])
  await query('set role authenticated')
  assert.equal((await query('select id from transaction_bond_applications where id=$1',[bank])).rows.length,0,'alternate permissive policies do not expose the retired finance lane')
  await query('reset role')
  await query("select set_config('test.uid',$1,false)",[user])
  await query("update transactions set status='cancelled' where id=$1",[matter])
  assert.equal((await query("select count(*)::int n from transaction_partner_assignments where transaction_id=$1 and assignment_status='active'",[matter])).rows[0].n,0)
  assert.equal((await query("select count(*)::int n from transaction_role_players where transaction_id=$1 and status in ('selected','active')",[matter])).rows[0].n,0)
  // A later selection cannot recreate a live portal on a closed matter.
  await query(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status,assignment_status) values(gen_random_uuid(),$1,'bond_originator',$2,'active','active')`,[matter,partner])
  assert.equal((await query("select count(*)::int n from transaction_partner_assignments where transaction_id=$1 and assignment_status='active'",[matter])).rows[0].n,0)
  // Changes made by another source trigger must retire the old lane too.
  const nested=(await query(`insert into transactions(id,organisation_id,finance_type,finance_managed_by,onboarding_status) values(gen_random_uuid(),$1,'bond','bond_originator','signed_otp_received') returning id`,[owner])).rows[0].id
  await query(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status,assignment_status) values(gen_random_uuid(),$1,'bond_originator',$2,'active','active')`,[nested,partner])
  await query('select * from claim_transaction_handoff_dispatch(25)')
  const handoff=(await query("select id from transaction_handoffs where transaction_id=$1 and role_type='bond_originator'",[nested])).rows[0].id
  const oldLease=(await query("select * from transaction_handoff_dispatch_jobs where handoff_id=$1 and channel='workspace' and status='leased'",[handoff])).rows[0]
  assert.ok(oldLease)
  await db.exec(`create function public.test_nested_nomination() returns trigger language plpgsql as $$begin
    if new.id='${nested}'::uuid then update public.transaction_role_players set assigned_organisation_id='${another}'::uuid where transaction_id=new.id and role_type='bond_originator';end if;return new;end$$;
    create trigger test_nested_nomination after update of status on transactions for each row execute function test_nested_nomination();`)
  await query("update transactions set status='active' where id=$1",[nested])
  assert.equal((await query("select assignment_cleanup_status from transaction_handoffs where id=$1",[handoff])).rows[0].assignment_cleanup_status,'retired')
  assert.equal((await query('select prepare_transaction_handoff_workspace($1,$2,$3) result',[oldLease.id,oldLease.attempt_count,oldLease.lease_token])).rows[0].result.reason,'stale_job')
  await query("delete from transaction_role_players where transaction_id=$1 and role_type='bond_originator'",[nested])
  assert.equal((await query("select count(*)::int n from transaction_partner_assignments where transaction_id=$1 and assignment_status='active'",[nested])).rows[0].n,0)
  console.log('Handoff retirement: targeted grants, stale portal/invite denial, preserved native data and receipts, pristine intake reuse, progressed-work review, RLS and rollback checks passed')
}
