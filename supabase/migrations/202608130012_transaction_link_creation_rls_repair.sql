begin;

alter table if exists public.transaction_status_links enable row level security;
alter table if exists public.transaction_onboarding enable row level security;

drop policy if exists transaction_status_links_insert_transaction_spine_scope
  on public.transaction_status_links;
create policy transaction_status_links_insert_transaction_spine_scope
  on public.transaction_status_links
  for insert
  to authenticated
  with check (
    is_active = true
    and public.bridge_can_access_transaction_spine(transaction_id)
  );

drop policy if exists transaction_status_links_update_transaction_spine_scope
  on public.transaction_status_links;
create policy transaction_status_links_update_transaction_spine_scope
  on public.transaction_status_links
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_onboarding_insert_transaction_spine_scope
  on public.transaction_onboarding;
create policy transaction_onboarding_insert_transaction_spine_scope
  on public.transaction_onboarding
  for insert
  to authenticated
  with check (
    is_active = true
    and public.bridge_can_access_transaction_spine(transaction_id)
  );

drop policy if exists transaction_onboarding_update_transaction_spine_scope
  on public.transaction_onboarding;
create policy transaction_onboarding_update_transaction_spine_scope
  on public.transaction_onboarding
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

grant select on public.transaction_status_links to anon, authenticated;
grant insert, update on public.transaction_status_links to authenticated;

grant select on public.transaction_onboarding to anon, authenticated;
grant insert, update on public.transaction_onboarding to authenticated;

notify pgrst, 'reload schema';
commit;
