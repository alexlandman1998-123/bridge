begin;

alter table if exists public.documents enable row level security;

drop policy if exists documents_developer_org_member_select on public.documents;
create policy documents_developer_org_member_select
  on public.documents
  for select
  to authenticated
  using (
    transaction_id is not null
    and public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists documents_developer_org_member_insert on public.documents;
create policy documents_developer_org_member_insert
  on public.documents
  for insert
  to authenticated
  with check (
    transaction_id is not null
    and public.bridge_can_access_transaction_org_member(transaction_id)
  );

drop policy if exists documents_developer_org_member_update on public.documents;
create policy documents_developer_org_member_update
  on public.documents
  for update
  to authenticated
  using (
    transaction_id is not null
    and public.bridge_can_access_transaction_org_member(transaction_id)
  )
  with check (
    transaction_id is not null
    and public.bridge_can_access_transaction_org_member(transaction_id)
  );

grant select, insert, update on public.documents to authenticated;

notify pgrst, 'reload schema';

commit;
