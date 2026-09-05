-- Rentals Phase 10: explicit landlord ownership and management authority.
-- Depends on the rental property foundation and does not alter Sales data.
begin;

create table if not exists public.rental_property_landlords (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  party_id uuid not null,
  ownership_share numeric(5,2) not null check (ownership_share > 0 and ownership_share <= 100),
  is_primary_contact boolean not null default false,
  relationship_status text not null default 'active',
  effective_from date,
  effective_to date,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_property_landlords_status_check check (relationship_status in ('active', 'inactive', 'ended')),
  constraint rental_property_landlords_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create unique index if not exists rental_property_landlords_active_party_unique on public.rental_property_landlords(property_id, party_id) where relationship_status = 'active';
create unique index if not exists rental_property_landlords_primary_contact_unique on public.rental_property_landlords(property_id) where relationship_status = 'active' and is_primary_contact;
create index if not exists rental_property_landlords_property_status_idx on public.rental_property_landlords(property_id, relationship_status, created_at desc);

create table if not exists public.rental_property_mandates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  mandate_status text not null default 'draft',
  authority_status text not null default 'pending',
  starts_on date,
  ends_on date,
  management_fee_type text not null default 'percentage',
  management_fee_amount numeric(14,2) not null default 0 check (management_fee_amount >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_property_mandates_status_check check (mandate_status in ('draft', 'active', 'expired', 'terminated')),
  constraint rental_property_mandates_authority_check check (authority_status in ('pending', 'confirmed', 'withdrawn')),
  constraint rental_property_mandates_fee_type_check check (management_fee_type in ('percentage', 'fixed')),
  constraint rental_property_mandates_percentage_fee_check check (management_fee_type <> 'percentage' or management_fee_amount <= 100),
  constraint rental_property_mandates_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index if not exists rental_property_mandates_current_active_unique on public.rental_property_mandates(property_id) where mandate_status = 'active';
create index if not exists rental_property_mandates_property_status_idx on public.rental_property_mandates(property_id, mandate_status, starts_on desc);

create or replace function public.rental_property_scoped_record_validate()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare property_org uuid; property_branch uuid;
begin
  select organisation_id, branch_id into property_org, property_branch from public.rental_properties where id = new.property_id;
  if property_org is null or property_org <> new.organisation_id then raise exception 'Rental record organisation must match its property'; end if;
  if new.branch_id is null then new.branch_id := property_branch; end if;
  if property_branch is not null and new.branch_id is distinct from property_branch then raise exception 'Rental record branch must match its property'; end if;
  return new;
end; $$;
drop trigger if exists trg_rental_property_landlords_validate_scope on public.rental_property_landlords;
create trigger trg_rental_property_landlords_validate_scope before insert or update of property_id, organisation_id, branch_id on public.rental_property_landlords for each row execute function public.rental_property_scoped_record_validate();
drop trigger if exists trg_rental_property_mandates_validate_scope on public.rental_property_mandates;
create trigger trg_rental_property_mandates_validate_scope before insert or update of property_id, organisation_id, branch_id on public.rental_property_mandates for each row execute function public.rental_property_scoped_record_validate();
drop trigger if exists trg_rental_property_landlords_updated_at on public.rental_property_landlords;
create trigger trg_rental_property_landlords_updated_at before update on public.rental_property_landlords for each row execute function public.rental_set_updated_at();
drop trigger if exists trg_rental_property_mandates_updated_at on public.rental_property_mandates;
create trigger trg_rental_property_mandates_updated_at before update on public.rental_property_mandates for each row execute function public.rental_set_updated_at();

alter table public.rental_property_landlords enable row level security;
alter table public.rental_property_mandates enable row level security;
revoke all on public.rental_property_landlords, public.rental_property_mandates from anon, authenticated;
grant select, insert, update on public.rental_property_landlords, public.rental_property_mandates to authenticated;

drop policy if exists rental_property_landlords_select_scoped on public.rental_property_landlords;
create policy rental_property_landlords_select_scoped on public.rental_property_landlords for select to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
drop policy if exists rental_property_landlords_insert_scoped on public.rental_property_landlords;
create policy rental_property_landlords_insert_scoped on public.rental_property_landlords for insert to authenticated with check (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));
drop policy if exists rental_property_landlords_update_scoped on public.rental_property_landlords;
create policy rental_property_landlords_update_scoped on public.rental_property_landlords for update to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid())))) with check (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));

drop policy if exists rental_property_mandates_select_scoped on public.rental_property_mandates;
create policy rental_property_mandates_select_scoped on public.rental_property_mandates for select to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
drop policy if exists rental_property_mandates_insert_scoped on public.rental_property_mandates;
create policy rental_property_mandates_insert_scoped on public.rental_property_mandates for insert to authenticated with check (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));
drop policy if exists rental_property_mandates_update_scoped on public.rental_property_mandates;
create policy rental_property_mandates_update_scoped on public.rental_property_mandates for update to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid())))) with check (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));

-- The future vacancy/publishing command must require marketing_ready = true.
-- This caller-RLS view provides that invariant without copying landlord data.
create or replace view public.rental_property_marketing_readiness with (security_invoker = true) as
select property.id as property_id, property.organisation_id, property.branch_id,
  landlord_rollup.active_landlord_count, landlord_rollup.has_primary_contact, landlord_rollup.active_ownership_share, mandate_rollup.has_active_mandate,
  (landlord_rollup.active_landlord_count > 0 and landlord_rollup.has_primary_contact and landlord_rollup.active_ownership_share >= 100 and mandate_rollup.has_active_mandate) as marketing_ready
from public.rental_properties property
left join lateral (
  select count(*) filter (where relationship_status = 'active')::integer as active_landlord_count,
    coalesce(bool_or(is_primary_contact) filter (where relationship_status = 'active'), false) as has_primary_contact,
    coalesce(sum(ownership_share) filter (where relationship_status = 'active'), 0)::numeric(7,2) as active_ownership_share
  from public.rental_property_landlords where property_id = property.id
) landlord_rollup on true
left join lateral (
  select coalesce(bool_or(mandate_status = 'active' and authority_status = 'confirmed' and (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date)), false) as has_active_mandate
  from public.rental_property_mandates where property_id = property.id
) mandate_rollup on true;
revoke all on public.rental_property_marketing_readiness from anon, authenticated;
grant select on public.rental_property_marketing_readiness to authenticated;
commit;
