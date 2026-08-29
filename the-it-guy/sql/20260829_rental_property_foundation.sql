-- Rentals Phase 6/7: canonical CRM-party links and managed-property foundation.
-- This migration is expand-only and deliberately does not alter private_listings.
begin;

create table if not exists public.rental_properties (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  assigned_manager_id uuid references public.profiles(id) on delete set null,
  name text not null,
  property_type text not null,
  status text not null default 'draft',
  address_line_1 text not null,
  address_line_2 text,
  suburb text,
  city text not null,
  province text,
  postal_code text,
  address_normalized text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_properties_type_check check (property_type in ('house', 'apartment', 'townhouse', 'duplex', 'studio', 'estate', 'commercial', 'other')),
  constraint rental_properties_status_check check (status in ('draft', 'active', 'archived'))
);

create unique index if not exists rental_properties_org_address_active_unique
  on public.rental_properties(organisation_id, address_normalized)
  where status <> 'archived';
create index if not exists rental_properties_org_branch_status_idx on public.rental_properties(organisation_id, branch_id, status, updated_at desc);
create index if not exists rental_properties_org_manager_idx on public.rental_properties(organisation_id, assigned_manager_id, updated_at desc);

create table if not exists public.rental_party_relationships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  party_id uuid not null,
  role text not null,
  entity_type text not null,
  entity_id uuid not null,
  relationship_status text not null default 'active',
  is_primary_contact boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_party_relationship_role_check check (role in ('landlord', 'applicant', 'tenant', 'contractor')),
  constraint rental_party_relationship_entity_check check (entity_type in ('rental_property', 'rental_application', 'rental_tenancy', 'rental_maintenance_request', 'rental_inspection')),
  constraint rental_party_relationship_status_check check (relationship_status in ('active', 'inactive', 'ended'))
);
create unique index if not exists rental_party_relationship_active_unique
  on public.rental_party_relationships(organisation_id, party_id, role, entity_type, entity_id)
  where relationship_status = 'active';
create index if not exists rental_party_relationship_entity_idx on public.rental_party_relationships(organisation_id, entity_type, entity_id);

create table if not exists public.rental_party_workflow_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  relationship_id uuid references public.rental_party_relationships(id) on delete set null,
  party_id uuid not null,
  role text not null,
  entity_type text not null,
  entity_id uuid not null,
  source_revision text,
  snapshot_json jsonb not null,
  captured_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists rental_party_snapshot_entity_idx on public.rental_party_workflow_snapshots(organisation_id, entity_type, entity_id, captured_at desc);

create or replace function public.rental_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_rental_properties_updated_at on public.rental_properties;
create trigger trg_rental_properties_updated_at before update on public.rental_properties for each row execute function public.rental_set_updated_at();
drop trigger if exists trg_rental_party_relationships_updated_at on public.rental_party_relationships;
create trigger trg_rental_party_relationships_updated_at before update on public.rental_party_relationships for each row execute function public.rental_set_updated_at();

alter table public.rental_properties enable row level security;
alter table public.rental_party_relationships enable row level security;
alter table public.rental_party_workflow_snapshots enable row level security;
revoke all on public.rental_properties, public.rental_party_relationships, public.rental_party_workflow_snapshots from anon, authenticated;
grant select, insert, update on public.rental_properties, public.rental_party_relationships to authenticated;
grant select on public.rental_party_workflow_snapshots to authenticated;

-- An org admin can operate across branches; other members require their active branch membership.
create or replace function public.rental_branch_access(target_org uuid, target_branch uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.bridge_is_org_admin(target_org)
    or (target_branch is null and public.bridge_is_active_member(target_org))
    or exists (
      select 1 from public.branch_members bm
      join public.organisation_branches ob on ob.id = bm.branch_id
      where bm.branch_id = target_branch and bm.user_id = (select auth.uid()) and bm.status = 'active' and ob.organisation_id = target_org
    );
$$;

drop policy if exists rental_properties_select_scoped on public.rental_properties;
create policy rental_properties_select_scoped on public.rental_properties for select to authenticated
using (public.rental_branch_access(organisation_id, branch_id));
drop policy if exists rental_properties_insert_scoped on public.rental_properties;
create policy rental_properties_insert_scoped on public.rental_properties for insert to authenticated
with check (public.rental_branch_access(organisation_id, branch_id) and (public.bridge_is_org_admin(organisation_id) or assigned_manager_id = (select auth.uid()) or created_by = (select auth.uid())));
drop policy if exists rental_properties_update_scoped on public.rental_properties;
create policy rental_properties_update_scoped on public.rental_properties for update to authenticated
using (public.rental_branch_access(organisation_id, branch_id) and (public.bridge_is_org_admin(organisation_id) or assigned_manager_id = (select auth.uid()) or created_by = (select auth.uid())))
with check (public.rental_branch_access(organisation_id, branch_id) and (public.bridge_is_org_admin(organisation_id) or assigned_manager_id = (select auth.uid()) or created_by = (select auth.uid())));

drop policy if exists rental_party_relationships_select_scoped on public.rental_party_relationships;
create policy rental_party_relationships_select_scoped on public.rental_party_relationships for select to authenticated using (public.rental_branch_access(organisation_id, branch_id));
drop policy if exists rental_party_relationships_insert_scoped on public.rental_party_relationships;
create policy rental_party_relationships_insert_scoped on public.rental_party_relationships for insert to authenticated with check (public.rental_branch_access(organisation_id, branch_id));
drop policy if exists rental_party_relationships_update_scoped on public.rental_party_relationships;
create policy rental_party_relationships_update_scoped on public.rental_party_relationships for update to authenticated using (public.rental_branch_access(organisation_id, branch_id)) with check (public.rental_branch_access(organisation_id, branch_id));
drop policy if exists rental_party_snapshots_select_scoped on public.rental_party_workflow_snapshots;
create policy rental_party_snapshots_select_scoped on public.rental_party_workflow_snapshots for select to authenticated using (public.rental_branch_access(organisation_id, branch_id));
commit;
