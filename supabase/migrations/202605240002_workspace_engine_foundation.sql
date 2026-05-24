begin;

create extension if not exists "pgcrypto";

alter table if exists public.organisations
  add column if not exists type text,
  add column if not exists legal_name text,
  add column if not exists registration_number text,
  add column if not exists billing_email text,
  add column if not exists status text not null default 'active',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists settings_json jsonb not null default '{}'::jsonb;

alter table if exists public.organisations
  drop constraint if exists organisations_type_check;

alter table if exists public.organisations
  add constraint organisations_type_check
  check (type is null or type in ('agency', 'developer_company', 'attorney_firm', 'bond_originator'));

alter table if exists public.organisations
  drop constraint if exists organisations_status_check;

alter table if exists public.organisations
  add constraint organisations_status_check
  check (status in ('active', 'pending', 'suspended', 'archived'));

alter table if exists public.organisation_users
  add column if not exists app_role text,
  add column if not exists workspace_type text,
  add column if not exists organisation_role text,
  add column if not exists department_id uuid,
  add column if not exists team_id uuid,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.organisation_users
set organisation_role = role
where organisation_role is null and role is not null;

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_role_check;

alter table if exists public.organisation_users
  add constraint organisation_users_role_check
  check (role in (
    'super_admin',
    'owner',
    'principal',
    'director',
    'partner',
    'admin',
    'branch_manager',
    'manager',
    'sales_manager',
    'development_manager',
    'developer',
    'sales_agent',
    'agent',
    'attorney',
    'conveyancer',
    'consultant',
    'processor',
    'bond_originator',
    'admin_staff',
    'paralegal',
    'viewer'
  ));

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_status_check;

alter table if exists public.organisation_users
  add constraint organisation_users_status_check
  check (status in ('invited', 'pending', 'active', 'suspended', 'removed', 'deactivated'));

create or replace function public.bridge_is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_membership_role(target_org) in (
      'super_admin',
      'owner',
      'principal',
      'director',
      'partner',
      'admin',
      'branch_manager',
      'manager',
      'sales_manager',
      'development_manager',
      'developer'
    ),
    false
  );
$$;

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  workspace_type text not null,
  invited_email text not null,
  app_role text not null,
  organisation_role text not null,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  department_id uuid,
  team_id uuid,
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending',
  expires_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invites_workspace_type_check
    check (workspace_type in ('agency', 'developer_company', 'attorney_firm', 'bond_originator')),
  constraint workspace_invites_app_role_check
    check (app_role in ('agent', 'developer', 'attorney', 'bond_originator', 'client', 'platform_admin')),
  constraint workspace_invites_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked'))
);

create index if not exists workspace_invites_workspace_status_idx
  on public.workspace_invites (workspace_id, status, created_at desc);

create index if not exists workspace_invites_email_status_idx
  on public.workspace_invites (lower(invited_email), status);

create unique index if not exists workspace_invites_token_unique_idx
  on public.workspace_invites (token);

drop trigger if exists trg_workspace_invites_updated_at on public.workspace_invites;
create trigger trg_workspace_invites_updated_at
before update on public.workspace_invites
for each row
execute function public.set_updated_at_timestamp();

create table if not exists public.workspace_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requester_email text not null,
  app_role text not null,
  workspace_type text not null,
  requested_workspace_id uuid references public.organisations(id) on delete set null,
  requested_workspace_name text,
  intended_org_role text not null,
  status text not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  constraint workspace_access_requests_app_role_check
    check (app_role in ('agent', 'developer', 'attorney', 'bond_originator', 'client', 'platform_admin')),
  constraint workspace_access_requests_workspace_type_check
    check (workspace_type in ('agency', 'developer_company', 'attorney_firm', 'bond_originator')),
  constraint workspace_access_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

create index if not exists workspace_access_requests_requester_idx
  on public.workspace_access_requests (requester_user_id, status, created_at desc);

create index if not exists workspace_access_requests_workspace_idx
  on public.workspace_access_requests (requested_workspace_id, status, created_at desc);

drop trigger if exists trg_workspace_access_requests_updated_at on public.workspace_access_requests;
create trigger trg_workspace_access_requests_updated_at
before update on public.workspace_access_requests
for each row
execute function public.set_updated_at_timestamp();

alter table public.workspace_invites enable row level security;
alter table public.workspace_access_requests enable row level security;

drop policy if exists workspace_invites_select_admin_or_invitee on public.workspace_invites;
create policy workspace_invites_select_admin_or_invitee on public.workspace_invites
for select to authenticated
using (
  public.bridge_is_org_admin(workspace_id)
  or (
    status = 'pending'
    and lower(invited_email) = public.bridge_current_email()
    and (expires_at is null or expires_at > now())
  )
);

drop policy if exists workspace_invites_insert_admin on public.workspace_invites;
create policy workspace_invites_insert_admin on public.workspace_invites
for insert to authenticated
with check (public.bridge_is_org_admin(workspace_id));

drop policy if exists workspace_invites_update_admin_or_invitee on public.workspace_invites;
create policy workspace_invites_update_admin_or_invitee on public.workspace_invites
for update to authenticated
using (
  public.bridge_is_org_admin(workspace_id)
  or (
    status = 'pending'
    and lower(invited_email) = public.bridge_current_email()
    and (expires_at is null or expires_at > now())
  )
)
with check (
  public.bridge_is_org_admin(workspace_id)
  or (
    status in ('pending', 'accepted')
    and lower(invited_email) = public.bridge_current_email()
  )
);

drop policy if exists workspace_access_requests_select_requester_or_admin on public.workspace_access_requests;
create policy workspace_access_requests_select_requester_or_admin on public.workspace_access_requests
for select to authenticated
using (
  requester_user_id = auth.uid()
  or (
    requested_workspace_id is not null
    and public.bridge_is_org_admin(requested_workspace_id)
  )
);

drop policy if exists workspace_access_requests_insert_self on public.workspace_access_requests;
create policy workspace_access_requests_insert_self on public.workspace_access_requests
for insert to authenticated
with check (
  requester_user_id = auth.uid()
  and lower(requester_email) = public.bridge_current_email()
);

drop policy if exists workspace_access_requests_update_requester_or_admin on public.workspace_access_requests;
create policy workspace_access_requests_update_requester_or_admin on public.workspace_access_requests
for update to authenticated
using (
  requester_user_id = auth.uid()
  or (
    requested_workspace_id is not null
    and public.bridge_is_org_admin(requested_workspace_id)
  )
)
with check (
  requester_user_id = auth.uid()
  or (
    requested_workspace_id is not null
    and public.bridge_is_org_admin(requested_workspace_id)
  )
);

grant select, insert, update on public.workspace_invites to authenticated;
grant select, insert, update on public.workspace_access_requests to authenticated;
grant execute on function public.bridge_is_org_admin(uuid) to authenticated;

commit;
