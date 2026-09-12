-- Phase 6: controlled one-time migration of existing listing inventory.
-- New listings are already assigned by trg_100_private_listings_assign_arch9_reference.
-- This assigns only previously unreferenced rows for agencies that still exist,
-- in stable chronological order per agency. Orphaned historical rows are deliberately left unchanged.

begin;

do $$
declare
  v_listing record;
begin
  for v_listing in
    select listing.id, listing.organisation_id
    from public.private_listings listing
    join public.organisations organisation on organisation.id = listing.organisation_id
    where listing.arch9_reference is null
    order by listing.organisation_id, listing.created_at nulls last, listing.id
  loop
    update public.private_listings
    set arch9_reference = public.arch9_allocate_reference(v_listing.organisation_id, 'listing')
    where id = v_listing.id
      and arch9_reference is null;
  end loop;
end;
$$;

-- Rebuild read-friendly handoff values from the now-complete listing source of truth.
update public.leads lead
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where lead.enquired_listing_id = listing.id
  and lead.arch9_listing_reference is distinct from listing.arch9_reference;

update public.leads lead
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where lead.enquired_listing_id is null
  and lead.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and lead.listing_id::uuid = listing.id
  and lead.arch9_listing_reference is distinct from listing.arch9_reference;

update public.offers offer
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where offer.listing_id = listing.id
  and offer.arch9_listing_reference is distinct from listing.arch9_reference;

update public.appointment_viewed_listings viewed
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where viewed.listing_id = listing.id
  and viewed.arch9_listing_reference is distinct from listing.arch9_reference;

update public.appointments appointment
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where appointment.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and appointment.listing_id::uuid = listing.id
  and appointment.arch9_listing_reference is distinct from listing.arch9_reference;

update public.appointments appointment
set arch9_listing_reference = txn.arch9_listing_reference
from public.transactions txn
where appointment.arch9_listing_reference is null
  and appointment.transaction_id = txn.id
  and txn.arch9_listing_reference is not null;

update public.website_lead_submissions submission
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where submission.listing_id = listing.id
  and submission.arch9_listing_reference is distinct from listing.arch9_reference;

update public.notification_events notification
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where notification.listing_id = listing.id
  and notification.arch9_listing_reference is distinct from listing.arch9_reference;

update public.transactions txn
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where txn.listing_id = listing.id
  and txn.arch9_listing_reference is distinct from listing.arch9_reference;

commit;
