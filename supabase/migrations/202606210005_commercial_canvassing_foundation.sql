begin;

create extension if not exists "pgcrypto";

create table if not exists public.commercial_canvassing_prospects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  assigned_broker_id uuid references auth.users(id) on delete set null,
  assigned_broker_name text,
  assigned_broker_email text,
  company_name text,
  contact_name text,
  first_name text,
  last_name text,
  phone text,
  email text,
  prospect_type text not null default 'Landlord Prospect',
  prospect_role text,
  deal_type text,
  property_category text,
  canvassing_method text not null default 'Cold Call',
  property_type text,
  area text,
  status text not null default 'New',
  next_follow_up_date date,
  follow_up_priority text not null default 'Medium',
  follow_up_note text,
  estimated_value numeric(14, 2),
  notes text,
  linked_entity_type text,
  linked_entity_id uuid,
  company_id uuid references public.commercial_companies(id) on delete set null,
  contact_id uuid references public.commercial_contacts(id) on delete set null,
  property_id uuid references public.commercial_properties(id) on delete set null,
  vacancy_id uuid references public.commercial_vacancies(id) on delete set null,
  listing_id uuid references public.commercial_listings(id) on delete set null,
  requirement_id uuid references public.commercial_requirements(id) on delete set null,
  deal_id uuid references public.commercial_deals(id) on delete set null,
  converted_requirement_id uuid references public.commercial_requirements(id) on delete set null,
  converted_deal_id uuid references public.commercial_deals(id) on delete set null,
  converted_contact_id uuid references public.commercial_contacts(id) on delete set null,
  converted_company_id uuid references public.commercial_companies(id) on delete set null,
  converted_at timestamptz,
  lost_reason text,
  archived_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint commercial_canvassing_prospects_priority_check
    check (follow_up_priority in ('Low', 'Medium', 'High', 'Urgent')),
  constraint commercial_canvassing_prospects_deal_type_check
    check (deal_type is null or deal_type in ('lease', 'sale')),
  constraint commercial_canvassing_prospects_role_check
    check (prospect_role is null or prospect_role in ('landlord', 'tenant', 'seller', 'buyer')),
  constraint commercial_canvassing_prospects_category_check
    check (property_category is null or property_category in ('office', 'retail', 'industrial', 'mixed_use', 'commercial', 'agricultural', 'other'))
);

create table if not exists public.commercial_canvassing_activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  prospect_id uuid not null references public.commercial_canvassing_prospects(id) on delete cascade,
  broker_id uuid references auth.users(id) on delete set null,
  broker_name text,
  activity_type text not null default 'Note',
  activity_note text,
  outcome text,
  activity_date timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists commercial_canvassing_prospects_org_status_idx
  on public.commercial_canvassing_prospects (organisation_id, status, created_at desc);
create index if not exists commercial_canvassing_prospects_hierarchy_idx
  on public.commercial_canvassing_prospects (organisation_id, branch_id, team_id, assigned_broker_id);
create index if not exists commercial_canvassing_prospects_role_idx
  on public.commercial_canvassing_prospects (organisation_id, deal_type, prospect_role, property_category);
create index if not exists commercial_canvassing_prospects_follow_up_idx
  on public.commercial_canvassing_prospects (organisation_id, next_follow_up_date)
  where next_follow_up_date is not null;
create index if not exists commercial_canvassing_prospects_company_idx
  on public.commercial_canvassing_prospects (company_id)
  where company_id is not null;
create index if not exists commercial_canvassing_activities_org_date_idx
  on public.commercial_canvassing_activities (organisation_id, activity_date desc);
create index if not exists commercial_canvassing_activities_prospect_idx
  on public.commercial_canvassing_activities (prospect_id, activity_date desc);

drop trigger if exists trg_bridge_touch_commercial_canvassing_prospects_updated_at on public.commercial_canvassing_prospects;
create trigger trg_bridge_touch_commercial_canvassing_prospects_updated_at
before update on public.commercial_canvassing_prospects
for each row execute function public.bridge_touch_commercial_updated_at();

alter table public.commercial_canvassing_prospects enable row level security;
alter table public.commercial_canvassing_activities enable row level security;

drop policy if exists commercial_canvassing_prospects_brokerage_select on public.commercial_canvassing_prospects;
create policy commercial_canvassing_prospects_brokerage_select
on public.commercial_canvassing_prospects
for select
to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, assigned_broker_id, created_by));

drop policy if exists commercial_canvassing_prospects_brokerage_insert on public.commercial_canvassing_prospects;
create policy commercial_canvassing_prospects_brokerage_insert
on public.commercial_canvassing_prospects
for insert
to authenticated
with check (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)));

drop policy if exists commercial_canvassing_prospects_brokerage_update on public.commercial_canvassing_prospects;
create policy commercial_canvassing_prospects_brokerage_update
on public.commercial_canvassing_prospects
for update
to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, assigned_broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, assigned_broker_id, created_by));

drop policy if exists commercial_canvassing_prospects_brokerage_delete on public.commercial_canvassing_prospects;
create policy commercial_canvassing_prospects_brokerage_delete
on public.commercial_canvassing_prospects
for delete
to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, assigned_broker_id, created_by));

drop policy if exists commercial_canvassing_activities_brokerage_select on public.commercial_canvassing_activities;
create policy commercial_canvassing_activities_brokerage_select
on public.commercial_canvassing_activities
for select
to authenticated
using (exists (
  select 1
  from public.commercial_canvassing_prospects prospect
  where prospect.id = commercial_canvassing_activities.prospect_id
    and prospect.organisation_id = commercial_canvassing_activities.organisation_id
    and public.bridge_commercial_can_access_record(prospect.organisation_id, prospect.branch_id, prospect.team_id, prospect.assigned_broker_id, prospect.created_by)
));

drop policy if exists commercial_canvassing_activities_brokerage_insert on public.commercial_canvassing_activities;
create policy commercial_canvassing_activities_brokerage_insert
on public.commercial_canvassing_activities
for insert
to authenticated
with check (exists (
  select 1
  from public.commercial_canvassing_prospects prospect
  where prospect.id = commercial_canvassing_activities.prospect_id
    and prospect.organisation_id = commercial_canvassing_activities.organisation_id
    and public.bridge_commercial_can_access_record(prospect.organisation_id, prospect.branch_id, prospect.team_id, prospect.assigned_broker_id, prospect.created_by)
));

drop policy if exists commercial_canvassing_activities_brokerage_delete on public.commercial_canvassing_activities;
create policy commercial_canvassing_activities_brokerage_delete
on public.commercial_canvassing_activities
for delete
to authenticated
using (exists (
  select 1
  from public.commercial_canvassing_prospects prospect
  where prospect.id = commercial_canvassing_activities.prospect_id
    and prospect.organisation_id = commercial_canvassing_activities.organisation_id
    and public.bridge_commercial_can_access_record(prospect.organisation_id, prospect.branch_id, prospect.team_id, prospect.assigned_broker_id, prospect.created_by)
));

grant select, insert, update, delete on public.commercial_canvassing_prospects to authenticated;
grant select, insert, delete on public.commercial_canvassing_activities to authenticated;

notify pgrst, 'reload schema';

commit;
