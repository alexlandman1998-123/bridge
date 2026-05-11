begin;

create extension if not exists "pgcrypto";

create table if not exists public.organisation_branches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  slug text,
  province text,
  city text,
  address text,
  location text,
  manager_name text,
  principal_user_id uuid references auth.users(id) on delete set null,
  phone text,
  email text,
  logo_url text,
  cover_image_url text,
  is_head_office boolean not null default false,
  is_active boolean not null default true,
  agent_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_branches_name_not_blank check (length(trim(name)) > 0),
  constraint organisation_branches_agent_count_nonnegative check (agent_count >= 0)
);

create unique index if not exists organisation_branches_org_slug_unique
  on public.organisation_branches (organisation_id, lower(slug))
  where slug is not null and length(trim(slug)) > 0;

create index if not exists organisation_branches_org_active_idx
  on public.organisation_branches (organisation_id, is_active);

create index if not exists organisation_branches_principal_user_idx
  on public.organisation_branches (principal_user_id);

alter table if exists public.organisation_users
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null;

alter table if exists public.transactions
  add column if not exists assigned_branch_id uuid references public.organisation_branches(id) on delete set null;

alter table if exists public.private_listings
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null;

alter table if exists public.leads
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null;

do $$
begin
  if to_regclass('public.organisation_users') is not null then
    create index if not exists organisation_users_branch_id_idx
      on public.organisation_users (branch_id);
  end if;

  if to_regclass('public.transactions') is not null then
    create index if not exists transactions_assigned_branch_id_idx
      on public.transactions (assigned_branch_id);
  end if;

  if to_regclass('public.private_listings') is not null then
    create index if not exists private_listings_branch_id_idx
      on public.private_listings (branch_id);
  end if;

  if to_regclass('public.leads') is not null then
    create index if not exists leads_branch_id_idx
      on public.leads (branch_id);
  end if;
end $$;

create or replace function public.bridge_touch_organisation_branches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bridge_touch_organisation_branches_updated_at on public.organisation_branches;
create trigger trg_bridge_touch_organisation_branches_updated_at
before update on public.organisation_branches
for each row
execute function public.bridge_touch_organisation_branches_updated_at();

alter table public.organisation_branches enable row level security;

drop policy if exists organisation_branches_agency_select on public.organisation_branches;
create policy organisation_branches_agency_select on public.organisation_branches
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists organisation_branches_agency_insert on public.organisation_branches;
create policy organisation_branches_agency_insert on public.organisation_branches
for insert to authenticated
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_branches_agency_update on public.organisation_branches;
create policy organisation_branches_agency_update on public.organisation_branches
for update to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_branches_agency_delete on public.organisation_branches;
create policy organisation_branches_agency_delete on public.organisation_branches
for delete to authenticated
using (public.bridge_is_org_admin(organisation_id));

insert into public.organisation_branches (
  organisation_id,
  name,
  slug,
  location,
  is_head_office,
  is_active,
  metadata_json
)
select
  org.id,
  coalesce(nullif(trim(org.name), ''), 'Head Office') as name,
  'head-office' as slug,
  'Head Office' as location,
  true,
  true,
  jsonb_build_object('source', 'migration_default')
from public.organisations org
where not exists (
  select 1
  from public.organisation_branches branch
  where branch.organisation_id = org.id
);

grant select, insert, update, delete on public.organisation_branches to authenticated;

commit;
