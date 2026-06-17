begin;

create or replace function public.bridge_can_access_private_listing(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with listing as (
    select pl.*
    from public.private_listings pl
    where pl.id = target_listing_id
  )
  select coalesce((
    select
      auth.uid() is not null
      and (
        public.bridge_is_active_member(listing.organisation_id)
        or public.bridge_is_org_admin(listing.organisation_id)
        or listing.assigned_agent_id = auth.uid()
        or public.bridge_support_can_access_record(
          listing.organisation_id,
          listing.branch_id,
          'listing',
          listing.assigned_agent_id,
          null,
          null
        )
      )
    from listing
  ), false);
$$;

grant execute on function public.bridge_can_access_private_listing(uuid) to authenticated;

commit;
