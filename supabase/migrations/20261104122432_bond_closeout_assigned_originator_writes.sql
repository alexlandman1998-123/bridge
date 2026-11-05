-- The finance closeout had SELECT policies only. Permit its assigned finance
-- team to save it without granting agency participants commission-write access.
create or replace function handoff_private.can_write_bond_closeout(p_transaction_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists (
   select 1 from public.transactions t where t.id=p_transaction_id
   and lower(coalesce(t.finance_type,'')) in ('bond','hybrid','combination')
   and t.lifecycle_state not in ('cancelled','archived')
   and public.bridge_is_bond_transaction_canonical_ready(t.id)
   and (public.bridge_can_mutate_bond_transaction_assigned(t.id,'finance_details_edit')
     or public.bridge_can_mutate_bond_transaction_scoped(t.id,'finance_details_edit'))
 );
$$;
revoke all on function handoff_private.can_write_bond_closeout(uuid) from public,anon;
grant usage on schema handoff_private to authenticated;
grant execute on function handoff_private.can_write_bond_closeout(uuid) to authenticated;
create policy transaction_bond_closeouts_insert_assigned on public.transaction_bond_closeouts
for insert to authenticated with check (handoff_private.can_write_bond_closeout(transaction_id));
create policy transaction_bond_closeouts_update_assigned on public.transaction_bond_closeouts
for update to authenticated using (handoff_private.can_write_bond_closeout(transaction_id))
with check (handoff_private.can_write_bond_closeout(transaction_id));
create policy transaction_bond_closeout_documents_insert_assigned on public.transaction_bond_closeout_documents
for insert to authenticated with check (exists(select 1 from public.transaction_bond_closeouts c
where c.id=transaction_bond_closeout_id and handoff_private.can_write_bond_closeout(c.transaction_id)));
create policy transaction_bond_closeout_documents_update_assigned on public.transaction_bond_closeout_documents
for update to authenticated using (exists(select 1 from public.transaction_bond_closeouts c
where c.id=transaction_bond_closeout_id and handoff_private.can_write_bond_closeout(c.transaction_id)))
with check (exists(select 1 from public.transaction_bond_closeouts c
where c.id=transaction_bond_closeout_id and handoff_private.can_write_bond_closeout(c.transaction_id)));
