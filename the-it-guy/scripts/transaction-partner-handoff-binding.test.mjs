import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandoffFixture } from './helpers/transaction-handoff-fixture.mjs'
import { runHandoffQueueChecks } from './helpers/transaction-handoff-queue-checks.mjs'
import { runHandoffRecoveryChecks } from './helpers/transaction-handoff-recovery-checks.mjs'
import { runHandoffRetirementChecks } from './helpers/transaction-handoff-retirement-checks.mjs'

const { db, owner, partner, other, matter } = await createHandoffFixture()
const sql = file => readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8')
const query = (text, args = []) => db.query(text, args)
const user = '40000000-0000-0000-0000-000000000001'
await db.exec(`
create schema auth;
create table signup_intents(auth_user_id uuid,invite_token text,workspace_action text,source text,updated_at timestamptz);
create table user_workspace_preferences(user_id uuid primary key,active_workspace_id uuid,active_workspace_source text,updated_at timestamptz);
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
grant usage on schema auth to authenticated,anon;
alter table organisations add column type text;
alter table organisation_users add column id uuid primary key default gen_random_uuid(),add column membership_status text;
alter table profiles add column first_name text,add column last_name text,add column full_name text,add column company_name text,add column phone_number text,add column role text,add column onboarding_completed boolean,add column updated_at timestamptz;
alter table transaction_partner_invitations add column metadata jsonb default '{}',add column accepted_user_id uuid,add column accepted_at timestamptz,add column invited_by_user_id uuid,add column phone text,add column contact_name text,add column partner_prospect_id uuid,add column updated_at timestamptz,add column declined_at timestamptz;
alter table transaction_role_players add column user_id uuid,add column assigned_user_id uuid,add column contact_person text,add column partner_name text,add column phone_number text,add column partner_relationship_id uuid,add column removed_at timestamptz,add column activated_at timestamptz,add column activation_trigger text,add column selection_source text,add column snapshot_json jsonb;
alter table transaction_role_players alter column id set default gen_random_uuid();
create table organisation_partners(id uuid primary key default gen_random_uuid(),organisation_id uuid,partner_organisation_id uuid,relationship_status text,status text,relationship_type text,visibility_level text,partner_type text,scope_type text,scope_id uuid,preferred boolean,accepted_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz);
create table transaction_user_access(id uuid primary key default gen_random_uuid(),transaction_id uuid,user_id uuid,access_role text,created_by_invitation_id uuid,updated_at timestamptz,unique(transaction_id,user_id,access_role));
create table transaction_participants(id uuid primary key default gen_random_uuid(),transaction_id uuid,user_id uuid,role_type text,legal_role text,transaction_role text,status text,participant_name text,participant_email text,invited_by_user_id uuid,invited_at timestamptz,accepted_at timestamptz,visibility_scope text,is_internal boolean,participant_scope text,assignment_source text,transaction_partner_invitation_id uuid,partner_organisation_id uuid,can_view boolean,can_comment boolean,can_upload_documents boolean,can_edit_finance_workflow boolean,can_edit_attorney_workflow boolean,can_edit_core_transaction boolean,removed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz,unique(transaction_id,role_type,legal_role));
create table invites(id uuid primary key default gen_random_uuid(),token text unique,invite_type text,status text,metadata jsonb,target_transaction_id uuid,email text,expires_at timestamptz,accepted_by_user_id uuid,accepted_at timestamptz,updated_at timestamptz,revoked_at timestamptz,revoked_by_user_id uuid);
create function bridge_accept_invite(text) returns jsonb language sql as $$select jsonb_build_object('success',true,'legacy',true)$$;
create function bridge_log_transaction_partner_invitation_event(uuid,text,uuid,jsonb) returns void language sql as $$select null::void$$;
insert into auth.users values('${user}','contact@partner.co.za',now());
update organisations set type='bond_originator' where id='${partner}';
update organisations set type='attorney_firm' where id='${other}';
insert into attorney_firms values(gen_random_uuid(),'${other}');
`)
const roleShape = sql('202606300002_transaction_partner_legal_invites_phase1.sql')
await db.exec(roleShape.slice(roleShape.indexOf('create or replace function public.bridge_transaction_partner_invite_role_shape')))
const legacy = sql('202607080005_transaction_partner_invite_partner_org_binding.sql')
await db.exec(legacy.slice(legacy.indexOf('create or replace function public.bridge_accept_transaction_partner_invitation'), legacy.indexOf('do $$')))
const repair = sql('202607080006_invite_acceptance_reconciliation_phase5.sql')
await db.exec(repair.slice(repair.indexOf('create or replace function public.bridge_repair_transaction_partner_invitation_acceptance'), repair.indexOf('revoke all on function')))
await db.exec(sql('202606300004_canonical_transaction_partner_invites_phase3.sql'))
await db.exec(sql('20261004082510_transaction_partner_handoff_signup_binding.sql'))
const accept = async (token, org = null) => (await query('select bridge_accept_transaction_partner_invitation($1,$2,$3) as result', [token, {}, org])).rows[0].result
const preview = async token => (await query('select bridge_get_partner_handoff_invitation($1) as result', [token])).rows[0].result
const invite = async (transactionId, role = 'bond_originator', status = 'pending') => {
  const row = (await query(`insert into transaction_partner_invitations(id,transaction_id,role_type,company_name,email,status,expires_at,accepted_user_id) values(gen_random_uuid(),$1,$2,'Partner','contact@partner.co.za',$3,now()+interval '2 days',case when $3='accepted' then $4::uuid end) returning *`, [transactionId,role,status,user])).rows[0]
  const token = `canonical-${row.id}`
  await query(`insert into invites(token,invite_type,status,metadata,target_transaction_id,email,expires_at) values($1,'transaction_invite',$2,$3,$4,'contact@partner.co.za',now()+interval '2 days')`, [token,status,{transaction_partner_invitation_id:row.id,transaction_partner_role_type:role},transactionId])
  return { ...row, token }
}
const newMatter = async (status = 'signed_otp_received') => (await query(`insert into transactions(id,organisation_id,finance_type,finance_managed_by,onboarding_status) values(gen_random_uuid(),$1,'bond','bond_originator',$2) returning id`, [owner,status])).rows[0].id
try {
  const pending = await invite(matter)
  const publicPreview = await preview(pending.token)
  assert.equal(publicPreview.ok,true)
  assert.deepEqual(publicPreview.organisations,[])
  assert.equal(JSON.stringify(publicPreview).includes('canonical-'),false)
  assert.equal((await accept(pending.token,partner)).code,'not_authenticated')
  await query("select set_config('test.uid',$1,false),set_config('test.email','wrong@partner.co.za',false)",[user])
  assert.equal((await accept(pending.token,partner)).code,'email_mismatch')
  await query("select set_config('test.email','contact@partner.co.za',false)")
  assert.equal((await accept(pending.token)).code,'organisation_required')
  assert.equal((await query('select status from invites where token=$1',[pending.token])).rows[0].status,'pending')
  assert.equal((await query('select count(*)::int n from transaction_user_access')).rows[0].n,0)
  await query(`insert into organisation_users(organisation_id,user_id,email,status,role,scope_level) values($1,$2,'contact@partner.co.za','active','owner','workspace_hq')`,[partner,user])
  await query(`update transactions set onboarding_status='signed_otp_received' where id=$1`,[matter])
  assert.equal((await preview(pending.token)).organisations.length,1)
  assert.equal((await accept(pending.token,other)).code,'organisation_authority_required')
  await query('update auth.users set email_confirmed_at=null where id=$1',[user])
  assert.equal((await accept(pending.token,partner)).code,'email_verification_required','unverified signup cannot gain matter access')
  await query('update auth.users set email_confirmed_at=now() where id=$1',[user])
  await query("update organisation_users set scope_level='branch' where organisation_id=$1",[partner])
  assert.equal((await accept(pending.token,partner)).code,'organisation_authority_required')
  await query("update organisation_users set scope_level='workspace_hq',membership_status='pending' where organisation_id=$1",[partner])
  assert.equal((await accept(pending.token,partner)).code,'organisation_authority_required')
  await query("update organisation_users set membership_status='active' where organisation_id=$1",[partner])
  // Inject a late write failure: acceptance, access and source-trigger jobs all roll back.
  await query("alter table transaction_role_players add constraint injected_binding_failure check(selection_source is distinct from 'invited_partner')")
  await assert.rejects(accept(pending.token,partner))
  assert.equal((await query('select status from transaction_partner_invitations where id=$1',[pending.id])).rows[0].status,'pending')
  assert.equal((await query('select count(*)::int n from transaction_user_access')).rows[0].n,0)
  assert.equal((await query("select count(*)::int n from transaction_handoff_dispatch_jobs where status='queued'")).rows[0].n,0)
  await query('alter table transaction_role_players drop constraint injected_binding_failure')
  await query("insert into signup_intents values($1,$2,'create_workspace','invite_link',now())",[user,pending.token])
  const accepted = await accept(pending.token,partner)
  assert.equal((await query('select invite_token from signup_intents where auth_user_id=$1',[user])).rows[0].invite_token,null,'durable return reference clears only after connection succeeds')
  assert.equal(accepted.success,true);assert.equal(accepted.deliveryConfirmed,false)
  assert.equal(accepted.partnerOrganisationId,partner)
  assert.equal((await query('select active_workspace_id from user_workspace_preferences where user_id=$1',[user])).rows[0].active_workspace_id,partner)
  const bound=(await query("select * from transaction_handoffs where transaction_id=$1 and role_type='bond_originator'",[matter])).rows[0]
  assert.equal(bound.destination_organisation_id,partner);assert.equal(bound.dispatch_status,'pending');assert.equal(bound.acceptance_status,'awaiting_receipt')
  assert.equal((await query('select count(*)::int n from transaction_user_access')).rows[0].n,1)
  assert.equal((await query('select count(*)::int n from transaction_participants')).rows[0].n,1)
  const before=(await query('select count(*)::int n from transaction_handoff_dispatch_jobs')).rows[0].n
  assert.equal((await accept(pending.token,partner)).success,true)
  assert.equal((await accept(pending.invitation_token,partner)).success,true,'consumed legacy link resumes only for original recipient')
  assert.equal((await query('select count(*)::int n from transaction_handoff_dispatch_jobs')).rows[0].n,before)
  assert.equal((await query('select count(*)::int n from transaction_role_players')).rows[0].n,1)
  assert.equal((await query('select count(*)::int n from organisation_partners')).rows[0].n,1)
  await query(`insert into organisation_users(organisation_id,user_id,email,status,role,scope_level) values($1,$2,'contact@partner.co.za','active','owner','workspace_hq')`,[other,user])
  const attorney = await invite(await newMatter('awaiting_signed_otp'),'transfer_attorney')
  assert.equal((await accept(attorney.token,other)).success,true)
  assert.equal((await query("select dispatch_status from transaction_handoffs where transaction_id=$1 and role_type='transfer_attorney'",[attorney.transaction_id])).rows[0].dispatch_status,'blocked','signup cannot bypass OTP readiness')
  await query(`update transactions set onboarding_status='signed_otp_received' where id=$1`,[attorney.transaction_id])
  const legalJobs=(await query('select * from claim_transaction_handoff_dispatch(25)')).rows
  for(const j of legalJobs) assert.equal((await query('select prepare_transaction_handoff_workspace($1,$2,$3) result',[j.id,j.attempt_count,j.lease_token])).rows[0].result.prepared,true)
  assert.equal((await query('select count(*)::int n from transaction_bond_applications')).rows[0].n,1)
  assert.equal((await query('select count(*)::int n from transaction_attorney_assignments')).rows[0].n,1)
  const unbound=await invite(await newMatter(),'transfer_attorney','accepted')
  assert.equal((await preview(unbound.token)).bindingState,'accepted_unbound')
  assert.equal((await accept(unbound.token,other)).success,true)
  assert.equal((await preview(unbound.token)).bindingState,'bound')
  const old=await invite(await newMatter())
  await invite(old.transaction_id)
  assert.equal((await accept(old.token,partner)).code,'nomination_changed')
  const revoked=await invite(await newMatter())
  await query("update invites set status='revoked' where token=$1",[revoked.token])
  assert.equal((await accept(revoked.token,partner)).success,false)
  const closed=await invite(await newMatter())
  await query("update transactions set status='cancelled' where id=$1",[closed.transaction_id])
  assert.equal((await accept(closed.token,partner)).code,'transaction_unavailable')
  const changed=await invite(await newMatter())
  await query(`insert into transaction_role_players(transaction_id,role_type,assigned_organisation_id,status) values($1,'bond_originator',$2,'active')`,[changed.transaction_id,other])
  assert.equal((await accept(changed.token,partner)).code,'nomination_changed')
  const expired=await invite(await newMatter())
  await query("update transaction_partner_invitations set expires_at=now()-interval '1 second' where id=$1",[expired.id])
  assert.equal((await accept(expired.token,partner)).code,'invitation_expired')
  const declined=await invite(await newMatter())
  assert.equal((await query('select bridge_decline_partner_handoff_invitation($1) result',[declined.token])).rows[0].result.success,true)
  assert.equal((await query('select status from invites where token=$1',[declined.token])).rows[0].status,'revoked')
  assert.equal((await accept(declined.token,partner)).success,false)
  const another='10000000-0000-0000-0000-000000000004'
  await query(`insert into organisations(id,name,type) values($1,'Another bond company','bond_originator')`,[another])
  await query(`insert into organisation_users(organisation_id,user_id,status,role,scope_level) values($1,$2,'active','owner','workspace_hq')`,[another,user])
  const ambiguous=await invite(await newMatter())
  assert.equal((await accept(ambiguous.token)).code,'organisation_selection_required')
  assert.equal((await query('select bridge_accept_invite($1) result',[ambiguous.token])).rows[0].result.code,'organisation_selection_required','generic canonical acceptance cannot consume an unbound invite')
  await query("update organisation_users set role='consultant' where organisation_id=$1",[partner])
  assert.equal((await accept(ambiguous.token,partner)).code,'organisation_authority_required')
  await query('set role authenticated')
  await assert.rejects(query('select * from handoff_private.invitation_bindings'),/permission denied/)
  await assert.rejects(query('select handoff_private.accept_invite_legacy($1)',[pending.token]),/permission denied/)
  await query('reset role');await query('set role anon')
  await assert.rejects(accept(ambiguous.token,another),/permission denied/)
  await query('reset role')
  console.log('Partner handoff binding: verified recipient, organisation authority, atomic rollback, signup resume, canonical deferral, readiness, native matters and access checks passed')
  await runHandoffRetirementChecks({ db, owner, partner, other, matter, user, pending, attorney, another })
  await runHandoffRecoveryChecks({ db, owner, partner, another, user })
  await runHandoffQueueChecks({ db, owner, partner, user })
} finally { await db.close() }
