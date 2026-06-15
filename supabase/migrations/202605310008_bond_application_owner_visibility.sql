begin;
drop policy if exists transaction_bond_applications_select_scope_hardened on public.transaction_bond_applications;
create policy transaction_bond_applications_select_scope_hardened
  on public.transaction_bond_applications
  for select
  to authenticated
  using (
    public.bridge_can_access_bond_application_scope(id)
    or public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_bond_applications.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or t.created_by = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );
drop policy if exists transaction_bond_applications_update_scope_hardened on public.transaction_bond_applications;
create policy transaction_bond_applications_update_scope_hardened
  on public.transaction_bond_applications
  for update
  to authenticated
  using (
    public.bridge_can_access_bond_application_scope(id)
    or public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_bond_applications.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or t.created_by = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  )
  with check (
    public.bridge_can_access_bond_application_scope(id)
    or public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_bond_applications.transaction_id
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
