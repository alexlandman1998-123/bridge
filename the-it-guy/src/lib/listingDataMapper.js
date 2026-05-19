const PORTAL_STATUS_FALLBACK = 'not_published'

function toText(value) {
  return String(value || '').trim()
}

function firstValue(...values) {
  for (const value of values) {
    if (value === 0 || value === false) return value
    const normalized = toText(value)
    if (normalized) return value
  }
  return ''
}

export function normalizePortalStatus(value) {
  const normalized = toText(value).toLowerCase()
  return ['not_published', 'draft', 'published', 'paused', 'removed'].includes(normalized)
    ? normalized
    : PORTAL_STATUS_FALLBACK
}

export function mapSellerOnboardingToListingDetails(listing = {}) {
  const onboarding =
    listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
      ? listing.sellerOnboarding.formData
      : {}
  const details = listing?.propertyDetails && typeof listing.propertyDetails === 'object' ? listing.propertyDetails : {}

  return {
    headline: toText(firstValue(details.headline, listing.listingTitle, listing.title, onboarding.propertyAddress)),
    propertyType: toText(firstValue(details.propertyType, listing.propertyType, onboarding.propertyType)),
    addressLine1: toText(firstValue(details.addressLine1, listing.addressLine1, onboarding.propertyAddress, onboarding.residentialAddress)),
    suburb: toText(firstValue(details.suburb, listing.suburb, onboarding.suburb)),
    city: toText(firstValue(details.city, listing.city, onboarding.city)),
    province: toText(firstValue(details.province, listing.province, onboarding.province)),
    bedrooms: firstValue(details.bedrooms, listing.bedrooms, onboarding.bedrooms),
    bathrooms: firstValue(details.bathrooms, listing.bathrooms, onboarding.bathrooms),
    garages: firstValue(details.garages, listing.garages, onboarding.garages),
    erfSize: firstValue(details.erfSize, listing.erfSize, onboarding.erfSize),
    floorSize: firstValue(details.floorSize, listing.floorSize, onboarding.floorSize),
    askingPrice: firstValue(details.price, listing.askingPrice, onboarding.askingPrice),
    publicDescription: toText(firstValue(details.description, listing.description, onboarding.propertyNotes)),
    previewDescription: toText(firstValue(details.listingPreviewDescription, listing.listingPreviewDescription, onboarding.listingPreviewDescription)),
    internalNotes: toText(firstValue(details.notes, listing.internalListingNotes, onboarding.internalNotes)),
  }
}

export function buildPortalListingPayload(details = {}) {
  return {
    property24ListingUrl: toText(details.property24ListingUrl),
    property24Reference: toText(details.property24Reference),
    property24Status: normalizePortalStatus(details.property24Status),
    privatePropertyListingUrl: toText(details.privatePropertyListingUrl),
    privatePropertyReference: toText(details.privatePropertyReference),
    privatePropertyStatus: normalizePortalStatus(details.privatePropertyStatus),
    bridgeListingStatus: normalizePortalStatus(details.bridgeListingStatus),
    bridgeListingPublicUrl: toText(details.bridgeListingPublicUrl),
  }
}
