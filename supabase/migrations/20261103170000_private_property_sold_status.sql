begin;

-- Keep the provider's Sold readback distinct from a withdrawn advert so a
-- successful status request cannot stand in for confirmed sale status.
alter table public.private_property_listing_syncs
  drop constraint private_property_listing_syncs_external_status_check;

alter table public.private_property_listing_syncs
  add constraint private_property_listing_syncs_external_status_check
  check (external_status in ('submitted', 'active', 'under_offer', 'sold', 'inactive', 'failed', 'removed', 'paused', 'unknown'));

commit;
