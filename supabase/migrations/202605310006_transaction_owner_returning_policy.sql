begin;

drop policy if exists transactions_select_transaction_spine_scope on public.transactions;
create policy transactions_select_transaction_spine_scope
  on public.transactions
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or created_by = auth.uid()
    or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.bridge_can_access_transaction_spine(id)
  );

drop policy if exists transactions_update_transaction_spine_scope on public.transactions;
create policy transactions_update_transaction_spine_scope
  on public.transactions
  for update
  to authenticated
  using (
    owner_user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or created_by = auth.uid()
    or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.bridge_can_access_transaction_spine(id)
  )
  with check (
    owner_user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or created_by = auth.uid()
    or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.bridge_can_access_transaction_spine(id)
  );

notify pgrst, 'reload schema';

commit;
