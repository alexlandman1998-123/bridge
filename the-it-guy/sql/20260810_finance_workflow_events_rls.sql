begin;

do $$
begin
  if to_regclass('public.transaction_finance_workflow_events') is not null then
    execute 'alter table public.transaction_finance_workflow_events enable row level security';

    execute 'drop policy if exists transaction_finance_workflow_events_select_scope on public.transaction_finance_workflow_events';
    execute 'drop policy if exists transaction_finance_workflow_events_insert_scope on public.transaction_finance_workflow_events';

    execute $policy$
      create policy transaction_finance_workflow_events_select_scope
        on public.transaction_finance_workflow_events
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.transaction_finance_workflows tfw
            where tfw.id = transaction_finance_workflow_events.workflow_id
              and public.bridge_can_access_transaction_spine(tfw.transaction_id)
          )
        )
    $policy$;

    execute $policy$
      create policy transaction_finance_workflow_events_insert_scope
        on public.transaction_finance_workflow_events
        for insert
        to authenticated
        with check (
          exists (
            select 1
            from public.transaction_finance_workflows tfw
            where tfw.id = transaction_finance_workflow_events.workflow_id
              and public.bridge_can_access_transaction_spine(tfw.transaction_id)
          )
        )
    $policy$;

    execute 'grant select, insert on public.transaction_finance_workflow_events to authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
