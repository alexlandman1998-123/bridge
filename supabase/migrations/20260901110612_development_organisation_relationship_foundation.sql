begin;

-- A development can be owned, operated and sold by different organisations.
-- Keep developments.organisation_id as the legacy primary-operator column while
-- this relationship table becomes the source of access and responsibility.
create table if not exists public.development_organisation_relationships (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  relationship_type text not null,
  status text not null default 'active',
  can_view boolean not null default true,
  can_operate boolean not null default false,
  can_manage boolean not null default false,
  can_manage_inventory boolean not null default false,
  can_manage_pricing boolean not null default false,
  can_manage_reservations boolean not null default false,
  can_view_financials boolean not null default false,
  scope_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_organisation_relationships_type_check check (
    relationship_type in (
      'owner',
      'primary_operator',
      'selling_agency',
      'legal_partner',
      'finance_partner',
      'stakeholder'
    )
  ),
  constraint development_organisation_relationships_status_check check (
    status in ('invited', 'active', 'suspended', 'archived')
  ),
  constraint development_organisation_relationships_scope_object_check check (
    jsonb_typeof(scope_json) = 'object'
  ),
  constraint development_organisation_relationships_unique unique (development_id, organisation_id)
);

create index if not exists development_organisation_relationships_development_active_idx
  on public.development_organisation_relationships (development_id, status)
  where status = 'active';

create index if not exists development_organisation_relationships_organisation_active_idx
  on public.development_organisation_relationships (organisation_id, status)
  where status = 'active';

create or replace function public.bridge_touch_development_organisation_relationship_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_development_organisation_relationships_updated_at
  on public.development_organisation_relationships;
create trigger trg_development_organisation_relationships_updated_at
before update on public.development_organisation_relationships
for each row
execute function public.bridge_touch_development_organisation_relationship_updated_at();

-- Existing developments retain their current operating organisation. Ownership
-- is deliberately not inferred from a descriptive developer_company field.
insert into public.development_organisation_relationships (
  development_id,
  organisation_id,
  relationship_type,
  status,
  can_view,
  can_operate,
  can_manage,
  can_manage_inventory,
  can_manage_pricing,
  can_manage_reservations,
  can_view_financials,
  scope_json
)
select
  development.id,
  development.organisation_id,
  'primary_operator',
  'active',
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  jsonb_build_object('source', 'legacy_developments.organisation_id')
from public.developments development
where development.organisation_id is not null
on conflict (development_id, organisation_id) do nothing;

-- New developments continue to be created through the current organisation_id
-- contract, and immediately receive a first-class primary-operator relation.
create or replace function public.bridge_seed_development_primary_operator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organisation_id is not null then
    insert into public.development_organisation_relationships (
      development_id,
      organisation_id,
      relationship_type,
      status,
      can_view,
      can_operate,
      can_manage,
      can_manage_inventory,
      can_manage_pricing,
      can_manage_reservations,
      can_view_financials,
      scope_json,
      created_by
    ) values (
      new.id,
      new.organisation_id,
      'primary_operator',
      'active',
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      jsonb_build_object('source', 'development_insert'),
      (select auth.uid())
    )
    on conflict (development_id, organisation_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.bridge_seed_development_primary_operator() from public, anon, authenticated;

drop trigger if exists trg_development_seed_primary_operator on public.developments;
create trigger trg_development_seed_primary_operator
after insert on public.developments
for each row
execute function public.bridge_seed_development_primary_operator();

-- Capability helpers deliberately use active organisation membership, rather
-- than a user-level participant row. Participant access remains view-only.
create or replace function public.bridge_has_development_relationship_capability(
  target_development_id uuid,
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.development_organisation_relationships relationship
      join public.organisation_users membership
        on membership.organisation_id = relationship.organisation_id
      where relationship.development_id = target_development_id
        and relationship.status = 'active'
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and case requested_capability
          when 'view' then relationship.can_view
          when 'operate' then relationship.can_operate
          when 'manage' then relationship.can_manage
          when 'inventory' then relationship.can_manage_inventory
          when 'pricing' then relationship.can_manage_pricing
          when 'reservations' then relationship.can_manage_reservations
          when 'financials' then relationship.can_view_financials
          else false
        end
    ),
    false
  );
$$;

create or replace function public.bridge_can_view_development_record(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (
      public.bridge_is_admin()
      or public.bridge_has_development_relationship_capability(target_development_id, 'view')
      or public.bridge_has_development_access(target_development_id)
    ),
    false
  );
$$;

create or replace function public.bridge_can_manage_development_record(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (
      public.bridge_is_admin()
      or public.bridge_has_development_relationship_capability(target_development_id, 'manage')
    ),
    false
  );
$$;

create or replace function public.bridge_can_manage_development_units(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (
      public.bridge_is_admin()
      or public.bridge_has_development_relationship_capability(target_development_id, 'inventory')
    ),
    false
  );
$$;

revoke all on function public.bridge_has_development_relationship_capability(uuid, text) from public, anon;
revoke all on function public.bridge_can_view_development_record(uuid) from public, anon;
revoke all on function public.bridge_can_manage_development_record(uuid) from public, anon;
revoke all on function public.bridge_can_manage_development_units(uuid) from public, anon;
grant execute on function public.bridge_has_development_relationship_capability(uuid, text) to authenticated;
grant execute on function public.bridge_can_view_development_record(uuid) to authenticated;
grant execute on function public.bridge_can_manage_development_record(uuid) to authenticated;
grant execute on function public.bridge_can_manage_development_units(uuid) to authenticated;

alter table public.development_organisation_relationships enable row level security;
revoke all on table public.development_organisation_relationships from anon, authenticated;
grant select, insert, update, delete on table public.development_organisation_relationships to authenticated;

drop policy if exists development_organisation_relationships_select_scoped on public.development_organisation_relationships;
create policy development_organisation_relationships_select_scoped
on public.development_organisation_relationships
for select to authenticated
using (public.bridge_can_view_development_record(development_id));

drop policy if exists development_organisation_relationships_insert_scoped on public.development_organisation_relationships;
create policy development_organisation_relationships_insert_scoped
on public.development_organisation_relationships
for insert to authenticated
with check (
  public.bridge_can_manage_development_record(development_id)
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists development_organisation_relationships_update_scoped on public.development_organisation_relationships;
create policy development_organisation_relationships_update_scoped
on public.development_organisation_relationships
for update to authenticated
using (public.bridge_can_manage_development_record(development_id))
with check (public.bridge_can_manage_development_record(development_id));

drop policy if exists development_organisation_relationships_delete_scoped on public.development_organisation_relationships;
create policy development_organisation_relationships_delete_scoped
on public.development_organisation_relationships
for delete to authenticated
using (public.bridge_can_manage_development_record(development_id));

-- Replace the previous organisation_id-based management rules with the new
-- relationship capabilities. This keeps external invitees read-only while
-- allowing deliberate organisation-level operating relationships.
do $$
declare
  table_name text;
  table_names text[] := array[
    'development_financials',
    'development_participants',
    'development_profiles',
    'development_documents',
    'development_settings',
    'development_attorney_configs',
    'development_bond_configs'
  ];
begin
  foreach table_name in array table_names loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop policy if exists %I on public.%I', table_name || '_modify_scoped', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_select_scoped', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_insert_scoped', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_update_scoped', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_delete_scoped', table_name);

      execute format(
        'create policy %I on public.%I for select to authenticated using (public.bridge_can_view_development_record(development_id))',
        table_name || '_select_scoped', table_name
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.bridge_can_manage_development_record(development_id))',
        table_name || '_insert_scoped', table_name
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.bridge_can_manage_development_record(development_id)) with check (public.bridge_can_manage_development_record(development_id))',
        table_name || '_update_scoped', table_name
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.bridge_can_manage_development_record(development_id))',
        table_name || '_delete_scoped', table_name
      );
    end if;
  end loop;
end $$;

drop policy if exists units_select_scoped on public.units;
drop policy if exists units_insert_scoped on public.units;
drop policy if exists units_update_scoped on public.units;
drop policy if exists units_delete_scoped on public.units;
create policy units_select_scoped on public.units
for select to authenticated
using (public.bridge_can_view_development_record(development_id));
create policy units_insert_scoped on public.units
for insert to authenticated
with check (public.bridge_can_manage_development_units(development_id));
create policy units_update_scoped on public.units
for update to authenticated
using (public.bridge_can_manage_development_units(development_id))
with check (public.bridge_can_manage_development_units(development_id));
create policy units_delete_scoped on public.units
for delete to authenticated
using (public.bridge_can_manage_development_units(development_id));

drop policy if exists developments_select_scoped on public.developments;
drop policy if exists developments_update_scoped on public.developments;
drop policy if exists developments_delete_scoped on public.developments;
create policy developments_select_scoped on public.developments
for select to authenticated
using (public.bridge_can_view_development_record(id));
create policy developments_update_scoped on public.developments
for update to authenticated
using (public.bridge_can_manage_development_record(id))
with check (public.bridge_can_manage_development_record(id));
create policy developments_delete_scoped on public.developments
for delete to authenticated
using (public.bridge_can_manage_development_record(id));

notify pgrst, 'reload schema';

commit;
