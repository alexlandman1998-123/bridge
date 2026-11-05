begin;
-- Retain agency isolation while admitting the explicitly responsible legal team.
drop policy if exists agency_two_tier_transaction_id on public.transaction_attorney_closeouts;
create policy agency_two_tier_transaction_id on public.transaction_attorney_closeouts
 as restrictive for all to authenticated
 using (transaction_id is null or public.bridge_agency_transaction_scope(transaction_id)
   or public.bridge_can_manage_attorney_closeout(transaction_id,attorney_firm_id))
 with check (transaction_id is null or public.bridge_agency_transaction_scope(transaction_id)
   or public.bridge_can_manage_attorney_closeout(transaction_id,attorney_firm_id));
notify pgrst,'reload schema';
commit;
