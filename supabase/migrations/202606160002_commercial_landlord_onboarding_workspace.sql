begin;

create extension if not exists "pgcrypto";

alter table if exists public.commercial_landlords
  add column if not exists legal_name text,
  add column if not exists trading_name text,
  add column if not exists entity_type text,
  add column if not exists registration_number text,
  add column if not exists vat_number text,
  add column if not exists vat_registered boolean not null default false,
  add column if not exists registered_address text,
  add column if not exists postal_address text,
  add column if not exists main_email text,
  add column if not exists main_phone text,
  add column if not exists portfolio_type text[] not null default '{}'::text[],
  add column if not exists total_gla_estimate numeric,
  add column if not exists number_of_properties_estimate integer,
  add column if not exists onboarding_status text not null default 'not_sent',
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table if exists public.commercial_properties
  add column if not exists asset_manager_id uuid,
  add column if not exists property_manager_id uuid,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table if exists public.commercial_vacancies
  add column if not exists property_manager_id uuid,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table if exists public.commercial_documents
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table if exists public.commercial_document_requests
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create table if not exists public.commercial_landlord_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  landlord_id uuid not null references public.commercial_landlords(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  broker_id uuid references auth.users(id) on delete set null,
  contact_type text not null,
  full_name text not null,
  position text,
  email text,
  mobile text,
  id_number text,
  signing_capacity text,
  is_primary boolean not null default false,
  authority_confirmed boolean not null default false,
  can_approve_mandates boolean not null default false,
  can_approve_leasing_terms boolean not null default false,
  can_approve_sales_terms boolean not null default false,
  portfolio_region text,
  responsibilities jsonb not null default '[]'::jsonb,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_landlord_contacts_contact_type_not_blank check (length(trim(contact_type)) > 0),
  constraint commercial_landlord_contacts_full_name_not_blank check (length(trim(full_name)) > 0)
);

create table if not exists public.commercial_mandates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  landlord_id uuid not null references public.commercial_landlords(id) on delete cascade,
  property_id uuid references public.commercial_properties(id) on delete set null,
  vacancy_id uuid references public.commercial_vacancies(id) on delete set null,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  broker_id uuid references auth.users(id) on delete set null,
  mandate_kind text not null,
  mandate_type text not null,
  start_date date,
  expiry_date date,
  commission_structure text,
  brokerage_assigned text,
  broker_assigned text,
  notes text,
  status text not null default 'active',
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_mandates_kind_not_blank check (length(trim(mandate_kind)) > 0),
  constraint commercial_mandates_type_not_blank check (length(trim(mandate_type)) > 0)
);

create table if not exists public.commercial_landlord_onboarding (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  landlord_id uuid not null references public.commercial_landlords(id) on delete cascade,
  portal_access_id uuid references public.commercial_portal_access(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  entity_type text,
  portfolio_type text[] not null default '{}'::text[],
  status text not null default 'not_sent',
  completion_percentage integer not null default 0,
  secure_token text unique,
  form_data jsonb not null default '{}'::jsonb,
  missing_field_keys text[] not null default '{}'::text[],
  required_document_keys text[] not null default '{}'::text[],
  missing_document_keys text[] not null default '{}'::text[],
  expires_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  last_email_kind text,
  last_email_sent_at timestamptz,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_landlord_onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.commercial_landlord_onboarding(id) on delete cascade,
  field_key text not null,
  field_value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_landlord_onboarding_responses_field_key_not_blank check (length(trim(field_key)) > 0),
  constraint commercial_landlord_onboarding_responses_unique_key unique (onboarding_id, field_key)
);

alter table if exists public.commercial_properties
  drop constraint if exists commercial_properties_asset_manager_id_fkey;

alter table if exists public.commercial_properties
  add constraint commercial_properties_asset_manager_id_fkey
  foreign key (asset_manager_id) references public.commercial_landlord_contacts(id) on delete set null not valid;

alter table if exists public.commercial_properties
  drop constraint if exists commercial_properties_property_manager_id_fkey;

alter table if exists public.commercial_properties
  add constraint commercial_properties_property_manager_id_fkey
  foreign key (property_manager_id) references public.commercial_landlord_contacts(id) on delete set null not valid;

alter table if exists public.commercial_vacancies
  drop constraint if exists commercial_vacancies_property_manager_id_fkey;

alter table if exists public.commercial_vacancies
  add constraint commercial_vacancies_property_manager_id_fkey
  foreign key (property_manager_id) references public.commercial_landlord_contacts(id) on delete set null not valid;

create index if not exists commercial_landlord_contacts_landlord_idx
  on public.commercial_landlord_contacts (organisation_id, landlord_id, contact_type, is_primary);
create index if not exists commercial_landlord_contacts_hierarchy_idx
  on public.commercial_landlord_contacts (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_mandates_landlord_idx
  on public.commercial_mandates (organisation_id, landlord_id, status, mandate_kind, expiry_date);
create index if not exists commercial_mandates_property_idx
  on public.commercial_mandates (property_id, vacancy_id);
create index if not exists commercial_mandates_hierarchy_idx
  on public.commercial_mandates (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_landlord_onboarding_landlord_idx
  on public.commercial_landlord_onboarding (organisation_id, landlord_id, status, created_at desc);
create index if not exists commercial_landlord_onboarding_token_idx
  on public.commercial_landlord_onboarding (secure_token);
create index if not exists commercial_landlord_onboarding_responses_onboarding_idx
  on public.commercial_landlord_onboarding_responses (onboarding_id);
create index if not exists commercial_properties_landlord_manager_idx
  on public.commercial_properties (landlord_id, asset_manager_id, property_manager_id);
create index if not exists commercial_vacancies_landlord_manager_idx
  on public.commercial_vacancies (landlord_id, property_id, property_manager_id);

drop trigger if exists trg_bridge_touch_commercial_landlord_contacts_updated_at on public.commercial_landlord_contacts;
create trigger trg_bridge_touch_commercial_landlord_contacts_updated_at
before update on public.commercial_landlord_contacts
for each row execute function public.bridge_touch_commercial_updated_at();

drop trigger if exists trg_bridge_touch_commercial_mandates_updated_at on public.commercial_mandates;
create trigger trg_bridge_touch_commercial_mandates_updated_at
before update on public.commercial_mandates
for each row execute function public.bridge_touch_commercial_updated_at();

drop trigger if exists trg_bridge_touch_commercial_landlord_onboarding_updated_at on public.commercial_landlord_onboarding;
create trigger trg_bridge_touch_commercial_landlord_onboarding_updated_at
before update on public.commercial_landlord_onboarding
for each row execute function public.bridge_touch_commercial_updated_at();

drop trigger if exists trg_bridge_touch_commercial_landlord_onboarding_responses_updated_at on public.commercial_landlord_onboarding_responses;
create trigger trg_bridge_touch_commercial_landlord_onboarding_responses_updated_at
before update on public.commercial_landlord_onboarding_responses
for each row execute function public.bridge_touch_commercial_updated_at();

alter table public.commercial_landlord_contacts enable row level security;
alter table public.commercial_mandates enable row level security;
alter table public.commercial_landlord_onboarding enable row level security;
alter table public.commercial_landlord_onboarding_responses enable row level security;

drop policy if exists commercial_landlord_contacts_brokerage_access on public.commercial_landlord_contacts;
create policy commercial_landlord_contacts_brokerage_access on public.commercial_landlord_contacts
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

drop policy if exists commercial_mandates_brokerage_access on public.commercial_mandates;
create policy commercial_mandates_brokerage_access on public.commercial_mandates
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

drop policy if exists commercial_landlord_onboarding_brokerage_access on public.commercial_landlord_onboarding;
create policy commercial_landlord_onboarding_brokerage_access on public.commercial_landlord_onboarding
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, null, null, null, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, null, null, null, created_by));

drop policy if exists commercial_landlord_onboarding_responses_brokerage_access on public.commercial_landlord_onboarding_responses;
create policy commercial_landlord_onboarding_responses_brokerage_access on public.commercial_landlord_onboarding_responses
for all to authenticated
using (
  exists (
    select 1
    from public.commercial_landlord_onboarding clo
    where clo.id = onboarding_id
      and public.bridge_commercial_can_access_record(clo.organisation_id, null, null, null, clo.created_by)
  )
)
with check (
  exists (
    select 1
    from public.commercial_landlord_onboarding clo
    where clo.id = onboarding_id
      and public.bridge_commercial_can_access_record(clo.organisation_id, null, null, null, clo.created_by)
  )
);

drop policy if exists commercial_landlord_onboarding_portal_select on public.commercial_landlord_onboarding;
create policy commercial_landlord_onboarding_portal_select on public.commercial_landlord_onboarding
for select to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_landlord_onboarding_portal_update on public.commercial_landlord_onboarding;
create policy commercial_landlord_onboarding_portal_update on public.commercial_landlord_onboarding
for update to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id))
with check (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_landlord_onboarding_responses_portal_access on public.commercial_landlord_onboarding_responses;
create policy commercial_landlord_onboarding_responses_portal_access on public.commercial_landlord_onboarding_responses
for all to anon, authenticated
using (
  exists (
    select 1
    from public.commercial_landlord_onboarding clo
    where clo.id = onboarding_id
      and public.bridge_commercial_portal_has_access(clo.organisation_id, 'commercial_landlord', clo.landlord_id)
  )
)
with check (
  exists (
    select 1
    from public.commercial_landlord_onboarding clo
    where clo.id = onboarding_id
      and public.bridge_commercial_portal_has_access(clo.organisation_id, 'commercial_landlord', clo.landlord_id)
  )
);

drop policy if exists commercial_landlord_contacts_portal_access on public.commercial_landlord_contacts;
create policy commercial_landlord_contacts_portal_access on public.commercial_landlord_contacts
for all to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id))
with check (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_mandates_portal_access on public.commercial_mandates;
create policy commercial_mandates_portal_access on public.commercial_mandates
for all to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id))
with check (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_landlords_portal_update on public.commercial_landlords;
create policy commercial_landlords_portal_update on public.commercial_landlords
for update to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', id))
with check (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', id));

drop policy if exists commercial_properties_portal_select_by_landlord on public.commercial_properties;
create policy commercial_properties_portal_select_by_landlord on public.commercial_properties
for select to anon, authenticated
using (landlord_id is not null and public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_properties_portal_insert_by_landlord on public.commercial_properties;
create policy commercial_properties_portal_insert_by_landlord on public.commercial_properties
for insert to anon, authenticated
with check (landlord_id is not null and public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_properties_portal_update_by_landlord on public.commercial_properties;
create policy commercial_properties_portal_update_by_landlord on public.commercial_properties
for update to anon, authenticated
using (landlord_id is not null and public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id))
with check (landlord_id is not null and public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_vacancies_portal_select_by_landlord on public.commercial_vacancies;
create policy commercial_vacancies_portal_select_by_landlord on public.commercial_vacancies
for select to anon, authenticated
using (landlord_id is not null and public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_vacancies_portal_insert_by_landlord on public.commercial_vacancies;
create policy commercial_vacancies_portal_insert_by_landlord on public.commercial_vacancies
for insert to anon, authenticated
with check (landlord_id is not null and public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

drop policy if exists commercial_vacancies_portal_update_by_landlord on public.commercial_vacancies;
create policy commercial_vacancies_portal_update_by_landlord on public.commercial_vacancies
for update to anon, authenticated
using (landlord_id is not null and public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id))
with check (landlord_id is not null and public.bridge_commercial_portal_has_access(organisation_id, 'commercial_landlord', landlord_id));

grant select, insert, update, delete on public.commercial_landlord_contacts to authenticated, anon;
grant select, insert, update, delete on public.commercial_mandates to authenticated, anon;
grant select, insert, update, delete on public.commercial_landlord_onboarding to authenticated, anon;
grant select, insert, update, delete on public.commercial_landlord_onboarding_responses to authenticated, anon;

comment on table public.commercial_landlord_contacts
  is 'Portfolio contacts for commercial landlords including asset managers, property managers, and landlord support contacts.';

comment on table public.commercial_landlord_onboarding
  is 'Secure landlord onboarding workflow state for commercial landlords. Reuses portal access links while tracking completion, missing fields, and draft form data.';

comment on table public.commercial_mandates
  is 'Leasing and sales mandate records linked to commercial landlords, properties, and optional vacancies.';

notify pgrst, 'reload schema';

commit;
