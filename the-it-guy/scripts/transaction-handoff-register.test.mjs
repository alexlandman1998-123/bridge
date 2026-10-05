import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const owner='10000000-0000-0000-0000-000000000001', partner='10000000-0000-0000-0000-000000000002', other='10000000-0000-0000-0000-000000000003'
const matter='20000000-0000-0000-0000-000000000001', rp='30000000-0000-0000-0000-000000000001', invitation='40000000-0000-0000-0000-000000000001'
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table organisations(id uuid primary key,name text);
create table transactions(id uuid primary key,organisation_id uuid,finance_type text,finance_managed_by text,onboarding_status text,onboarding_completed_at timestamptz,external_onboarding_submitted_at timestamptz,bond_workspace_id uuid,bond_assignment_status text,bond_assignment_source text,seller_has_existing_bond boolean,routing_profile_json jsonb);
create table transaction_role_players(id uuid primary key,transaction_id uuid references transactions on delete cascade,role_type text,assigned_organisation_id uuid,partner_organisation_id uuid,organisation_id uuid,email_address text,status text,assignment_status text,transaction_partner_invitation_id uuid,updated_at timestamptz default now());
create table transaction_partner_invitations(id uuid primary key,transaction_id uuid references transactions on delete cascade,role_type text,organisation_id uuid,company_name text,email text,status text,expires_at timestamptz,invitation_token uuid default gen_random_uuid(),created_at timestamptz default now());
create table attorney_firms(id uuid primary key,organisation_id uuid);
create table transaction_attorney_assignments(id uuid primary key,transaction_id uuid references transactions on delete cascade,attorney_role text,assignment_type text,attorney_firm_id uuid,firm_id uuid,assignment_status text,firm_acceptance_status text,instruction_status text,updated_at timestamptz default now());
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql stable as $$ select coalesce(current_setting('test.matter_access',true),'false')='true' $$;
grant select on transaction_partner_invitations to authenticated;
insert into organisations values ('${owner}','Agency'),('${partner}','Beta Bond'),('${other}','Other partner');
insert into transactions(id,organisation_id,finance_type,finance_managed_by) values ('${matter}','${owner}','bond','bond_originator');
`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20261004074909_transaction_handoff_register.sql',import.meta.url),'utf8'))
const lane=async (role='bond_originator')=>(await db.query('select * from transaction_handoffs where transaction_id=$1 and role_type=$2',[matter,role])).rows[0]
const change=(sql,params=[])=>db.query(sql,params)
try {
assert.equal((await db.query('select count(*)::int as n from transaction_handoffs')).rows[0].n,4)
const initial=await lane()
assert.equal(initial.instruction_status,'awaiting_buyer_onboarding')
assert.deepEqual(initial.exception_keys,['destination_missing'])
await change(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status) values ($1,$2,'bond_originator',$3,'active')`,[rp,matter,partner])
let row=await lane()
assert.equal(row.id,initial.id)
assert.equal(row.destination_company_name,'Beta Bond')
assert.equal(row.nomination_status,'nominated')
assert.equal(row.acceptance_status,'awaiting_receipt','active nomination is not receipt')
assert.equal(row.delivery_status,'not_recorded','source event is not delivery proof')
await change("update transactions set onboarding_status='awaiting_signed_otp' where id=$1",[matter])
assert.equal((await lane()).instruction_status,'awaiting_signed_otp')
await change("update transactions set onboarding_status='signed_otp_received' where id=$1",[matter])
assert.equal((await lane()).instruction_status,'ready')
await change("update transactions set bond_workspace_id=$1,bond_assignment_status='consultant_assigned',bond_assignment_source='accepted_from_intake' where id=$2",[partner,matter])
assert.equal((await lane()).acceptance_status,'accepted')
await change("update transactions set bond_assignment_source='invite_acceptance' where id=$1",[matter])
assert.equal((await lane()).acceptance_status,'awaiting_receipt','invitation binding is not receipt')
await change('begin')
await change("update transactions set finance_type='cash' where id=$1",[matter])
assert.equal((await lane()).required,false)
await change('rollback')
assert.equal((await lane()).required,true,'rollback preserves source and register together')
for(const manager of ['client','internal']){
await change('update transactions set finance_managed_by=$1 where id=$2',[manager,matter]);assert.equal((await lane()).required,false)
}
await change('update transactions set finance_managed_by=null where id=$1',[matter])
assert.equal((await lane()).instruction_status,'awaiting_finance_owner')
assert.deepEqual((await lane()).exception_keys,['finance_owner_unresolved'])
await change("update transactions set finance_managed_by='bond_originator',seller_has_existing_bond=true where id=$1",[matter])
assert.equal((await lane('cancellation_attorney')).required,true)
await change(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status) values (gen_random_uuid(),$1,'bond_originator',$2,'active')`,[matter,other])
assert.equal((await lane()).nomination_status,'conflicting')
assert.ok((await lane()).exception_keys.includes('conflicting_destinations'))
await change('delete from transaction_role_players where assigned_organisation_id=$1',[other])
await change("update transaction_role_players set status='removed' where id=$1",[rp])
await change('update transactions set bond_workspace_id=null where id=$1',[matter])
assert.equal((await lane()).nomination_status,'unassigned')
await change(`insert into transaction_partner_invitations(id,transaction_id,role_type,company_name,email,status,expires_at) values ($1,$2,'bond_originator','New Bond','hello@example.test','pending',now()+interval '1 day')`,[invitation,matter])
row=await lane()
assert.equal(row.nomination_status,'invited');assert.equal(row.destination_organisation_id,null)
assert.equal(row.invited_company_name,'New Bond');assert.equal(row.invitation_status,'pending')
assert.equal(JSON.stringify(row).includes('invitation_token'),false)
await change("update transaction_partner_invitations set status='accepted' where id=$1",[invitation])
assert.ok((await lane()).exception_keys.includes('accepted_invitation_not_bound'))
await change('update transaction_partner_invitations set organisation_id=$1 where id=$2',[partner,invitation])
assert.equal((await lane()).nomination_status,'nominated')
assert.equal((await lane()).acceptance_status,'awaiting_receipt','signup is not instruction acceptance')
await change("update transaction_partner_invitations set status='pending',expires_at=now()-interval '1 day' where id=$1",[invitation])
assert.equal((await lane()).invitation_status,'expired')
await change(`insert into attorney_firms values ('50000000-0000-0000-0000-000000000001',$1)`,[other])
await change(`insert into transaction_attorney_assignments(id,transaction_id,attorney_role,attorney_firm_id,firm_acceptance_status) values (gen_random_uuid(),$1,'transfer_attorney','50000000-0000-0000-0000-000000000001','accepted')`,[matter])
assert.equal((await lane('transfer_attorney')).acceptance_status,'accepted')
assert.equal((await lane('transfer_attorney')).delivery_status,'not_recorded')
await change("update transaction_partner_invitations set status='pending',expires_at=now()+interval '1 day' where id=$1",[invitation])
await change("update transaction_handoffs set invitation_expires_at=now()-interval '1 second' where invitation_id=$1",[invitation])
const read=(await db.query('select bridge_read_transaction_handoffs($1) as data',[matter])).rows[0].data
assert.equal(read.items.find(r=>r.role_type==='bond_originator').invitation_status,'expired')
// Competing legal and roleplayer destinations are visible, not silently resolved.
await change(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status) values (gen_random_uuid(),$1,'transfer_attorney',$2,'active')`,[matter,partner])
assert.equal((await lane('transfer_attorney')).nomination_status,'conflicting')
await change(`insert into transaction_partner_invitations(id,transaction_id,role_type,company_name,email,status,expires_at) values (gen_random_uuid(),$1,'transfer_attorney','Pending Firm','firm@example.test','pending',now()+interval '1 day')`,[matter])
assert.ok((await lane('transfer_attorney')).exception_keys.includes('conflicting_destinations'))
// Malformed legacy destinations stay visible without preventing all backfill.
await change(`insert into transaction_role_players(id,transaction_id,role_type,assigned_organisation_id,status) values ('30000000-0000-0000-0000-000000000009',$1,'bond_attorney','10000000-0000-0000-0000-000000000009','active')`,[matter])
assert.equal((await lane('bond_attorney')).destination_organisation_id,null)
assert.ok((await lane('bond_attorney')).exception_keys.includes('organisation_unresolved'))
assert.equal((await lane('bond_attorney')).source_references.unresolvedOrganisationId,'10000000-0000-0000-0000-000000000009')
// Inject a register write failure: the source update must roll back too.
await change("alter table transaction_handoffs add constraint test_register_failure check (instruction_status<>'ready') not valid")
await assert.rejects(change("update transactions set finance_type='cash' where id=$1",[matter]),/test_register_failure/)
assert.equal((await db.query('select finance_type from transactions where id=$1',[matter])).rows[0].finance_type,'bond')
await change('alter table transaction_handoffs drop constraint test_register_failure')
// New matters and source reassignment reconcile both affected matters.
const second='20000000-0000-0000-0000-000000000002'
await change("insert into transactions(id,organisation_id,finance_type) values ($1,$2,'cash')",[second,owner])
assert.equal((await db.query('select count(*)::int as n from transaction_handoffs where transaction_id=$1',[second])).rows[0].n,4)
await change("update transaction_role_players set transaction_id=$1,status='active' where id=$2",[second,rp])
assert.equal((await db.query("select roleplayer_id from transaction_handoffs where transaction_id=$1 and role_type='bond_originator'",[second])).rows[0].roleplayer_id,rp)
assert.equal((await lane()).roleplayer_id,null)
await change(`insert into transaction_partner_invitations(id,transaction_id,role_type,company_name,email,status,expires_at) values ('40000000-0000-0000-0000-000000000002',$1,'transfer_attorney','External Attorneys','law@example.test','pending',now()+interval '1 day')`,[second])
let externalAttorney=(await db.query("select * from transaction_handoffs where transaction_id=$1 and role_type='transfer_attorney'",[second])).rows[0]
assert.equal(externalAttorney.nomination_status,'invited')
assert.equal(externalAttorney.instruction_status,'awaiting_buyer_onboarding')
await change("update transaction_partner_invitations set status='accepted' where transaction_id=$1",[second])
externalAttorney=(await db.query("select * from transaction_handoffs where transaction_id=$1 and role_type='transfer_attorney'",[second])).rows[0]
assert.ok(externalAttorney.exception_keys.includes('accepted_invitation_not_bound'))
assert.equal(externalAttorney.acceptance_status,'awaiting_receipt')
await change('delete from transactions where id=$1',[second])
await change('set role authenticated')
assert.equal((await db.query('select bridge_read_transaction_handoffs($1) as data',[matter])).rows[0].data.items.length,0)
await change("set test.matter_access='true'")
assert.equal((await db.query('select bridge_read_transaction_handoffs($1) as data',[matter])).rows[0].data.items.length,4)
await assert.rejects(change("update transaction_handoffs set delivery_status='sent'"),/permission denied/)
await assert.rejects(change('select handoff_private.reconcile($1)',[matter]),/permission denied/)
await change('reset role');await change('set role anon')
await assert.rejects(change('select bridge_read_transaction_handoffs($1)',[matter]),/permission denied/)
await change('reset role');await change('delete from transactions where id=$1',[matter])
assert.equal((await db.query('select count(*)::int as n from transaction_handoffs')).rows[0].n,0)
console.log('Transaction handoff register persistence, gates, invitations, conflicts, receipts, expiry and access checks passed')
}finally{await db.close()}
