begin;

-- A seller lead may have at most one active/non-archived private listing shell.
-- The signed-mandate conversion path can be retried by browsers, edge-function
-- retries, or repeated finalisation calls, so the database owns the final
-- idempotency guarantee.
create unique index if not exists private_listings_one_active_originating_lead_idx
  on public.private_listings (
    organisation_id,
    (nullif(trim(originating_crm_lead_id), ''))
  )
  where originating_crm_lead_id is not null
    and nullif(trim(originating_crm_lead_id), '') is not null
    and coalesce(listing_status, '') <> 'withdrawn'
    and coalesce(listing_visibility, '') <> 'archived';

create unique index if not exists private_listings_one_active_seller_lead_idx
  on public.private_listings (
    organisation_id,
    (nullif(trim(seller_lead_id), ''))
  )
  where seller_lead_id is not null
    and nullif(trim(seller_lead_id), '') is not null
    and coalesce(listing_status, '') <> 'withdrawn'
    and coalesce(listing_visibility, '') <> 'archived';

notify pgrst, 'reload schema';

commit;
