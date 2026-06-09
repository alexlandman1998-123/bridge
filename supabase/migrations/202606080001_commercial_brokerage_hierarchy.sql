begin;

create extension if not exists "pgcrypto";

create table if not exists public.commercial_teams (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_teams_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists commercial_teams_organisation_idx on public.commercial_teams (organisation_id);
create index if not exists commercial_teams_branch_idx on public.commercial_teams (branch_id);

alter table if exists public.organisation_users
  add column if not exists primary_branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists workspace_role text,
  add column if not exists organisation_role text,
  add column if not exists module_context text,
  add column if not exists module_metadata jsonb not null default '{}'::jsonb;

create index if not exists organisation_users_commercial_module_idx
  on public.organisation_users (organisation_id, user_id, module_context)
  where module_context in ('commercial', 'commercial_brokerage', 'commercial_agency');

alter table if exists public.commercial_landlords
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_tenants
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_properties
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_requirements
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_deals
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_vacancies
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_leases
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_heads_of_terms
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_documents
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_document_requests
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_activity
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists team_id uuid references public.commercial_teams(id) on delete set null,
  add column if not exists broker_id uuid references auth.users(id) on delete set null;

update public.commercial_requirements
set broker_id = coalesce(broker_id, assigned_broker)
where assigned_broker is not null;

update public.commercial_deals
set broker_id = coalesce(broker_id, assigned_broker)
where assigned_broker is not null;

update public.commercial_vacancies
set broker_id = coalesce(broker_id, broker_assignment)
where broker_assignment is not null;

create index if not exists commercial_landlords_hierarchy_idx on public.commercial_landlords (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_tenants_hierarchy_idx on public.commercial_tenants (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_properties_hierarchy_idx on public.commercial_properties (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_requirements_hierarchy_idx on public.commercial_requirements (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_deals_hierarchy_idx on public.commercial_deals (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_vacancies_hierarchy_idx on public.commercial_vacancies (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_leases_hierarchy_idx on public.commercial_leases (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_heads_of_terms_hierarchy_idx on public.commercial_heads_of_terms (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_documents_hierarchy_idx on public.commercial_documents (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_document_requests_hierarchy_idx on public.commercial_document_requests (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_activity_hierarchy_idx on public.commercial_activity (organisation_id, branch_id, team_id, broker_id);

create or replace function public.bridge_commercial_user_scope(target_organisation_id uuid)
returns table(scope_level text, branch_id uuid, team_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager', 'commercial_hq_admin', 'commercial_hq_manager', 'super_admin') then 'organisation'
      when coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('branch_manager', 'branch_admin', 'regional_manager') then 'branch'
      when coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('team_leader', 'team_manager', 'commercial_team_leader') then 'team'
      else 'broker'
    end as scope_level,
    coalesce(ou.primary_branch_id, ou.branch_id) as branch_id,
    ou.team_id,
    ou.user_id
  from public.organisation_users ou
  where ou.organisation_id = target_organisation_id
    and ou.user_id = auth.uid()
    and coalesce(ou.status, 'active') not in ('deactivated', 'removed')
    and (
      coalesce(ou.module_context, '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(ou.workspace_type, '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(ou.workspace_role, ou.organisation_role, ou.role, '') like 'commercial_%'
    )
  limit 1
$$;

create or replace function public.bridge_commercial_can_access_record(
  target_organisation_id uuid,
  target_branch_id uuid,
  target_team_id uuid,
  target_broker_id uuid,
  target_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bridge_commercial_user_scope(target_organisation_id) scope
    where scope.scope_level = 'organisation'
      or (
        scope.scope_level = 'branch'
        and (
          target_branch_id = scope.branch_id
          or target_branch_id is null
        )
      )
      or (
        scope.scope_level = 'team'
        and (
          target_team_id = scope.team_id
          or target_created_by = scope.user_id
        )
      )
      or (
        scope.scope_level = 'broker'
        and (
          target_broker_id = scope.user_id
          or target_created_by = scope.user_id
        )
      )
  )
$$;

drop policy if exists commercial_landlords_member_access on public.commercial_landlords;
drop policy if exists commercial_tenants_member_access on public.commercial_tenants;
drop policy if exists commercial_properties_member_access on public.commercial_properties;
drop policy if exists commercial_requirements_member_access on public.commercial_requirements;
drop policy if exists commercial_deals_member_access on public.commercial_deals;
drop policy if exists commercial_vacancies_member_access on public.commercial_vacancies;
drop policy if exists commercial_leases_member_access on public.commercial_leases;
drop policy if exists commercial_heads_of_terms_member_access on public.commercial_heads_of_terms;
drop policy if exists commercial_documents_member_access on public.commercial_documents;
drop policy if exists commercial_document_requests_member_access on public.commercial_document_requests;
drop policy if exists commercial_activity_member_access on public.commercial_activity;
drop policy if exists commercial_landlords_brokerage_access on public.commercial_landlords;
drop policy if exists commercial_tenants_brokerage_access on public.commercial_tenants;
drop policy if exists commercial_properties_brokerage_access on public.commercial_properties;
drop policy if exists commercial_requirements_brokerage_access on public.commercial_requirements;
drop policy if exists commercial_deals_brokerage_access on public.commercial_deals;
drop policy if exists commercial_vacancies_brokerage_access on public.commercial_vacancies;
drop policy if exists commercial_leases_brokerage_access on public.commercial_leases;
drop policy if exists commercial_heads_of_terms_brokerage_access on public.commercial_heads_of_terms;
drop policy if exists commercial_documents_brokerage_access on public.commercial_documents;
drop policy if exists commercial_document_requests_brokerage_access on public.commercial_document_requests;
drop policy if exists commercial_activity_brokerage_access on public.commercial_activity;

create policy commercial_landlords_brokerage_access on public.commercial_landlords
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

create policy commercial_tenants_brokerage_access on public.commercial_tenants
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

create policy commercial_properties_brokerage_access on public.commercial_properties
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

create policy commercial_requirements_brokerage_access on public.commercial_requirements
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, coalesce(broker_id, assigned_broker), created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, coalesce(broker_id, assigned_broker), created_by));

create policy commercial_deals_brokerage_access on public.commercial_deals
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, coalesce(broker_id, assigned_broker), created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, coalesce(broker_id, assigned_broker), created_by));

create policy commercial_vacancies_brokerage_access on public.commercial_vacancies
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, coalesce(broker_id, broker_assignment), created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, coalesce(broker_id, broker_assignment), created_by));

create policy commercial_leases_brokerage_access on public.commercial_leases
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

create policy commercial_heads_of_terms_brokerage_access on public.commercial_heads_of_terms
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

create policy commercial_documents_brokerage_access on public.commercial_documents
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

create policy commercial_document_requests_brokerage_access on public.commercial_document_requests
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

create policy commercial_activity_brokerage_access on public.commercial_activity
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

alter table public.commercial_teams enable row level security;

drop policy if exists commercial_teams_brokerage_access on public.commercial_teams;
create policy commercial_teams_brokerage_access on public.commercial_teams
for all to authenticated
using (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)))
with check (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)));

grant select, insert, update, delete on public.commercial_teams to authenticated;

commit;
