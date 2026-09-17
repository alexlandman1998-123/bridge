-- Read-only rollout audit. It never changes seller types or document status.
-- Use this report to schedule entity confirmation before enabling packet signing.
select
  listing.id as private_listing_id,
  listing.organisation_id,
  coalesce(listing.property_address, listing.address_line1, listing.listing_title) as property_address,
  coalesce(listing.seller_name, listing.seller_email, 'Seller not captured') as seller_reference,
  coalesce(
    listing.seller_type,
    listing.seller_onboarding_form_data ->> 'sellerType',
    listing.seller_onboarding_form_data ->> 'sellerLegalType',
    'unknown'
  ) as current_seller_entity,
  case
    when coalesce(listing.seller_type, listing.seller_onboarding_form_data ->> 'sellerType', listing.seller_onboarding_form_data ->> 'sellerLegalType', '') = '' then 'entity_not_identified'
    when coalesce(listing.seller_type, listing.seller_onboarding_form_data ->> 'sellerType', listing.seller_onboarding_form_data ->> 'sellerLegalType', '') in ('unknown', 'other') then 'entity_needs_confirmation'
    else 'ready_for_profile_review'
  end as rollout_action
from public.private_listings listing
where coalesce(listing.archived_at, null) is null
order by listing.updated_at desc nulls last;
