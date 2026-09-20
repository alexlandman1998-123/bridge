-- A public-facing agency roster is deliberately separate from organisation_users.
-- Directory entries power the website but never create authentication accounts,
-- workspace memberships, invitations, or email delivery.
create table if not exists public.agency_public_agents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source text not null default 'manual',
  source_agent_id text,
  first_name text not null,
  last_name text,
  full_name text not null,
  job_title text not null default 'Property practitioner',
  phone_number text,
  whatsapp_number text,
  email text,
  avatar_url text,
  source_profile_url text,
  is_public boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  source_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, source, source_agent_id)
);

create index if not exists agency_public_agents_org_public_idx
  on public.agency_public_agents (organisation_id, is_public, status, sort_order, full_name);

create or replace function public.bridge_touch_agency_public_agents_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agency_public_agents_updated_at on public.agency_public_agents;
create trigger trg_agency_public_agents_updated_at
before update on public.agency_public_agents
for each row execute function public.bridge_touch_agency_public_agents_updated_at();

alter table public.agency_public_agents enable row level security;

drop policy if exists agency_public_agents_member_select on public.agency_public_agents;
create policy agency_public_agents_member_select
on public.agency_public_agents
for select to authenticated
using (
  exists (
    select 1
    from public.organisation_users membership
    where membership.organisation_id = agency_public_agents.organisation_id
      and membership.user_id = (select auth.uid())
      and coalesce(membership.status, '') in ('active', 'accepted')
  )
);

drop policy if exists agency_public_agents_admin_write on public.agency_public_agents;
create policy agency_public_agents_admin_write
on public.agency_public_agents
for all to authenticated
using (
  exists (
    select 1
    from public.organisation_users membership
    where membership.organisation_id = agency_public_agents.organisation_id
      and membership.user_id = (select auth.uid())
      and coalesce(membership.status, '') in ('active', 'accepted')
      and lower(coalesce(membership.workspace_role, membership.organisation_role, membership.role, '')) in ('owner', 'super_admin', 'principal', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.organisation_users membership
    where membership.organisation_id = agency_public_agents.organisation_id
      and membership.user_id = (select auth.uid())
      and coalesce(membership.status, '') in ('active', 'accepted')
      and lower(coalesce(membership.workspace_role, membership.organisation_role, membership.role, '')) in ('owner', 'super_admin', 'principal', 'admin')
  )
);

revoke all on table public.agency_public_agents from anon;
grant select, insert, update, delete on table public.agency_public_agents to authenticated, service_role;
