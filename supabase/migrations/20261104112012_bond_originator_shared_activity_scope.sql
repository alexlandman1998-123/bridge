-- Finance collaborators may read/write shared activity for their assigned
-- matter. They gain no agency-internal conversation access or author spoofing.
create policy transaction_comments_bond_shared_select on public.transaction_comments
for select to authenticated using (
  visibility_scope='shared' and public.bridge_is_bond_transaction_canonical_ready(transaction_id)
  and public.bridge_can_mutate_bond_transaction_canonical(transaction_id,'workflow_mutation')
);
create policy transaction_comments_bond_shared_insert on public.transaction_comments
for insert to authenticated with check (
  author_user_id=auth.uid() and author_role='bond_originator' and visibility_scope='shared'
  and public.bridge_is_bond_transaction_canonical_ready(transaction_id)
  and public.bridge_can_mutate_bond_transaction_canonical(transaction_id,'workflow_mutation')
);
