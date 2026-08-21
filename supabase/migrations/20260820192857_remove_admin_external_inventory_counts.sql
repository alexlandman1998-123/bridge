begin;

do $$
declare
  v_definition text;
  v_external_loop_start integer;
  v_transactions_loop text := E'  for v_row in select value from jsonb_array_elements(v_transactions) loop';
  v_transactions_loop_relative_start integer;
  v_transactions_loop_start integer;
begin
  select pg_get_functiondef(to_regprocedure('public.arch9_admin_dashboard_snapshot(timestamptz,timestamptz)'))
  into v_definition;

  if v_definition is null then
    raise exception 'public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) does not exist';
  end if;

  if position('v_external_inventory_snapshots jsonb := ''[]''::jsonb' in v_definition) = 0 then
    raise notice 'arch9_admin_dashboard_snapshot does not include external inventory snapshots';
  else
    v_definition := replace(
      v_definition,
      E'  v_external_inventory_snapshots jsonb := ''[]''::jsonb;\n',
      ''
    );

    v_definition := replace(
      v_definition,
      E'  v_external_inventory_active boolean;\n  v_external_listing_top_up integer;\n  v_external_agent_top_up integer;\n',
      ''
    );

    v_definition := replace(
      v_definition,
      E'  if to_regclass(''public.arch9_admin_external_inventory_snapshots'') is not null then\n    v_external_inventory_snapshots := public.arch9_admin_table_rows(to_regclass(''public.arch9_admin_external_inventory_snapshots''));\n  end if;\n\n',
      ''
    );

    v_external_loop_start := position(
      E'  for v_row in select value from jsonb_array_elements(v_external_inventory_snapshots) loop'
      in v_definition
    );
    if v_external_loop_start = 0 then
      raise exception 'Unable to patch admin dashboard function: external inventory loop not found';
    end if;

    v_transactions_loop_relative_start := position(
      v_transactions_loop
      in substring(v_definition from v_external_loop_start)
    );
    if v_transactions_loop_relative_start = 0 then
      raise exception 'Unable to patch admin dashboard function: transactions loop after external inventory not found';
    end if;

    v_transactions_loop_start := v_external_loop_start + v_transactions_loop_relative_start - 1;
    v_definition :=
      substring(v_definition from 1 for v_external_loop_start - 1)
      || v_transactions_loop
      || substring(v_definition from v_transactions_loop_start + length(v_transactions_loop));

    execute v_definition;
  end if;
end $$;

drop table if exists public.arch9_admin_external_inventory_snapshots;

alter function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  security definer;

revoke all on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) from public, anon;
grant execute on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) to authenticated;

comment on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  is 'Admin portal dashboard contract with guarded platform-wide counts from Arch9 database tables only: organisations, agent-module users, private listings, development units, and transactions.';

notify pgrst, 'reload schema';

commit;
