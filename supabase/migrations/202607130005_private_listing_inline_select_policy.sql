begin;

drop policy if exists private_listings_select_scoped on public.private_listings;
create policy private_listings_select_scoped
on public.private_listings
for select
to authenticated
using (
  auth.uid() is not null
  and (
    public.bridge_is_active_member(organisation_id)
    or public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or public.bridge_support_can_access_record(organisation_id, branch_id, 'listing', assigned_agent_id, null, null)
  )
);

drop policy if exists private_listings_update_scoped on public.private_listings;
create policy private_listings_update_scoped
on public.private_listings
for update
to authenticated
using (
  auth.uid() is not null
  and (
    public.bridge_is_active_member(organisation_id)
    or public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or public.bridge_support_can_access_record(organisation_id, branch_id, 'listing', assigned_agent_id, null, null)
  )
)
with check (
  auth.uid() is not null
  and (
    public.bridge_is_active_member(organisation_id)
    or public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or public.bridge_support_can_access_record(organisation_id, branch_id, 'listing', assigned_agent_id, null, null)
  )
);

commit;
