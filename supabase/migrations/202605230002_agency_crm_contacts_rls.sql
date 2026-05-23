-- The Agent CRM writes contacts before leads during lead repair/sync. Make the
-- canonical CRM tables follow the same organisation-member RLS pattern as the
-- newer buyer lifecycle tables.

do $$
declare
  table_name text;
begin
  foreach table_name in array array['contacts', 'leads', 'lead_activities', 'tasks']
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      execute format('drop policy if exists %I on public.%I', table_name || '_org_members_select', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.bridge_is_active_member(organisation_id))',
        table_name || '_org_members_select',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_org_members_insert', table_name);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.bridge_is_active_member(organisation_id))',
        table_name || '_org_members_insert',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_org_members_update', table_name);
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.bridge_is_active_member(organisation_id)) with check (public.bridge_is_active_member(organisation_id))',
        table_name || '_org_members_update',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_org_members_delete', table_name);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.bridge_is_active_member(organisation_id))',
        table_name || '_org_members_delete',
        table_name
      );

      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    end if;
  end loop;
end $$;
