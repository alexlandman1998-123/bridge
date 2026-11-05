begin;

-- PendingOffer remains an advertised listing. The application stores that
-- provider state as under_offer; retain all previously supported states.
alter table public.private_property_listing_syncs
  drop constraint private_property_listing_syncs_external_status_check;

alter table public.private_property_listing_syncs
  add constraint private_property_listing_syncs_external_status_check
  check (external_status in ('submitted', 'active', 'under_offer', 'inactive', 'failed', 'removed', 'paused', 'unknown'));

commit;
