import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const accessMigration = readFileSync(new URL('../../../supabase/migrations/20261108174213_transaction_actor_identity_and_developer_scope.sql', import.meta.url), 'utf8')

export async function transactionActorAccessFixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema handoff_private;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table profiles(id uuid primary key,role text,email text);
    create table organisations(id uuid primary key,type text);
    create table organisation_users(id uuid default gen_random_uuid(),organisation_id uuid,user_id uuid,status text,membership_status text,removed_at timestamptz,role text,workspace_role text,organisation_role text,scope_level text,workspace_unit_id uuid);
    create table developments(id uuid primary key,organisation_id uuid,name text);
    create table development_participants(development_id uuid,user_id uuid,participant_email text,is_active boolean,can_view boolean);
    create table units(id uuid primary key,development_id uuid);
    create table buyers(id uuid primary key,email text);
    create table transactions(id uuid primary key,buyer_id uuid,organisation_id uuid,development_id uuid,created_by uuid,assigned_agent_id uuid,owner_user_id uuid,assigned_user_id uuid,assigned_agent_email text,assigned_attorney_email text,assigned_bond_originator_email text,assigned_branch_id uuid,notes text);
    create table transaction_participants(id uuid default gen_random_uuid(),transaction_id uuid,user_id uuid,assigned_user_id uuid,participant_email text,status text default 'active',removed_at timestamptz,can_view boolean default true,can_edit_finance_workflow boolean default false);
    create table transaction_role_players(transaction_id uuid,user_id uuid,assigned_user_id uuid,email_address text,status text,removed_at timestamptz);
    create table transaction_user_access(transaction_id uuid,user_id uuid);
    create table transaction_attorney_assignments(transaction_id uuid,attorney_firm_id uuid,firm_id uuid,assigned_user_id uuid,primary_attorney_id uuid,attorney_user_id uuid,assigned_organisation_id uuid,assignment_status text,status text);
    create table attorney_firms(id uuid,organisation_id uuid);
    create table attorney_firm_members(firm_id uuid,user_id uuid,status text);
    create table transaction_finance_workflows(id uuid primary key,transaction_id uuid,notes text);
    create table transaction_bond_applications(id uuid primary key,transaction_id uuid,assigned_user_id uuid);
    create table documents(id uuid primary key,transaction_id uuid,development_id uuid,name text);
    create function bridge_current_profile_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
    create function bridge_current_user_email() returns text language sql stable as $$select lower(coalesce(auth.jwt()->>'email',''))$$;
    create function bridge_is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from organisation_users where user_id=auth.uid() and role='admin' and status='active')$$;
    create function bridge_transaction_scope_is_internal_user() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role in ('developer','internal_admin','admin','super_admin'))$$;
    create function bridge_agency_transaction_scope(uuid) returns boolean language sql stable as $$select coalesce(current_setting('fixture.agency_scope_denied',true),'false')<>'true'$$;
    create function bridge_agency_open_operations(uuid) returns boolean language sql stable as $$select false$$;
    create function bridge_support_can_access_record(uuid,uuid,text,uuid,uuid,uuid) returns boolean language sql stable as $$select false$$;
    create function bridge_is_active_member(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from organisation_users where organisation_id=p_org and user_id=auth.uid() and status in ('active','accepted') and removed_at is null)$$;
    create function bridge_can_access_bond_application_scope(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from transaction_bond_applications where id=p_id and assigned_user_id=auth.uid())$$;
    create function bridge_has_request_transaction_token_access(p_id uuid) returns boolean language sql stable as $$select nullif(current_setting('request.fixture_transaction_token',true),'')::uuid=p_id$$;
    create function handoff_private.retired_actor_only(uuid) returns boolean language sql stable as $$select coalesce(current_setting('fixture.retired_actor',true),'false')='true'$$;
    create function bridge_can_access_transaction_spine_pre_team(uuid) returns boolean language sql stable security definer set search_path=public as $$select bridge_transaction_scope_is_internal_user() or exists(select 1 from transactions where id=$1 and owner_user_id=auth.uid())$$;
    create function handoff_private.bridge_can_access_transaction_spine_before_retirement(uuid) returns boolean language sql stable security definer set search_path=public as $$select bridge_can_access_transaction_spine_pre_team($1)$$;
    create function bridge_can_access_transaction_spine(uuid) returns boolean language sql stable security definer set search_path=public as $$select not handoff_private.retired_actor_only($1) and handoff_private.bridge_can_access_transaction_spine_before_retirement($1)$$;
    create function bridge_has_development_access(uuid) returns boolean language sql stable security definer set search_path=public as $$select bridge_transaction_scope_is_internal_user()$$;
  `)
  // Reproduce the legacy helper from its immutable repository migration.
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20260827091439_transaction_setup_owner_rls_access.sql', import.meta.url), 'utf8'))
  await db.exec(`
    alter table transactions enable row level security;
    alter table transaction_participants enable row level security;
    alter table transaction_finance_workflows enable row level security;
    alter table transaction_bond_applications enable row level security;
    alter table documents enable row level security;
    alter table developments enable row level security;
    alter table units enable row level security;
    create policy transactions_select_transaction_spine_scope on transactions for select to authenticated using(owner_user_id=auth.uid() or assigned_user_id=auth.uid() or lower(coalesce(assigned_agent_email,''))=lower(coalesce(auth.jwt()->>'email','')) or bridge_can_access_transaction_spine(id));
    create policy transactions_update_transaction_spine_scope on transactions for update to authenticated using(owner_user_id=auth.uid() or lower(coalesce(assigned_agent_email,''))=lower(coalesce(auth.jwt()->>'email','')) or bridge_can_access_transaction_spine(id)) with check(owner_user_id=auth.uid() or lower(coalesce(assigned_agent_email,''))=lower(coalesce(auth.jwt()->>'email','')) or bridge_can_access_transaction_spine(id));
    create policy transactions_insert_owner on transactions for insert to authenticated with check(created_by=auth.uid());
    create policy transactions_token_read on transactions for select to anon,authenticated using(bridge_has_request_transaction_token_access(id));
    create policy agency_two_tier_records on transactions as restrictive for all to authenticated using(bridge_agency_transaction_scope(id)) with check(bridge_agency_transaction_scope(id));
    create policy participants_read on transaction_participants for select to authenticated using(bridge_can_access_transaction_spine(transaction_id));
    create policy participants_insert on transaction_participants for insert to authenticated with check(bridge_can_access_transaction_spine(transaction_id));
    create policy documents_read on documents for select to anon,authenticated using(exists(select 1 from transactions t where t.id=transaction_id) or bridge_has_request_transaction_token_access(transaction_id));
    create policy finance_read on transaction_finance_workflows for select to anon,authenticated using(bridge_transaction_scope_is_internal_user() or exists(select 1 from profiles p where p.id=auth.uid() and p.role='bond_originator') or exists(select 1 from transactions t where t.id=transaction_id and (lower(coalesce(t.assigned_agent_email,''))=lower(coalesce(auth.jwt()->>'email','')) or bridge_can_access_transaction_spine(t.id))) or bridge_has_request_transaction_token_access(transaction_id));
    create policy finance_write on transaction_finance_workflows for update to authenticated using(exists(select 1 from profiles where id=auth.uid() and role in ('developer','bond_originator')) or bridge_can_edit_finance_lane(transaction_id)) with check(exists(select 1 from profiles where id=auth.uid() and role in ('developer','bond_originator')) or bridge_can_edit_finance_lane(transaction_id));
    create policy applications_read on transaction_bond_applications for select to authenticated using(exists(select 1 from profiles where id=auth.uid() and role in ('developer','bond_originator')) or bridge_can_access_transaction_spine(transaction_id));
    create policy development_read on developments for select to authenticated using(bridge_transaction_scope_is_internal_user() or bridge_has_development_access(id));
    create policy units_read on units for select to authenticated using(bridge_transaction_scope_is_internal_user() or bridge_has_development_access(development_id));
    grant select,insert,update on transactions,transaction_participants,transaction_finance_workflows,transaction_bond_applications,documents,developments,units to authenticated;
    grant select on transactions,transaction_finance_workflows,documents to anon;
    grant select on profiles to authenticated;
    insert into organisations values('${id(10)}','developer'),('${id(20)}','developer');
    insert into developments values('${id(11)}','${id(10)}','Own development'),('${id(21)}','${id(20)}','Foreign development');
    insert into units values('${id(12)}','${id(11)}'),('${id(22)}','${id(21)}');
    insert into profiles values('${id(1)}','agent','agent@example.test'),('${id(2)}','developer','developer@example.test'),('${id(3)}','bond_originator','originator@example.test'),('${id(4)}','internal_admin','admin@example.test'),('${id(5)}','attorney','lawyer@example.test');
    insert into organisation_users(organisation_id,user_id,status,membership_status,workspace_role,role) values('${id(10)}','${id(2)}','active','active','owner','admin');
    insert into transactions(id,organisation_id,development_id,created_by,owner_user_id,assigned_agent_email,assigned_attorney_email,assigned_bond_originator_email) values
      ('${id(100)}','${id(10)}','${id(11)}','${id(1)}','${id(1)}','','',''),('${id(200)}','${id(20)}','${id(21)}',null,null,'','','');
    insert into transaction_participants(transaction_id,participant_email,can_view,can_edit_finance_workflow) values('${id(200)}','',true,true);
    insert into transaction_finance_workflows values('${id(101)}','${id(100)}','own'),('${id(201)}','${id(200)}','foreign');
    insert into transaction_bond_applications values('${id(102)}','${id(100)}',null),('${id(202)}','${id(200)}',null);
    insert into documents values('${id(103)}','${id(100)}','${id(11)}','own'),('${id(203)}','${id(200)}','${id(21)}','foreign');
  `)
  return db
}

export async function actor(db, userId, email = '', role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.fixture_transaction_token','',false),set_config('fixture.retired_actor','false',false)", [JSON.stringify({ sub: userId, role, email })])
  await db.query("select set_config('fixture.agency_scope_denied','false',false)")
  await db.exec(`set role ${role}`)
}
