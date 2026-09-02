begin;

alter table if exists public.transaction_document_requirements enable row level security;

drop policy if exists transaction_document_requirements_org_member_select
  on public.transaction_document_requirements;
create policy transaction_document_requirements_org_member_select
  on public.transaction_document_requirements
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists transaction_document_requirements_org_member_insert
  on public.transaction_document_requirements;
create policy transaction_document_requirements_org_member_insert
  on public.transaction_document_requirements
  for insert
  to authenticated
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    or public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists transaction_document_requirements_org_member_update
  on public.transaction_document_requirements;
create policy transaction_document_requirements_org_member_update
  on public.transaction_document_requirements
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

grant select, insert, update on public.transaction_document_requirements to authenticated;

notify pgrst, 'reload schema';

commit;
