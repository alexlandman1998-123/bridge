-- Bridge 9 Agency hierarchy refactor (Phase 1 foundation)
-- Purpose: standardize branch/office architecture for principal-level agency workspace.
-- NOTE: Reuses existing organisation_branches to avoid introducing a second branch system.

alter table if exists public.organisation_branches
  add column if not exists slug text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists principal_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists logo_url text,
  add column if not exists cover_image_url text;

create unique index if not exists organisation_branches_org_slug_unique
  on public.organisation_branches (organisation_id, slug)
  where slug is not null;

create index if not exists organisation_branches_principal_idx
  on public.organisation_branches (principal_user_id);

create index if not exists organisation_branches_active_idx
  on public.organisation_branches (organisation_id, is_active);

create table if not exists public.branch_members (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.organisation_branches(id) on delete cascade,
  organisation_user_id uuid references public.organisation_users(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  role text not null default 'agent',
  status text not null default 'active',
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, user_id)
);

alter table if exists public.branch_members drop constraint if exists branch_members_role_check;
alter table if exists public.branch_members
  add constraint branch_members_role_check
  check (role in ('principal', 'manager', 'agent', 'assistant', 'admin'));

alter table if exists public.branch_members drop constraint if exists branch_members_status_check;
alter table if exists public.branch_members
  add constraint branch_members_status_check
  check (status in ('invited', 'active', 'inactive', 'removed'));

create index if not exists branch_members_branch_idx on public.branch_members (branch_id);
create index if not exists branch_members_user_idx on public.branch_members (user_id);
create index if not exists branch_members_org_user_idx on public.branch_members (organisation_user_id);

-- Add explicit branch_id support across key agency entities where available.
alter table if exists public.transactions
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null;

create index if not exists transactions_branch_id_idx on public.transactions (branch_id);

alter table if exists public.leads
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null;

create index if not exists leads_branch_id_idx on public.leads (branch_id);

alter table if exists public.private_listings
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null;

create index if not exists private_listings_branch_id_idx on public.private_listings (branch_id);

alter table if exists public.contacts
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null;

create index if not exists contacts_branch_id_idx on public.contacts (branch_id);

alter table if exists public.buyers
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null;

create index if not exists buyers_branch_id_idx on public.buyers (branch_id);

-- Backward compatibility: keep existing assigned_branch_id in sync when branch_id is used.
update public.transactions
set assigned_branch_id = coalesce(assigned_branch_id, branch_id)
where branch_id is not null;

update public.transactions
set branch_id = coalesce(branch_id, assigned_branch_id)
where assigned_branch_id is not null;

-- Optional compatibility view matching requested naming.
create or replace view public.agency_branches as
select
  id,
  organisation_id,
  name,
  slug,
  province,
  city,
  address,
  principal_user_id,
  phone,
  email,
  logo_url,
  cover_image_url,
  is_active,
  created_at,
  updated_at
from public.organisation_branches;
