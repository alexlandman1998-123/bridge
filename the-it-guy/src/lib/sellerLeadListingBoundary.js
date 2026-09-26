export const SELLER_LEAD_INTAKE_SOURCE = 'seller_lead_intake'

const key = (value) => String(value || '').trim().toLowerCase()

export function isUnconvertedSellerLeadIntake(listing = {}) {
  const source = key(listing.listingSource || listing.listing_source)
  if (source !== SELLER_LEAD_INTAKE_SOURCE) return false

  const listingStatus = key(listing.listingStatus || listing.listing_status || listing.status)
  const mandateStatus = key(listing.mandateStatus || listing.mandate_status || listing.mandate?.status)
  return !['mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold'].includes(listingStatus) &&
    !['signed', 'signed_uploaded', 'fully_signed', 'completed'].includes(mandateStatus)
}

export function isUnpublishedDraftListing(listing = {}) {
  const status = key(listing.listingStatus || listing.listing_status || listing.status)
  const visibility = key(listing.listingVisibility || listing.listing_visibility)
  const isActive = listing.isActive === true || listing.is_active === true
  return status === 'mandate_signed' && visibility === 'internal' && !isActive
}
