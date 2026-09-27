function text(value) {
  return String(value ?? '').trim()
}

function record(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function firstPrice(...values) {
  for (const value of values) {
    const price = Number(value)
    if (Number.isFinite(price) && price > 0) return price
  }
  return 0
}

export function buildBuyerPropertyEnquiryContext(lead = {}, listing = null) {
  const buyerLead = record(lead)
  const raw = record(buyerLead.rawEnquiryPayload ?? buyerLead.raw_enquiry_payload)
  const fields = record(raw.parser?.matchedFields ?? raw.matchedFields)
  const original = {
    listingId: firstText(buyerLead.enquiredListingId, buyerLead.enquired_listing_id, raw.captureAlias?.listing_id),
    title: firstText(fields.propertyTitle, fields.enquiredPropertyTitle, fields.propertyInterest, raw.enquiredPropertyTitle, buyerLead.enquiredPropertyTitle, buyerLead.enquired_property_title),
    address: firstText(fields.propertyAddress, fields.enquiredPropertyAddress, raw.enquiredPropertyAddress, buyerLead.enquiredPropertyAddress, buyerLead.enquired_property_address),
    price: firstPrice(fields.propertyPrice, fields.enquiredPropertyPrice, raw.enquiredPropertyPrice, buyerLead.enquiredPropertyPrice, buyerLead.enquired_property_price),
    reference: firstText(fields.listingReference, raw.listingReference, buyerLead.sourceReferenceId, buyerLead.source_reference_id, buyerLead.listingReference, buyerLead.listing_reference),
  }
  const linkedListingId = firstText(buyerLead.listingId, buyerLead.listing_id)
  const listingRow = record(listing)
  const loadedListingId = firstText(listingRow.id, listingRow.listingId, listingRow.listing_id)
  const isLeadProjection = firstText(listingRow.sourceAuthority, listingRow.listingOptionSourceAuthority) === 'lead_projection'
  const verifiedListing = linkedListingId && loadedListingId === linkedListingId && !isLeadProjection ? listingRow : null
  const sourceListing = record(verifiedListing?.sourceListing)
  const linked = verifiedListing ? {
    title: firstText(verifiedListing.listingTitle, verifiedListing.listing_title, verifiedListing.title, verifiedListing.propertyName, verifiedListing.property_name, verifiedListing.label),
    address: firstText(verifiedListing.propertyAddress, verifiedListing.property_address, verifiedListing.address, verifiedListing.formattedAddress, verifiedListing.formatted_address, verifiedListing.addressLine1, verifiedListing.address_line_1),
    price: firstPrice(verifiedListing.askingPrice, verifiedListing.asking_price, verifiedListing.price, verifiedListing.propertyDetails?.price, sourceListing.askingPrice, sourceListing.asking_price, sourceListing.propertyDetails?.price),
    bedrooms: Number(verifiedListing.bedrooms ?? verifiedListing.propertyDetails?.bedrooms ?? 0) || 0,
    bathrooms: Number(verifiedListing.bathrooms ?? verifiedListing.propertyDetails?.bathrooms ?? 0) || 0,
    parking: Number(verifiedListing.parking ?? verifiedListing.garages ?? verifiedListing.propertyDetails?.parking ?? 0) || 0,
    status: firstText(verifiedListing.listingStatus, verifiedListing.listing_status, verifiedListing.status),
    reference: firstText(verifiedListing.arch9Reference, verifiedListing.arch9_reference, verifiedListing.listingCode, verifiedListing.listing_code, verifiedListing.listingReference, verifiedListing.listing_reference, sourceListing.arch9Reference, sourceListing.listingReference),
  } : null
  const hasOriginalEnquiry = Boolean(original.title || original.address || original.price || original.reference || original.listingId)
  const displayKind = linked ? 'linked' : linkedListingId ? 'unavailable' : hasOriginalEnquiry ? 'original' : 'empty'

  return {
    linkedListingId,
    linkedListing: verifiedListing,
    hasLinkedListing: Boolean(linkedListingId),
    hasOriginalEnquiry,
    displayKind,
    title: linked ? linked.title || 'Linked listing' : displayKind === 'unavailable' ? 'Linked listing details unavailable' : original.title || 'Property context needed',
    address: linked || displayKind === 'unavailable' ? linked?.address || '' : original.address,
    price: linked || displayKind === 'unavailable' ? linked?.price || 0 : original.price,
    bedrooms: linked?.bedrooms || 0,
    bathrooms: linked?.bathrooms || 0,
    parking: linked?.parking || 0,
    statusLabel: linked?.status || '',
    listingReference: linked?.reference || '',
    original,
  }
}
