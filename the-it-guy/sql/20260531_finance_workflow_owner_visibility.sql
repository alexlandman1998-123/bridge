begin;

drop policy if exists transaction_finance_workflows_owner_agent_access on public.transaction_finance_workflows;
create policy transaction_finance_workflows_owner_agent_access
  on public.transaction_finance_workflows
  for all
  to authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_finance_workflows.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or t.created_by = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  )
  with check (
    public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_finance_workflows.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or t.created_by = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

notify pgrst, 'reload schema';

commit;
