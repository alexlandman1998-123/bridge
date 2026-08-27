begin;

alter table if exists public.onboarding_form_data enable row level security;
alter table if exists public.client_portal_links enable row level security;
alter table if exists public.transaction_finance_details enable row level security;

grant select, insert, update on public.onboarding_form_data to authenticated;
grant select, insert, update on public.client_portal_links to authenticated;
grant select, insert, update on public.transaction_finance_details to authenticated;

drop policy if exists onboarding_form_data_select_transaction_spine_scope
  on public.onboarding_form_data;
create policy onboarding_form_data_select_transaction_spine_scope
  on public.onboarding_form_data
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists onboarding_form_data_insert_transaction_spine_scope
  on public.onboarding_form_data;
create policy onboarding_form_data_insert_transaction_spine_scope
  on public.onboarding_form_data
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists onboarding_form_data_update_transaction_spine_scope
  on public.onboarding_form_data;
create policy onboarding_form_data_update_transaction_spine_scope
  on public.onboarding_form_data
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_finance_details_select_transaction_spine_scope
  on public.transaction_finance_details;
create policy transaction_finance_details_select_transaction_spine_scope
  on public.transaction_finance_details
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_finance_details_insert_transaction_spine_scope
  on public.transaction_finance_details;
create policy transaction_finance_details_insert_transaction_spine_scope
  on public.transaction_finance_details
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_finance_details_update_transaction_spine_scope
  on public.transaction_finance_details;
create policy transaction_finance_details_update_transaction_spine_scope
  on public.transaction_finance_details
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists client_portal_links_select_transaction_spine_scope
  on public.client_portal_links;
create policy client_portal_links_select_transaction_spine_scope
  on public.client_portal_links
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists client_portal_links_insert_transaction_spine_scope
  on public.client_portal_links;
create policy client_portal_links_insert_transaction_spine_scope
  on public.client_portal_links
  for insert
  to authenticated
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    and exists (
      select 1
      from public.transactions tx
      where tx.id = client_portal_links.transaction_id
        and tx.development_id = client_portal_links.development_id
        and tx.unit_id = client_portal_links.unit_id
        and (client_portal_links.buyer_id is null or tx.buyer_id = client_portal_links.buyer_id)
    )
  );

drop policy if exists client_portal_links_update_transaction_spine_scope
  on public.client_portal_links;
create policy client_portal_links_update_transaction_spine_scope
  on public.client_portal_links
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    and exists (
      select 1
      from public.transactions tx
      where tx.id = client_portal_links.transaction_id
        and tx.development_id = client_portal_links.development_id
        and tx.unit_id = client_portal_links.unit_id
        and (client_portal_links.buyer_id is null or tx.buyer_id = client_portal_links.buyer_id)
    )
  );

notify pgrst, 'reload schema';

commit;
