begin;

create or replace function public.bridge_can_manage_development_record(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and (
      public.bridge_is_admin()
      or public.bridge_has_development_org_access(target_development_id)
      or public.bridge_has_development_access(target_development_id)
    ),
    false
  );
$$;

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
      execute format('alter table public.%I enable row level security', table_name);

      execute format('drop policy if exists %I on public.%I', table_name || '_select_scoped', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.bridge_can_manage_development_record(development_id))',
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

      if table_name in (
        'development_financials',
        'development_profiles',
        'development_documents',
        'development_settings',
        'development_attorney_configs',
        'development_bond_configs'
      ) then
        execute format('drop policy if exists %I on public.%I', table_name || '_delete_scoped', table_name);
        execute format(
          'create policy %I on public.%I for delete to authenticated using (public.bridge_can_manage_development_record(development_id))',
          table_name || '_delete_scoped',
          table_name
        );
        execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
      else
        execute format('grant select, insert, update on table public.%I to authenticated', table_name);
      end if;
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.developments') is not null then
    alter table public.developments enable row level security;

    drop policy if exists developments_select_scoped on public.developments;
    create policy developments_select_scoped
      on public.developments
      for select
      to authenticated
      using (public.bridge_can_manage_development_record(id));

    drop policy if exists developments_insert_scoped on public.developments;
    create policy developments_insert_scoped
      on public.developments
      for insert
      to authenticated
      with check (
        auth.uid() is not null
        and (
          public.bridge_is_admin()
          or public.bridge_is_internal_user()
          or public.bridge_can_manage_development_record(id)
        )
      );

    drop policy if exists developments_update_scoped on public.developments;
    create policy developments_update_scoped
      on public.developments
      for update
      to authenticated
      using (public.bridge_can_manage_development_record(id))
      with check (public.bridge_can_manage_development_record(id));

    drop policy if exists developments_delete_scoped on public.developments;
    create policy developments_delete_scoped
      on public.developments
      for delete
      to authenticated
      using (public.bridge_can_manage_development_record(id));

    grant select, insert, update, delete on table public.developments to authenticated;
  end if;
end $$;

do $$
begin
  if to_regclass('public.development_attorney_required_closeout_docs') is not null then
    alter table public.development_attorney_required_closeout_docs enable row level security;

    drop policy if exists development_attorney_required_closeout_docs_select_scoped
      on public.development_attorney_required_closeout_docs;
    create policy development_attorney_required_closeout_docs_select_scoped
      on public.development_attorney_required_closeout_docs
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.development_attorney_configs config
          where config.id = development_attorney_required_closeout_docs.development_attorney_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      );

    drop policy if exists development_attorney_required_closeout_docs_insert_scoped
      on public.development_attorney_required_closeout_docs;
    create policy development_attorney_required_closeout_docs_insert_scoped
      on public.development_attorney_required_closeout_docs
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.development_attorney_configs config
          where config.id = development_attorney_required_closeout_docs.development_attorney_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      );

    drop policy if exists development_attorney_required_closeout_docs_update_scoped
      on public.development_attorney_required_closeout_docs;
    create policy development_attorney_required_closeout_docs_update_scoped
      on public.development_attorney_required_closeout_docs
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.development_attorney_configs config
          where config.id = development_attorney_required_closeout_docs.development_attorney_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      )
      with check (
        exists (
          select 1
          from public.development_attorney_configs config
          where config.id = development_attorney_required_closeout_docs.development_attorney_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      );

    drop policy if exists development_attorney_required_closeout_docs_delete_scoped
      on public.development_attorney_required_closeout_docs;
    create policy development_attorney_required_closeout_docs_delete_scoped
      on public.development_attorney_required_closeout_docs
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.development_attorney_configs config
          where config.id = development_attorney_required_closeout_docs.development_attorney_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      );

    grant select, insert, update, delete
      on table public.development_attorney_required_closeout_docs
      to authenticated;
  end if;
end $$;

do $$
begin
  if to_regclass('public.development_bond_required_closeout_docs') is not null then
    alter table public.development_bond_required_closeout_docs enable row level security;

    drop policy if exists development_bond_required_closeout_docs_select_scoped
      on public.development_bond_required_closeout_docs;
    create policy development_bond_required_closeout_docs_select_scoped
      on public.development_bond_required_closeout_docs
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.development_bond_configs config
          where config.id = development_bond_required_closeout_docs.development_bond_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      );

    drop policy if exists development_bond_required_closeout_docs_insert_scoped
      on public.development_bond_required_closeout_docs;
    create policy development_bond_required_closeout_docs_insert_scoped
      on public.development_bond_required_closeout_docs
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.development_bond_configs config
          where config.id = development_bond_required_closeout_docs.development_bond_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      );

    drop policy if exists development_bond_required_closeout_docs_update_scoped
      on public.development_bond_required_closeout_docs;
    create policy development_bond_required_closeout_docs_update_scoped
      on public.development_bond_required_closeout_docs
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.development_bond_configs config
          where config.id = development_bond_required_closeout_docs.development_bond_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      )
      with check (
        exists (
          select 1
          from public.development_bond_configs config
          where config.id = development_bond_required_closeout_docs.development_bond_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      );

    drop policy if exists development_bond_required_closeout_docs_delete_scoped
      on public.development_bond_required_closeout_docs;
    create policy development_bond_required_closeout_docs_delete_scoped
      on public.development_bond_required_closeout_docs
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.development_bond_configs config
          where config.id = development_bond_required_closeout_docs.development_bond_config_id
            and public.bridge_can_manage_development_record(config.development_id)
        )
      );

    grant select, insert, update, delete
      on table public.development_bond_required_closeout_docs
      to authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
