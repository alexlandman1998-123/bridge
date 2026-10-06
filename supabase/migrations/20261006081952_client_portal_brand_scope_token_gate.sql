begin;

-- Ordinary signed-in workspace reads have no buyer-portal bearer token.
-- Do not traverse the transaction/development RLS graph for that route.
-- CASE guarantees the existing portal authorization check is evaluated only
-- when a token was supplied; valid token access retains the same predicate.
alter policy organisations_select_client_portal_brand_scope
on public.organisations
using (
  case when (select public.bridge_client_portal_request_token()) <> '' then
    exists (
      select 1
      from public.transactions tx
      left join public.developments dev on dev.id = tx.development_id
      where (select public.bridge_has_client_portal_token_transaction_access(tx.id))
        and (
          tx.organisation_id = public.organisations.id
          or dev.organisation_id = public.organisations.id
        )
    )
  else false end
);

commit;
