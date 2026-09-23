-- Keep the seller pipeline's denormalised lead projection aligned with the
-- authoritative private-listing signing completion. The lead workspace uses
-- this link to hydrate signed FICA, disclosure, and mandate documents.
create or replace function public.bridge_sync_signed_listing_to_seller_lead()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.mandate_status, '')) not in ('signed', 'fully_signed', 'completed', 'signed_uploaded', 'uploaded_signed') then
    return new;
  end if;

  update public.leads
     set listing_id = new.id::text,
         stage = 'Listing Created',
         status = 'Draft',
         updated_at = now()
   where organisation_id = new.organisation_id
     and (
       lead_id::text = nullif(trim(new.seller_lead_id::text), '')
       or lead_id::text = nullif(trim(new.originating_crm_lead_id::text), '')
     );

  return new;
end;
$$;

drop trigger if exists bridge_sync_signed_listing_to_seller_lead on public.private_listings;
create trigger bridge_sync_signed_listing_to_seller_lead
after insert or update of mandate_status on public.private_listings
for each row
execute function public.bridge_sync_signed_listing_to_seller_lead();

-- Repair listings that were signed before the projection existed.
update public.leads lead
   set listing_id = listing.id::text,
       stage = 'Listing Created',
       status = 'Draft',
       updated_at = now()
  from public.private_listings listing
 where listing.organisation_id = lead.organisation_id
   and lower(coalesce(listing.mandate_status, '')) in ('signed', 'fully_signed', 'completed', 'signed_uploaded', 'uploaded_signed')
   and (
     lead.lead_id::text = nullif(trim(listing.seller_lead_id::text), '')
     or lead.lead_id::text = nullif(trim(listing.originating_crm_lead_id::text), '')
   );
