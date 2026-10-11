begin;

-- Staff use the development Snags tab without a client portal token.
-- Keep access within the existing agency transaction scope. Token-scoped
-- client policies and the restrictive agency boundary remain in place.
create policy client_issues_select_agency_scope
on public.client_issues
for select
to authenticated
using (
  transaction_id is not null
  and public.bridge_agency_transaction_scope(transaction_id)
);

commit;
