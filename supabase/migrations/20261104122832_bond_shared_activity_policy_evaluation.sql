-- Evaluate the existing finance permission inside one controlled boundary.
-- Otherwise participant-table RLS recursively repeats the full transaction
-- permission graph for every shared comment returned by the workspace.
create or replace function handoff_private.can_access_bond_shared_activity(p_transaction_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
   and public.bridge_is_bond_transaction_canonical_ready(p_transaction_id)
   and public.bridge_can_mutate_bond_transaction_canonical(p_transaction_id,'workflow_mutation');
$$;
revoke all on function handoff_private.can_access_bond_shared_activity(uuid) from public,anon;
grant execute on function handoff_private.can_access_bond_shared_activity(uuid) to authenticated;
alter policy transaction_comments_bond_shared_select on public.transaction_comments
using (visibility_scope='shared' and handoff_private.can_access_bond_shared_activity(transaction_id));
alter policy transaction_comments_bond_shared_insert on public.transaction_comments
with check (author_user_id=auth.uid() and author_role='bond_originator' and visibility_scope='shared'
 and handoff_private.can_access_bond_shared_activity(transaction_id));
