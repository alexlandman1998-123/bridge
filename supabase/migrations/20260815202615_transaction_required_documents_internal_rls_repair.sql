begin;

alter table if exists public.transaction_required_documents enable row level security;

drop policy if exists transaction_required_documents_select_transaction_spine_scope
  on public.transaction_required_documents;
create policy transaction_required_documents_select_transaction_spine_scope
  on public.transaction_required_documents
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists transaction_required_documents_insert_transaction_spine_scope
  on public.transaction_required_documents;
create policy transaction_required_documents_insert_transaction_spine_scope
  on public.transaction_required_documents
  for insert
  to authenticated
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists transaction_required_documents_update_transaction_spine_scope
  on public.transaction_required_documents;
create policy transaction_required_documents_update_transaction_spine_scope
  on public.transaction_required_documents
  for update
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  )
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

grant select on public.transaction_required_documents to anon, authenticated;
grant insert, update on public.transaction_required_documents to authenticated;

notify pgrst, 'reload schema';

commit;
