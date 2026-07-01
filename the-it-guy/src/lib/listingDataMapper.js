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
  const listingSource = listing && typeof listing === 'object' ? listing : {}
  const onboarding =
    listingSource?.sellerOnboarding?.formData && typeof listingSource.sellerOnboarding.formData === 'object'
      ? listingSource.sellerOnboarding.formData
      : {}
  const details = listingSource?.propertyDetails && typeof listingSource.propertyDetails === 'object' ? listingSource.propertyDetails : {}

  return {
    headline: toText(firstValue(details.headline, listingSource.listingTitle, listingSource.title, onboarding.propertyAddress)),
    propertyType: toText(firstValue(details.propertyType, listingSource.propertyType, onboarding.propertyType)),
    addressLine1: toText(firstValue(details.addressLine1, listingSource.addressLine1, onboarding.propertyAddress, onboarding.residentialAddress)),
    suburb: toText(firstValue(details.suburb, listingSource.suburb, onboarding.suburb)),
    city: toText(firstValue(details.city, listingSource.city, onboarding.city)),
    province: toText(firstValue(details.province, listingSource.province, onboarding.province)),
    bedrooms: firstValue(details.bedrooms, listingSource.bedrooms, onboarding.bedrooms),
    bathrooms: firstValue(details.bathrooms, listingSource.bathrooms, onboarding.bathrooms),
    garages: firstValue(details.garages, listingSource.garages, onboarding.garages),
    erfSize: firstValue(details.erfSize, listingSource.erfSize, onboarding.erfSize),
    floorSize: firstValue(details.floorSize, listingSource.floorSize, onboarding.floorSize),
    askingPrice: firstValue(details.price, listingSource.askingPrice, onboarding.askingPrice),
    publicDescription: toText(firstValue(details.description, listingSource.description, onboarding.propertyNotes)),
    previewDescription: toText(firstValue(details.listingPreviewDescription, listingSource.listingPreviewDescription, onboarding.listingPreviewDescription)),
    internalNotes: toText(firstValue(details.notes, listingSource.internalListingNotes, onboarding.internalNotes)),
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
