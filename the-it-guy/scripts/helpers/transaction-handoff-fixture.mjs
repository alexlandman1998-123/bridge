import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

export async function createHandoffFixture() {
const db = new PGlite()
const owner='10000000-0000-0000-0000-000000000001', partner='10000000-0000-0000-0000-000000000002', other='10000000-0000-0000-0000-000000000003'
const matter='20000000-0000-0000-0000-000000000001', rp='30000000-0000-0000-0000-000000000001'
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table organisations(id uuid primary key,name text,company_email text);
create table transactions(id uuid primary key,organisation_id uuid,finance_type text,finance_managed_by text,onboarding_status text,onboarding_completed_at timestamptz,external_onboarding_submitted_at timestamptz,bond_workspace_id uuid,bond_assignment_status text,bond_assignment_source text,seller_has_existing_bond boolean,routing_profile_json jsonb);
create table transaction_role_players(id uuid primary key,transaction_id uuid references transactions on delete cascade,role_type text,assigned_organisation_id uuid,partner_organisation_id uuid,organisation_id uuid,email_address text,status text,assignment_status text,transaction_partner_invitation_id uuid,updated_at timestamptz default now());
create table transaction_partner_invitations(id uuid primary key,transaction_id uuid references transactions on delete cascade,role_type text,organisation_id uuid,company_name text,email text,status text,expires_at timestamptz,invitation_token uuid default gen_random_uuid(),created_at timestamptz default now());
create table attorney_firms(id uuid primary key,organisation_id uuid);
create table transaction_attorney_assignments(id uuid primary key default gen_random_uuid(),transaction_id uuid references transactions on delete cascade,attorney_role text,assignment_type text,attorney_firm_id uuid,firm_id uuid,assignment_status text,firm_acceptance_status text,instruction_status text,status text,is_primary boolean,staff_assignment_status text,allocation_state text,updated_at timestamptz default now());
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql stable as $$ select coalesce(current_setting('test.matter_access',true),'false')='true' $$;
grant select on transaction_partner_invitations to authenticated;
insert into organisations(id,name) values ('${owner}','Agency'),('${partner}','Beta Bond'),('${other}','Other partner');
insert into transactions(id,organisation_id,finance_type,finance_managed_by) values ('${matter}','${owner}','bond','bond_originator');
`)
await db.exec(readFileSync(new URL('../../../supabase/migrations/20261004074909_transaction_handoff_register.sql',import.meta.url),'utf8'))
await db.exec(`
alter table transactions add column updated_at timestamptz default now(),add column transaction_reference text,add column status text,add column archived_at timestamptz,add column is_demo_data boolean default false;
create table profiles(id uuid primary key,email text);
create table organisation_users(organisation_id uuid,user_id uuid,email text,status text,role text,scope_level text,branch_id uuid);
create table attorney_firm_members(firm_id uuid,user_id uuid,status text,role text);
create table transaction_finance_workflows(id uuid primary key default gen_random_uuid(),transaction_id uuid,workflow_type text,current_stage text default 'documents_received',status text default 'active',unique(transaction_id,workflow_type));
create table transaction_bond_applications(id uuid primary key default gen_random_uuid(),transaction_id uuid,workflow_id uuid,application_type text not null check(application_type in ('originator_intake','bank_application')),bank_name text not null,status text default 'pending',assigned_organisation_id uuid,assignment_status text check(assignment_status in ('organisation_queue','consultant_assigned','fully_assigned','inactive','declined')),assignment_source text,scope_level text,scope_metadata jsonb,metadata jsonb);
create unique index originator_intake_once on transaction_bond_applications(transaction_id,application_type) where application_type='originator_intake';
create table transaction_partner_assignments(id uuid primary key default gen_random_uuid(),transaction_id uuid,agency_organisation_id uuid,partner_organisation_id uuid,partner_role text,partner_service_type text,delivery_type text,assignment_status text,source text,activated_at timestamptz,pending_work_delivery jsonb,created_at timestamptz default now());
create table partner_portal_notifications(id uuid primary key default gen_random_uuid(),transaction_partner_assignment_id uuid,organisation_id uuid,partner_id uuid,bond_application_id uuid,notification_type text,title text,read_at timestamptz);
create table transaction_events(id uuid primary key default gen_random_uuid(),transaction_id uuid,event_type text,event_data jsonb);
`)
await db.exec(`insert into transactions(id,organisation_id,finance_type,onboarding_status) values ('20000000-0000-0000-0000-000000000099','${owner}','cash','signed_otp_received')`)
await db.exec(readFileSync(new URL('../../../supabase/migrations/20261004080223_transaction_handoff_durable_dispatch.sql',import.meta.url),'utf8'))
await db.exec(`
create table queued_legal_notifications(event_type text);
create function bridge_phase6_title_case(text) returns text language sql as $$select initcap(replace($1,'_',' '))$$;
create function bridge_queue_bond_attorney_legal_event_phase6(text,uuid,text,text,text,jsonb,text) returns void language sql as $$insert into public.queued_legal_notifications values($1)$$;
create trigger trg_attorney_assignment_notifications_phase6 after insert or update on transaction_attorney_assignments for each row execute function bridge_handle_attorney_assignment_notifications_phase6();
`)
return { db, owner, partner, other, matter, rp }
}
