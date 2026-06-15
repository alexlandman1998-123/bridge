begin;
drop policy if exists private_listings_delete_admin on public.private_listings;
drop policy if exists private_listings_delete_member_owner on public.private_listings;
create policy private_listings_delete_member_owner
on public.private_listings
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);
grant delete on public.private_listings to authenticated;
commit;
