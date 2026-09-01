begin;

-- A participant invite is a visibility grant. It must not silently become a
-- management grant for the owning agency/developer workspace.
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
      or public.bridge_has_development_org_access(target_development_id)
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
      or public.bridge_has_development_org_access(target_development_id)
    ),
    false
  );
$$;

revoke execute on function public.bridge_can_view_development_record(uuid) from public, anon;
revoke execute on function public.bridge_can_manage_development_record(uuid) from public, anon;
grant execute on function public.bridge_can_view_development_record(uuid) to authenticated;
grant execute on function public.bridge_can_manage_development_record(uuid) to authenticated;

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
      -- Remove older permissive FOR ALL policies before adding the split
      -- read/write policies. PostgreSQL combines policies permissively.
      execute format('drop policy if exists %I on public.%I', table_name || '_modify_scoped', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_select_scoped', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.bridge_can_view_development_record(development_id))',
        table_name || '_select_scoped',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_insert_scoped', table_name);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.bridge_can_manage_development_record(development_id))',
        table_name || '_insert_scoped',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_update_scoped', table_name);
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.bridge_can_manage_development_record(development_id)) with check (public.bridge_can_manage_development_record(development_id))',
        table_name || '_update_scoped',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_delete_scoped', table_name);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.bridge_can_manage_development_record(development_id))',
        table_name || '_delete_scoped',
        table_name
      );
    end if;
  end loop;
end $$;

create or replace function public.bridge_can_manage_development_units(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.bridge_can_manage_development_record(target_development_id);
$$;

revoke execute on function public.bridge_can_manage_development_units(uuid) from public, anon;
grant execute on function public.bridge_can_manage_development_units(uuid) to authenticated;

drop policy if exists units_select_scoped on public.units;
create policy units_select_scoped on public.units
for select to authenticated
using (public.bridge_can_view_development_record(development_id));

drop policy if exists units_insert_scoped on public.units;
create policy units_insert_scoped on public.units
for insert to authenticated
with check (public.bridge_can_manage_development_record(development_id));

drop policy if exists units_update_scoped on public.units;
create policy units_update_scoped on public.units
for update to authenticated
using (public.bridge_can_manage_development_record(development_id))
with check (public.bridge_can_manage_development_record(development_id));

drop policy if exists units_delete_scoped on public.units;
create policy units_delete_scoped on public.units
for delete to authenticated
using (public.bridge_can_manage_development_record(development_id));

drop policy if exists developments_select_scoped on public.developments;
create policy developments_select_scoped on public.developments
for select to authenticated
using (public.bridge_can_view_development_record(id));

drop policy if exists developments_update_scoped on public.developments;
create policy developments_update_scoped on public.developments
for update to authenticated
using (public.bridge_can_manage_development_record(id))
with check (public.bridge_can_manage_development_record(id));

drop policy if exists developments_delete_scoped on public.developments;
create policy developments_delete_scoped on public.developments
for delete to authenticated
using (public.bridge_can_manage_development_record(id));

-- This is the only anonymous development read surface. It returns a curated
-- JSON document only when the marketing record has explicitly been published.
create or replace function public.get_public_development_landing(requested_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select
      d.id,
      d.name,
      d.location,
      d.suburb,
      d.city,
      d.province,
      d.developer_company,
      d.total_units_expected,
      p.marketing_content
    from public.developments d
    join public.development_profiles p on p.development_id = d.id
    where lower(p.marketing_content #>> '{listingConfiguration,listingSlug}') = lower(trim(requested_slug))
      and coalesce((p.marketing_content #>> '{listingConfiguration,publicVisibility}')::boolean, false)
      and lower(coalesce(p.marketing_content #>> '{listingConfiguration,marketingStatus}', 'draft')) = 'live'
    limit 1
  )
  select jsonb_build_object(
    'id', published.id,
    'name', published.name,
    'location', published.location,
    'suburb', published.suburb,
    'city', published.city,
    'province', published.province,
    'developerCompany', published.developer_company,
    'totalUnitsExpected', published.total_units_expected,
    'marketing', published.marketing_content,
    'inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'unitNumber', u.unit_number,
        'unitType', u.unit_type,
        'block', u.block,
        'sizeSqm', u.size_sqm,
        'price', coalesce(u.current_price, u.list_price, u.price),
        'status', u.status
      ) order by u.unit_number)
      from public.units u
      where u.development_id = published.id
    ), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', doc.id,
        'title', doc.title,
        'documentType', doc.document_type,
        'fileUrl', doc.file_url,
        'linkedUnitType', doc.linked_unit_type
      ) order by doc.created_at)
      from public.development_documents doc
      where doc.development_id = published.id
        and lower(coalesce(doc.document_type, '')) in ('floorplan', 'site_plan', 'marketing', 'logo', 'brochure')
    ), '[]'::jsonb)
  )
  from published;
$$;

revoke execute on function public.get_public_development_landing(text) from public;
grant execute on function public.get_public_development_landing(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
