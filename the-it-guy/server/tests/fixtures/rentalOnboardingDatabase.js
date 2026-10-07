import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const root = new URL('../../../../supabase/migrations/', import.meta.url)
export const actor = '11111111-1111-4111-8111-111111111111'
export const org = '22222222-2222-4222-8222-222222222222'
export const property = '33333333-3333-4333-8333-333333333333'
export const unit = '44444444-4444-4444-8444-444444444444'
export const vacancy = '55555555-5555-4555-8555-555555555555'
export const app = '66666666-6666-4666-8666-666666666666'
export async function rentalOnboardingDatabase() {
  const db = new PGlite()
  await db.exec(`create role service_role; create role anon; create role authenticated; create schema auth; grant usage on schema auth to authenticated;
  create table auth.users(id uuid primary key); insert into auth.users values('${actor}');
  create function auth.role() returns text language sql as $$ select case when nullif(current_setting('test.actor',true),'') is null then 'service_role' else 'authenticated' end $$;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
  create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table private_listings(id uuid primary key,organisation_id uuid,branch_id uuid);
  create table rental_property_mandates(id uuid default gen_random_uuid(),organisation_id uuid,property_id uuid,mandate_status text,metadata_json jsonb default '{}');
  create table leads(lead_id uuid primary key,organisation_id uuid,branch_id uuid,raw_enquiry_payload jsonb default '{}');
  grant select on leads to authenticated;
  create table organisations(id uuid primary key); insert into organisations values('${org}');
  create table rental_properties(id uuid primary key,organisation_id uuid,branch_id uuid); insert into rental_properties values('${property}','${org}',null);
  create table rental_units(id uuid primary key,organisation_id uuid,status text,active_tenancy_id uuid); insert into rental_units values('${unit}','${org}','available',null);
  create table rental_vacancies(id uuid primary key,organisation_id uuid,property_id uuid,unit_id uuid,asking_rent numeric,deposit_amount numeric,lease_term_months integer); insert into rental_vacancies values('${vacancy}','${org}','${property}','${unit}',11000,22000,12);
  create function rental_branch_access(target_org uuid,target_branch uuid) returns boolean language sql as $$ select auth.uid()='${actor}'::uuid and $1='${org}'::uuid $$;
  create function rental_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at:=now(); return new; end $$;
  create table rental_applications(id uuid primary key,organisation_id uuid,vacancy_id uuid,unit_id uuid,lead_id uuid,applicant_party_id uuid,status text default 'draft',version integer default 1,cost_snapshot_json jsonb not null default '{}',confirmation_json jsonb not null default '{}',application_fee_due_at timestamptz,application_data jsonb default '{}',submitted_snapshot_json jsonb,submitted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
  create table rental_application_consents(id uuid primary key default gen_random_uuid(),application_id uuid,organisation_id uuid,consent_type text,wording_version text,accepted_at timestamptz default now(),source text default 'applicant',evidence_json jsonb);
  create table rental_application_documents(id uuid primary key default gen_random_uuid(),application_id uuid,organisation_id uuid,document_type text,status text default 'uploaded',file_name text,storage_path text,intake_bundle_id uuid default gen_random_uuid(),uploaded_at timestamptz default now(),created_at timestamptz default now(),review_note text,reviewed_by uuid,reviewed_at timestamptz);
  grant select on rental_applications,rental_vacancies,rental_properties to authenticated;
  grant select,insert,update on rental_application_documents to authenticated; grant select,insert on rental_application_consents to authenticated;`)
  for (const file of [
    '20260905141017_rental_application_review_workspace.sql',
    '20260905141018_rental_application_screening.sql',
    '20260905141020_rental_application_decisions.sql',
    '20260905141021_rental_application_tenancy_conversion.sql',
    '20260913120000_rental_application_approval_readiness.sql',
    '20261002213625_rental_application_review_and_handoff.sql',
    '20261003071610_rental_application_evidence_consistency.sql',
    '20261003072828_rental_onboarding_requirement_foundation.sql',
    '20261003075136_rental_saved_checklist_workflow.sql',
    '20261003080507_rental_landlord_onboarding_collection.sql',
    '20261003090506_rental_onboarding_handoff_continuity.sql',
    '20261007202606_rental_application_deferred_documents.sql',
  ])
    await db.exec(readFileSync(new URL(file, root), 'utf8'))
  return db
}
