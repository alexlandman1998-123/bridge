const normalizeText = (value) => String(value ?? '').trim()

export function getListingCardSellerContact(listing = {}) {
  const facts = listing.sellerCanonicalFacts || listing.seller_canonical_facts_json || listing.sellerOnboarding?.canonicalFacts || {}
  const seller = facts.seller || {}
  const contact = seller.contact || seller.primary_contact || {}
  const form = listing.sellerOnboarding?.formData || {}
  const firstText = (...values) => values.map(normalizeText).find(Boolean) || ''
  return {
    name: firstText(
      facts.fullName, facts.sellerName, facts.name,
      [facts.firstName, facts.lastName].filter(Boolean).join(' '),
      seller.full_name, seller.fullName,
      [seller.first_name || seller.firstName, seller.surname || seller.lastName].filter(Boolean).join(' '),
      contact.name,
      form.fullName, form.sellerName,
      [form.sellerFirstName || form.firstName, form.sellerSurname || form.lastName].filter(Boolean).join(' '),
      form.primaryContactName, listing.sellerName, listing.seller?.name,
    ),
    phone: firstText(
      facts.phone, facts.sellerPhone, facts.mobile,
      seller.phone, seller.mobile, contact.phone,
      form.phone, form.sellerPhone, form.mobile,
      listing.sellerPhone, listing.seller?.phone,
    ),
  }
}

export function getListingCardAddressLabel(listing = {}) {
  const unitNumber = normalizeText(listing.unitNumber || listing.unit_number || listing.propertyDetails?.unitNumber)
  const complexOrEstate = normalizeText(
    listing.complexName ||
      listing.complex_name ||
      listing.estateName ||
      listing.estate_name ||
      listing.propertyDetails?.complexName ||
      listing.propertyDetails?.estateName,
  )
  const streetAddress = normalizeText(
    listing.streetAddress ||
      listing.street_address ||
      listing.addressLine1 ||
      listing.address_line_1 ||
      listing.propertyDetails?.addressLine1 ||
      listing.propertyAddress,
  )
  const unitLabel = unitNumber
    ? (/^unit\s/i.test(unitNumber) ? unitNumber : `Unit ${unitNumber}`)
    : ''

  if (unitLabel && complexOrEstate) return `${unitLabel}, ${complexOrEstate}`
  if (unitLabel && streetAddress) return `${unitLabel}, ${streetAddress}`
  if (streetAddress) return streetAddress
  if (complexOrEstate) return complexOrEstate
  return normalizeText(listing.listingTitle || listing.title) || 'Address pending'
}


function formatListingFactValue(value, label = '') {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return ''
  const formatted = Number.isInteger(number) ? String(number) : String(number).replace(/\.0+$/, '')
  return `${formatted} ${label}`.trim()
}

export function getListingPropertyFacts(listing = {}, quickMetadata = null) {
  const metadataProperty = quickMetadata?.property && typeof quickMetadata.property === 'object' ? quickMetadata.property : {}
  return [
    formatListingFactValue(listing.bedrooms || listing.bedroomCount || listing.bedroom_count || metadataProperty.bedrooms, 'bed'),
    formatListingFactValue(listing.bathrooms || listing.bathroomCount || listing.bathroom_count || metadataProperty.bathrooms, 'bath'),
    formatListingFactValue(listing.garages || listing.garageCount || listing.garage_count || metadataProperty.garages, 'garage'),
    formatListingFactValue(listing.parkingCount || listing.parking_count || metadataProperty.parkingCount, 'parking'),
  ].filter(Boolean)
}
