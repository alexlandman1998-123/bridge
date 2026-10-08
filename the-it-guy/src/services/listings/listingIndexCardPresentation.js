const normalizeText = (value) => String(value ?? '').trim()

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
