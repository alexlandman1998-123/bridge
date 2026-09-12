import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const actor = '00000000-0000-0000-0000-000000000001'
const matter = '00000000-0000-0000-0000-000000000002'
const org = '00000000-0000-0000-0000-000000000003'
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema journey_private;
create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select '{"email":"test@example.invalid"}'::jsonb$$;
create function bridge_transaction_scope_is_internal_user() returns boolean language sql as $$select false$$;
create function bridge_support_can_access_record(uuid,uuid,text,uuid,uuid,uuid) returns boolean language sql as $$select false$$;
create function bridge_is_active_member(uuid) returns boolean language sql as $$select false$$;
create function journey_private.read_matter_journey(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
create table transactions(id uuid,owner_user_id uuid,assigned_user_id uuid,assigned_agent_email text,
 assigned_attorney_email text,assigned_bond_originator_email text,organisation_id uuid,assigned_branch_id uuid);
create table organisation_users(organisation_id uuid,user_id uuid,status text,scope_level text,workspace_role text,organisation_role text,role text,workspace_unit_id uuid);
create table transaction_participants(transaction_id uuid,role_type text,status text,removed_at timestamptz,user_id uuid,assigned_user_id uuid,participant_email text);
create table transaction_role_players(transaction_id uuid,role_type text,status text,removed_at timestamptz,user_id uuid,assigned_user_id uuid,email_address text);
create table transaction_attorney_assignments(transaction_id uuid,attorney_firm_id uuid,firm_id uuid,assignment_status text,status text,assigned_user_id uuid,primary_attorney_id uuid,attorney_user_id uuid,assigned_organisation_id uuid);
create table attorney_firms(id uuid,organisation_id uuid);
create table attorney_firm_members(firm_id uuid,user_id uuid,status text);
insert into transactions(id,organisation_id) values('${matter}','${org}');
insert into transaction_participants(transaction_id,role_type,user_id,status) values('${matter}','buyer','${actor}','active');
`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260910154340_restrict_professional_journey_audience.sql',import.meta.url),'utf8'))
const read = () => db.query('select public.bridge_read_professional_matter_journey($1)',[matter])
for (const role of ['buyer','seller']) {
 await db.query('update transaction_participants set role_type=$1',[role])
 await assert.rejects(read(), /Professional matter access/)
}
for (const role of ['agent','developer','attorney','bond_originator']) {
 await db.query('update transaction_participants set role_type=$1',[role])
 await read()
}
await db.exec("update transaction_participants set removed_at=now()")
await assert.rejects(read(), /Professional matter access/)
await db.exec(`insert into transaction_role_players(transaction_id,role_type,user_id,status) values('${matter}','buyer','${actor}','active')`)
await assert.rejects(read(), /Professional matter access/)
await db.exec("update transaction_role_players set role_type='attorney'")
await read()
await db.exec("update transaction_role_players set status='removed'")
await assert.rejects(read(), /Professional matter access/)
await db.exec(`insert into organisation_users(organisation_id,user_id,status,scope_level) values('${org}','${actor}','active','organisation')`)
await read()
await assert.rejects(db.query('select public.bridge_read_professional_matter_journey($1)',[org]), /Professional matter access/)
const grants=(await db.query("select has_function_privilege('anon','public.bridge_read_professional_matter_journey(uuid)','execute') anon,has_function_privilege('authenticated','journey_private.can_read_professional_journey(uuid)','execute') helper")).rows[0]
assert.deepEqual(grants,{anon:false,helper:false})
await db.close()
console.log('Professional journey access: client denial, assigned professionals, removed users, organisation membership and cross-matter denial PASS')
