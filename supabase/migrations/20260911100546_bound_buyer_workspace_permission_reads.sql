-- Preserve the existing buyer permission predicate and transaction RLS.
-- OFFSET 0 prevents decorrelation into an all-transaction hashed subplan.
begin;
create index if not exists transactions_buyer_id_workspace_idx on public.transactions(buyer_id);
alter policy buyers_select_transaction_spine_roleplayer_scope on public.buyers
using (exists (
  select 1 from public.transactions t
  where t.buyer_id = buyers.id and public.bridge_can_access_transaction_spine(t.id)
  offset 0
));
commit;
