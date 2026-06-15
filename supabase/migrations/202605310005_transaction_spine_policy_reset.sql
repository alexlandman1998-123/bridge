begin;
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'transactions',
        'transaction_bond_applications',
        'transaction_role_players',
        'transaction_participants',
        'transaction_events',
        'transaction_attorney_assignments'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;
alter table if exists public.transactions enable row level security;
alter table if exists public.transaction_role_players enable row level security;
alter table if exists public.transaction_participants enable row level security;
alter table if exists public.transaction_events enable row level security;
alter table if exists public.transaction_attorney_assignments enable row level security;
alter table if exists public.transaction_bond_applications enable row level security;
create policy transactions_select_transaction_spine_scope
  on public.transactions
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(id));
create policy transactions_insert_transaction_spine_scope
  on public.transactions
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      owner_user_id is null
      or owner_user_id = auth.uid()
      or assigned_user_id = auth.uid()
      or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
create policy transactions_update_transaction_spine_scope
  on public.transactions
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(id))
  with check (public.bridge_can_access_transaction_spine(id));
create policy transaction_bond_applications_select_scope_hardened
  on public.transaction_bond_applications
  for select
  to authenticated
  using (public.bridge_can_access_bond_application_scope(id));
create policy transaction_bond_applications_insert_scope_hardened
  on public.transaction_bond_applications
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_bond_applications_update_scope_hardened
  on public.transaction_bond_applications
  for update
  to authenticated
  using (public.bridge_can_access_bond_application_scope(id) or public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_participants_select_transaction_spine_scope
  on public.transaction_participants
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_participants_insert_transaction_spine_scope
  on public.transaction_participants
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_participants_update_transaction_spine_scope
  on public.transaction_participants
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_role_players_select_transaction_spine_scope
  on public.transaction_role_players
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_role_players_insert_transaction_spine_scope
  on public.transaction_role_players
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_role_players_update_transaction_spine_scope
  on public.transaction_role_players
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_events_select_transaction_spine_scope
  on public.transaction_events
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_events_insert_transaction_spine_scope
  on public.transaction_events
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_attorney_assignments_select_transaction_spine_scope
  on public.transaction_attorney_assignments
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    and (
      assigned_user_id = auth.uid()
      or primary_attorney_id = auth.uid()
      or attorney_user_id = auth.uid()
      or public.bridge_transaction_scope_is_internal_user()
      or exists (
        select 1
        from public.transactions t
        where t.id = transaction_attorney_assignments.transaction_id
          and (
            t.owner_user_id = auth.uid()
            or t.assigned_user_id = auth.uid()
            or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
    )
  );
create policy transaction_attorney_assignments_insert_transaction_spine_scope
  on public.transaction_attorney_assignments
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));
create policy transaction_attorney_assignments_update_transaction_spine_scope
  on public.transaction_attorney_assignments
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));
notify pgrst, 'reload schema';
commit;
