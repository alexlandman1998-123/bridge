function text(value = '') {
  return String(value ?? '').trim()
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function normalizedPart(value = '') {
  return text(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function addressSources(listing = {}, publication = {}) {
  const details = object(listing.propertyDetails || listing.property_details)
  const onboarding = object(listing.sellerOnboarding?.formData || listing.seller_onboarding?.form_data)
  const canonical = object(listing.sellerCanonicalFacts || listing.seller_canonical_facts_json || listing.seller_canonical_facts)
  const canonicalLocation = object(canonical.property24Location || canonical.property24_location || canonical.location)
  return { listing, publication: object(publication), details, onboarding, canonical, canonicalLocation }
}

/**
 * A stable comparison token for a listing address. It deliberately contains no
 * portal ID: portal IDs are derived data and must never make an old address
 * look current.
 */
export function buildListingAddressFingerprint({ listing = {}, publication = {} } = {}) {
  const { details, onboarding, canonical, canonicalLocation } = addressSources(listing, publication)
  const parts = [
    firstText(publication.unitNumber, publication.unit_number, listing.unitNumber, listing.unit_number, details.unitNumber, details.unit_number, onboarding.unitNumber),
    firstText(publication.complexName, publication.complex_name, listing.complexName, listing.complex_name, details.complexName, details.complex_name, onboarding.complexName),
    firstText(publication.streetNumber, publication.street_number, listing.streetNumber, listing.street_number, details.streetNumber, details.street_number, onboarding.streetNumber),
    firstText(publication.streetName, publication.street_name, listing.streetName, listing.street_name, details.streetName, details.street_name, onboarding.streetName),
    firstText(publication.streetAddress, publication.street_address, publication.addressLine1, publication.address_line_1, listing.streetAddress, listing.street_address, listing.addressLine1, listing.address_line_1, details.streetAddress, details.street_address, details.addressLine1, details.address_line_1, onboarding.streetAddress, onboarding.propertyAddress),
    firstText(publication.suburb, listing.suburb, details.suburb, onboarding.suburb, canonicalLocation.suburb),
    firstText(publication.city, publication.town, listing.city, listing.town, details.city, details.town, onboarding.city, onboarding.town, canonicalLocation.city),
    firstText(publication.province, listing.province, details.province, onboarding.province, canonicalLocation.province),
    firstText(publication.country, listing.country, details.country, onboarding.country, canonicalLocation.country, 'South Africa'),
    firstText(publication.postalCode, publication.postal_code, listing.postalCode, listing.postal_code, details.postalCode, details.postal_code, onboarding.postalCode),
  ].map(normalizedPart)

  // Empty addresses have no baseline. Do not manufacture a token that could
  // incorrectly make a later completed address appear unchanged.
  return parts.some(Boolean) ? parts.join('|') : ''
}

function privatePropertyIsActivated({ listing = {}, existingSync = {} } = {}) {
  const status = normalizedPart(firstText(
    existingSync.external_status,
    existingSync.externalStatus,
    listing.private_property_status,
    listing.privatePropertyStatus,
  )).replace(/ /g, '_')
  return Boolean(firstText(existingSync.private_property_ref, existingSync.privatePropertyRef, listing.private_property_reference, listing.privatePropertyReference)) &&
    ['active', 'published', 'live', 'for_sale', 'to_let'].includes(status)
}

function privatePropertyBaseline(existingSync = {}, listing = {}) {
  const summary = object(existingSync.last_payload_summary || existingSync.lastPayloadSummary)
  const canonical = object(listing.sellerCanonicalFacts || listing.seller_canonical_facts_json || listing.seller_canonical_facts)
  const portal = object(canonical.privateProperty || canonical.private_property)
  return firstText(
    summary.addressFingerprint,
    summary.address_fingerprint,
    listing.privatePropertyAddressFingerprint,
    listing.private_property_address_fingerprint,
    portal.addressFingerprint,
    portal.address_fingerprint,
  )
}

export function evaluateListingPortalAddressProtection({ listing = {}, publication = {}, existingPrivatePropertySync = {} } = {}) {
  const currentFingerprint = buildListingAddressFingerprint({ listing, publication })
  const property24Baseline = firstText(
    publication.property24AddressFingerprint,
    publication.property24_address_fingerprint,
    listing.property24AddressFingerprint,
    listing.property24_address_fingerprint,
  )
  const privatePropertyActivated = privatePropertyIsActivated({ listing, existingSync: existingPrivatePropertySync })
  const privatePropertyAddressFingerprint = privatePropertyBaseline(existingPrivatePropertySync, listing)
  const property24AddressChanged = Boolean(currentFingerprint && property24Baseline && currentFingerprint !== property24Baseline)
  const privatePropertyAddressChanged = Boolean(currentFingerprint && privatePropertyAddressFingerprint && currentFingerprint !== privatePropertyAddressFingerprint)

  return {
    addressFingerprint: currentFingerprint || null,
    property24: {
      baselineFingerprint: property24Baseline || null,
      addressChanged: property24AddressChanged,
      // P24 location is intentionally resolved afresh immediately before every
      // production publish, even where the address has not changed.
      requiresExactCurrentLookup: Boolean(currentFingerprint),
      warnings: property24AddressChanged ? ['property24_address_changed_requires_fresh_suburb_resolution'] : [],
    },
    privateProperty: {
      activated: privatePropertyActivated,
      baselineFingerprint: privatePropertyAddressFingerprint || null,
      addressChanged: privatePropertyAddressChanged,
      blockers: privatePropertyActivated && privatePropertyAddressChanged
        ? ['private_property_activated_address_change_requires_manual_correction']
        : [],
      warnings: privatePropertyActivated && !privatePropertyAddressFingerprint
        ? ['private_property_activated_address_baseline_missing_manual_confirmation']
        : [],
    },
  }
}
