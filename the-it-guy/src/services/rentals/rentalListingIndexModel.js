export const RENTAL_LISTING_INDEX_VERSION = 'arch9_rental_listing_index_v1'

export const RENTAL_LISTING_STATUS_TABS = Object.freeze([
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'mandate', label: 'Mandate' },
  { key: 'ready', label: 'Ready' },
  { key: 'published', label: 'Published' },
  { key: 'applications', label: 'Applications' },
])

const MANDATE_READY_STATUSES = new Set(['signed', 'signed_uploaded'])
const MARKETING_READY_STATUSES = new Set(['approved', 'ready'])
const PROPERTY24_PUBLISHED_STATUSES = new Set(['published', 'live', 'active', 'on_portal'])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function firstText(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = normalizeNumber(value)
    if (parsed !== null) return parsed
  }
  return null
}

function joinNonEmpty(parts, separator = ', ') {
  return parts.map(normalizeText).filter(Boolean).join(separator)
}

export function formatRentalIndexStatusLabel(value) {
  const normalized = normalizeText(value)
  if (!normalized) return 'Not captured'
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function getRentalListingPublication(listing = {}) {
  return asObject(
    listing.listingPublicationData ||
      listing.listing_publication_data ||
      listing.publicationData ||
      listing.publication_data,
  )
}

export function getRentalListingFacts(listing = {}) {
  return asObject(
    listing.sellerCanonicalFacts ||
      listing.seller_canonical_facts ||
      listing.sellerCanonicalFactsJson ||
      listing.seller_canonical_facts_json ||
      listing.canonicalFacts ||
      listing.canonical_facts,
  )
}

export function getRentalListingRentalInfo(listing = {}) {
  const facts = getRentalListingFacts(listing)
  return asObject(
    facts.rentalInfo ||
      facts.rental_info ||
      listing.rentalInfo ||
      listing.rental_info ||
      listing.rentalListingDetails ||
      listing.rental_listing_details,
  )
}

function resolveStatusGroup(row = {}) {
  const property24Status = normalizeKey(row.property24Status)
  if (PROPERTY24_PUBLISHED_STATUSES.has(property24Status)) return 'published'
  if (MANDATE_READY_STATUSES.has(normalizeKey(row.mandateStatus)) && MARKETING_READY_STATUSES.has(normalizeKey(row.marketingApprovalStatus))) {
    return 'ready'
  }
  if (!MANDATE_READY_STATUSES.has(normalizeKey(row.mandateStatus))) return 'mandate'
  return 'draft'
}

function resolveNextAction(row = {}) {
  if (!row.landlordName) return 'Add landlord'
  if (!row.monthlyRent) return 'Capture monthly rent'
  if (!row.availableFrom) return 'Confirm availability'
  if (!MANDATE_READY_STATUSES.has(normalizeKey(row.mandateStatus))) return 'Complete rental mandate'
  if (!MARKETING_READY_STATUSES.has(normalizeKey(row.marketingApprovalStatus))) return 'Approve marketing'
  if (!PROPERTY24_PUBLISHED_STATUSES.has(normalizeKey(row.property24Status))) return 'Review Property24 publishing'
  if (Number(row.applicationCount || 0) > 0) return 'Review tenant applications'
  return 'Capture tenant applications'
}

export function buildRentalListingIndexRow(listing = {}) {
  const publication = getRentalListingPublication(listing)
  const facts = getRentalListingFacts(listing)
  const rentalInfo = getRentalListingRentalInfo(listing)
  const propertyProfile = asObject(facts.propertyProfile || facts.property_profile)
  const addressProfile = asObject(facts.addressProfile || facts.address_profile)
  const portalFeatures = asObject(propertyProfile.portalFeatures || propertyProfile.portal_features || publication.portalFeatures || publication.portal_features)
  const title = firstText(
    listing.listingTitle,
    listing.listing_title,
    listing.title,
    publication.title,
    facts.title,
    'Rental listing',
  )
  const address = firstText(
    listing.propertyAddress,
    listing.property_address,
    listing.formattedAddress,
    listing.formatted_address,
    listing.addressLine1,
    listing.address_line_1,
    publication.address,
    facts.propertyAddress,
    facts.property_address,
  )
  const row = {
    id: firstText(listing.id, listing.listingId, listing.listing_id, listing.listingReference, listing.listing_reference, title),
    raw: listing,
    title,
    address,
    unitNumber: firstText(listing.unitNumber, listing.unit_number, publication.unitNumber, publication.unit_number, addressProfile.unitNumber, addressProfile.unit_number),
    complexName: firstText(listing.complexName, listing.complex_name, publication.complexName, publication.complex_name, addressProfile.complexName, addressProfile.complex_name),
    streetNumber: firstText(listing.streetNumber, listing.street_number, publication.streetNumber, publication.street_number, addressProfile.streetNumber, addressProfile.street_number),
    streetName: firstText(listing.streetName, listing.street_name, publication.streetName, publication.street_name, addressProfile.streetName, addressProfile.street_name),
    suburb: firstText(listing.suburb, publication.suburb, facts.suburb, addressProfile.suburb),
    city: firstText(listing.city, publication.city, facts.city, addressProfile.city),
    province: firstText(listing.province, publication.province, facts.province, addressProfile.province),
    postalCode: firstText(listing.postalCode, listing.postal_code, publication.postalCode, publication.postal_code, addressProfile.postalCode, addressProfile.postal_code),
    exactAddressVisibility: firstText(listing.exactAddressVisibility, listing.exact_address_visibility, publication.exactAddressVisibility, addressProfile.exactAddressVisibility, addressProfile.exact_address_visibility),
    propertyType: firstText(listing.propertyType, listing.property_type, publication.propertyType, publication.property_type, facts.propertyType, facts.property_type, propertyProfile.propertyType, propertyProfile.property_type),
    bedrooms: firstNumber(listing.bedrooms, publication.bedrooms, facts.bedrooms, propertyProfile.bedrooms),
    bathrooms: firstNumber(listing.bathrooms, publication.bathrooms, facts.bathrooms, propertyProfile.bathrooms),
    enSuiteBathrooms: firstNumber(listing.enSuiteBathrooms, listing.en_suite_bathrooms, publication.enSuiteBathrooms, publication.en_suite_bathrooms, propertyProfile.enSuiteBathrooms, propertyProfile.en_suite_bathrooms),
    lounges: firstNumber(listing.lounges, publication.lounges, propertyProfile.lounges),
    diningRooms: firstNumber(listing.diningRooms, listing.dining_rooms, publication.diningRooms, publication.dining_rooms, propertyProfile.diningRooms, propertyProfile.dining_rooms),
    kitchens: firstNumber(listing.kitchens, publication.kitchens, propertyProfile.kitchens),
    studies: firstNumber(listing.studies, publication.studies, propertyProfile.studies),
    storerooms: firstNumber(listing.storerooms, publication.storerooms, propertyProfile.storerooms),
    staffRooms: firstNumber(listing.staffRooms, listing.staff_rooms, publication.staffRooms, publication.staff_rooms, propertyProfile.staffRooms, propertyProfile.staff_rooms),
    parkingBays: firstNumber(listing.parkingBays, listing.parking_bays, publication.parkingBays, publication.parking_bays, facts.parkingBays, propertyProfile.parkingBays, propertyProfile.parking_bays),
    garages: firstNumber(listing.garages, listing.garageCount, listing.garage_count, publication.garages, publication.garageCount, publication.garage_count, propertyProfile.garages, propertyProfile.garageCount),
    coveredParking: firstNumber(listing.coveredParking, listing.covered_parking, publication.coveredParking, publication.covered_parking, propertyProfile.coveredParking, propertyProfile.covered_parking),
    openParking: firstNumber(listing.openParking, listing.open_parking, publication.openParking, publication.open_parking, propertyProfile.openParking, propertyProfile.open_parking),
    carports: firstNumber(listing.carports, publication.carports, propertyProfile.carports),
    floorSize: firstNumber(listing.floorSize, listing.floor_size, publication.floorSize, publication.floor_size, propertyProfile.floorSize, propertyProfile.floor_size),
    erfSize: firstNumber(listing.erfSize, listing.erf_size, publication.erfSize, publication.erf_size, propertyProfile.erfSize, propertyProfile.erf_size),
    monthlyRent: firstNumber(rentalInfo.monthlyRent, rentalInfo.monthly_rent, listing.monthlyRent, listing.monthly_rent, listing.askingPrice, listing.asking_price, publication.askingPrice, publication.asking_price),
    depositAmount: firstNumber(rentalInfo.depositAmount, rentalInfo.deposit_amount, listing.depositAmount, listing.deposit_amount),
    depositRequirement: firstText(rentalInfo.depositRequirement, rentalInfo.deposit_requirement, listing.depositRequirement, listing.deposit_requirement, publication.rentalTerms?.depositRequirement),
    depositMultiplier: firstNumber(rentalInfo.depositMultiplier, rentalInfo.deposit_multiplier, listing.depositMultiplier, listing.deposit_multiplier),
    availableFrom: firstText(rentalInfo.availableFrom, rentalInfo.available_from, listing.availableFrom, listing.available_from),
    occupationDate: firstText(rentalInfo.occupationDate, rentalInfo.occupation_date, listing.occupationDate, listing.occupation_date, publication.rentalTerms?.occupationDate),
    leasePeriodMonths: firstNumber(rentalInfo.leasePeriodMonths, rentalInfo.lease_period_months, listing.leasePeriodMonths, listing.lease_period_months),
    leasePeriodType: firstText(rentalInfo.leasePeriodType, rentalInfo.lease_period_type, listing.leasePeriodType, listing.lease_period_type),
    rentalIncludes: firstText(rentalInfo.rentalIncludes, rentalInfo.rental_includes, listing.rentalIncludes, listing.rental_includes, publication.rentalTerms?.rentalIncludes),
    rentalExcludes: firstText(rentalInfo.rentalExcludes, rentalInfo.rental_excludes, listing.rentalExcludes, listing.rental_excludes, publication.rentalTerms?.rentalExcludes),
    applicationFee: firstNumber(rentalInfo.applicationFee, rentalInfo.application_fee, listing.applicationFee, listing.application_fee),
    leaseAdminFee: firstNumber(rentalInfo.leaseAdminFee, rentalInfo.lease_admin_fee, listing.leaseAdminFee, listing.lease_admin_fee),
    creditCheckFee: firstNumber(rentalInfo.creditCheckFee, rentalInfo.credit_check_fee, listing.creditCheckFee, listing.credit_check_fee),
    keyDepositAmount: firstNumber(rentalInfo.keyDepositAmount, rentalInfo.key_deposit_amount, listing.keyDepositAmount, listing.key_deposit_amount),
    utilityDepositAmount: firstNumber(rentalInfo.utilityDepositAmount, rentalInfo.utility_deposit_amount, listing.utilityDepositAmount, listing.utility_deposit_amount),
    furnishedStatus: firstText(rentalInfo.furnishedStatus, rentalInfo.furnished_status, listing.furnishedStatus, listing.furnished_status),
    petsPolicy: firstText(rentalInfo.petsPolicy, rentalInfo.pets_policy, listing.petsPolicy, listing.pets_policy),
    utilitiesPolicy: firstText(rentalInfo.utilitiesPolicy, rentalInfo.utilities_policy, listing.utilitiesPolicy, listing.utilities_policy),
    garden: portalFeatures.garden ?? listing.garden ?? publication.garden,
    pool: portalFeatures.pool ?? listing.pool ?? publication.pool,
    flatlet: portalFeatures.flatlet ?? listing.flatlet ?? publication.flatlet,
    portalFeatures,
    inspectionStatus: firstText(rentalInfo.inspectionStatus, rentalInfo.inspection_status, listing.inspectionStatus, listing.inspection_status),
    landlordName: firstText(facts.landlordName, facts.landlord_name, listing.landlordName, listing.landlord_name, listing.sellerName, listing.seller_name),
    landlordEmail: firstText(facts.landlordEmail, facts.landlord_email, listing.landlordEmail, listing.landlord_email, listing.sellerEmail, listing.seller_email),
    landlordPhone: firstText(facts.landlordPhone, facts.landlord_phone, listing.landlordPhone, listing.landlord_phone, listing.sellerPhone, listing.seller_phone),
    assignedAgentName: firstText(listing.assignedAgentName, listing.assigned_agent_name, listing.agentName, listing.agent_name),
    mandateStatus: firstText(rentalInfo.mandateStatus, rentalInfo.mandate_status, listing.mandateStatus, listing.mandate_status, 'not_started'),
    mandateStartDate: firstText(rentalInfo.mandateStartDate, rentalInfo.mandate_start_date, listing.mandateStartDate, listing.mandate_start_date),
    mandateEndDate: firstText(rentalInfo.mandateEndDate, rentalInfo.mandate_end_date, listing.mandateEndDate, listing.mandate_end_date, listing.expiryDate, listing.expiry_date),
    marketingApprovalStatus: firstText(rentalInfo.marketingApprovalStatus, rentalInfo.marketing_approval_status, listing.marketingApprovalStatus, listing.marketing_approval_status, publication.status, 'draft'),
    property24Status: firstText(listing.property24Status, listing.property24_status, publication.property24Status, publication.property24_status, 'not_published'),
    applicationCount: Number(firstNumber(listing.applicationCount, listing.application_count, listing.rentalApplicationCount, listing.rental_application_count, 0) || 0),
    imageUrl: firstText(listing.imageUrl, listing.image_url, listing.heroImageUrl, listing.hero_image_url, publication.imageUrl, publication.heroImageUrl),
  }
  row.location = joinNonEmpty([row.suburb, row.city])
  row.landlordContact = joinNonEmpty([row.landlordEmail, row.landlordPhone], ' / ')
  row.statusGroup = resolveStatusGroup(row)
  row.nextAction = resolveNextAction(row)
  return row
}

export function buildRentalListingIndexRows(listings = []) {
  return (Array.isArray(listings) ? listings : []).filter(Boolean).map(buildRentalListingIndexRow)
}

export function summarizeRentalListingIndexRows(rows = []) {
  const summary = {
    total: 0,
    draft: 0,
    mandate: 0,
    ready: 0,
    published: 0,
    applications: 0,
  }
  for (const row of Array.isArray(rows) ? rows : []) {
    summary.total += 1
    if (summary[row.statusGroup] !== undefined) summary[row.statusGroup] += 1
    if (Number(row.applicationCount || 0) > 0) summary.applications += 1
  }
  return summary
}

export function filterRentalListingIndexRows(rows = [], filters = {}) {
  const query = normalizeText(filters.query).toLowerCase()
  const status = normalizeKey(filters.status || 'all')
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const statusMatch = status === 'all'
      ? true
      : status === 'applications'
        ? Number(row.applicationCount || 0) > 0
        : row.statusGroup === status
    if (!statusMatch) return false
    if (!query) return true
    return [
      row.title,
      row.address,
      row.location,
      row.propertyType,
      row.landlordName,
      row.landlordContact,
      row.assignedAgentName,
      row.nextAction,
    ].join(' ').toLowerCase().includes(query)
  })
}
