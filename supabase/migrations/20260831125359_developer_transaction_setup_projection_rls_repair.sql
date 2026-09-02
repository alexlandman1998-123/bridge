-- Allow authenticated organisation members to maintain the buyer portal and
-- transaction discussion projections created with a canonical transaction.

drop policy if exists client_portal_links_org_member_maintenance
  on public.client_portal_links;
create policy client_portal_links_org_member_maintenance
  on public.client_portal_links
  for all
  to authenticated
  using (public.bridge_can_access_transaction_org_member(transaction_id))
  with check (public.bridge_can_access_transaction_org_member(transaction_id));

drop policy if exists transaction_comments_org_member_maintenance
  on public.transaction_comments;
create policy transaction_comments_org_member_maintenance
  on public.transaction_comments
  for all
  to authenticated
  using (public.bridge_can_access_transaction_org_member(transaction_id))
  with check (public.bridge_can_access_transaction_org_member(transaction_id));
