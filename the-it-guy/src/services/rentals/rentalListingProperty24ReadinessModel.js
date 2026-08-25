import {
  PROPERTY24_RENTAL_READINESS_FIELDS,
} from './rentalListingArchitecture.js'
import {
  buildRentalListingIndexRow,
  getRentalListingFacts,
  getRentalListingPublication,
  getRentalListingRentalInfo,
} from './rentalListingIndexModel.js'

export const RENTAL_PROPERTY24_READINESS_VERSION = 'arch9_rental_property24_readiness_v1'

const MANDATE_READY_STATUSES = new Set(['signed', 'signed_uploaded'])
const MARKETING_READY_STATUSES = new Set(['approved', 'ready'])

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
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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

function readPath(source = {}, path = '') {
  return path.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return current[key]
  }, source)
}

function firstPath(source = {}, paths = []) {
  for (const path of paths) {
    const value = readPath(source, path)
    if (value !== null && value !== undefined && value !== '') return value
  }
  return undefined
}

function normalizeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return [value].filter(Boolean)
}

function extractMediaItems(listing = {}, publication = {}) {
  const media = [
    ...normalizeArray(listing.photos),
    ...normalizeArray(listing.images),
    ...normalizeArray(listing.media),
    ...normalizeArray(listing.gallery),
    ...normalizeArray(listing.photoUrls),
    ...normalizeArray(listing.photo_urls),
    ...normalizeArray(publication.photos),
    ...normalizeArray(publication.images),
    ...normalizeArray(publication.media),
    ...normalizeArray(publication.photoUrls),
    ...normalizeArray(publication.photo_urls),
  ]
  for (const imageUrl of [listing.imageUrl, listing.image_url, listing.heroImageUrl, listing.hero_image_url, publication.imageUrl, publication.heroImageUrl]) {
    if (normalizeText(imageUrl)) media.push(imageUrl)
  }
  return media.map((item) => {
    if (typeof item === 'string') return { url: item }
    return item
  })
}

function resolveFeatureFlag(listing = {}, publication = {}, facts = {}, rentalInfo = {}, key = '') {
  const propertyProfile = asObject(facts.propertyProfile || facts.property_profile)
  const portalFeatures = asObject(propertyProfile.portalFeatures || propertyProfile.portal_features || publication.portalFeatures || publication.portal_features)
  const directValue = firstPath({ listing, publication, facts, rentalInfo, propertyProfile, portalFeatures }, [
    `listing.${key}`,
    `listing.${key}_included`,
    `publication.${key}`,
    `publication.${key}_included`,
    `publication.portalFeatures.${key}`,
    `publication.portal_features.${key}`,
    `facts.${key}`,
    `facts.${key}_included`,
    `facts.propertyProfile.portalFeatures.${key}`,
    `facts.property_profile.portal_features.${key}`,
    `propertyProfile.${key}`,
    `propertyProfile.${key}_included`,
    `portalFeatures.${key}`,
    `rentalInfo.${key}`,
    `rentalInfo.${key}_included`,
  ])
  if (typeof directValue === 'boolean') return { captured: true, value: directValue, detail: directValue ? 'Included' : 'Not included' }
  if (directValue !== undefined) {
    const normalized = normalizeKey(directValue)
    if (['yes', 'true', 'included', 'available', 'has', '1'].includes(normalized)) return { captured: true, value: true, detail: 'Included' }
    if (['no', 'false', 'not_included', 'none', '0'].includes(normalized)) return { captured: true, value: false, detail: 'Not included' }
  }
  return { captured: false, value: null, detail: 'Not captured' }
}

function resolvePetsAllowed(value) {
  const normalized = normalizeKey(value)
  if (!normalized) return { captured: false, value: null, detail: 'Pets policy missing' }
  if (['allowed', 'pets_allowed', 'pet_friendly', 'yes', 'true'].includes(normalized)) {
    return { captured: true, value: true, detail: 'Pets allowed' }
  }
  if (['not_allowed', 'no_pets', 'no', 'false'].includes(normalized)) {
    return { captured: true, value: false, detail: 'Pets not allowed' }
  }
  return { captured: true, value: normalized.includes('allow'), detail: normalizeText(value) }
}

function addItem(items, key, label, complete, detail, blocker) {
  items.push({
    key,
    label,
    complete: Boolean(complete),
    detail: normalizeText(detail),
    blocker: complete ? '' : blocker || label,
  })
}

export function buildRentalProperty24PayloadPreview(listing = {}) {
  const row = buildRentalListingIndexRow(listing)
  const publication = getRentalListingPublication(listing)
  const facts = getRentalListingFacts(listing)
  const rentalInfo = getRentalListingRentalInfo(listing)
  const media = extractMediaItems(listing, publication)
  const petsAllowed = resolvePetsAllowed(row.petsPolicy)
  const garden = resolveFeatureFlag(listing, publication, facts, rentalInfo, 'garden')
  const pool = resolveFeatureFlag(listing, publication, facts, rentalInfo, 'pool')
  const flatlet = resolveFeatureFlag(listing, publication, facts, rentalInfo, 'flatlet')
  const garages = firstNumber(
    listing.garages,
    listing.garageCount,
    listing.garage_count,
    publication.garages,
    publication.garageCount,
    publication.garage_count,
    facts.garages,
    facts.garageCount,
    facts.propertyProfile?.garages,
    facts.property_profile?.garages,
    rentalInfo.garages,
    rentalInfo.garageCount,
  )

  return {
    listingType: 'Rental',
    expiryDate: firstText(listing.expiryDate, listing.expiry_date, listing.mandateEndDate, listing.mandate_end_date, row.mandateEndDate, rentalInfo.mandateEndDate, rentalInfo.mandate_end_date),
    agencyId: firstText(listing.property24AgencyId, listing.property24_agency_id, listing.agencyId, listing.agency_id),
    contactAgentIds: normalizeArray(firstPath(listing, [
      'property24ContactAgentIds',
      'property24_contact_agent_ids',
      'contactAgentIds',
      'contact_agent_ids',
      'assignedAgentId',
      'assigned_agent_id',
    ]) || row.raw?.assignedAgentId || row.raw?.assigned_agent_id),
    agentSourceReference: firstText(listing.agentSourceReference, listing.agent_source_reference, listing.listingReference, listing.listing_reference, row.id),
    property: {
      suburbId: firstText(listing.property24SuburbId, listing.property24_suburb_id, listing.suburbId, listing.suburb_id),
      propertyTypeId: firstText(listing.property24PropertyTypeId, listing.property24_property_type_id, listing.propertyTypeId, listing.property_type_id),
      address: row.address,
      suburb: row.suburb,
      city: row.city,
      province: row.province,
      propertyType: row.propertyType,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      garages,
      coveredParking: row.coveredParking,
      openParking: row.openParking,
      carports: row.carports,
      floorSize: row.floorSize,
      erfSize: row.erfSize,
      garden: garden.value,
      pool: pool.value,
      flatlet: flatlet.value,
    },
    rentalInfo: {
      monthlyRent: row.monthlyRent,
      depositAmount: row.depositAmount,
      depositRequirement: row.depositRequirement,
      depositMultiplier: row.depositMultiplier,
      availableFrom: row.availableFrom,
      occupationDate: row.occupationDate || row.availableFrom,
      leasePeriodMonths: row.leasePeriodMonths,
      leasePeriodType: row.leasePeriodType,
      rentalIncludes: row.rentalIncludes,
      rentalExcludes: row.rentalExcludes,
      applicationFee: row.applicationFee,
      leaseAdminFee: row.leaseAdminFee,
      creditCheckFee: row.creditCheckFee,
      keyDepositAmount: row.keyDepositAmount,
      utilityDepositAmount: row.utilityDepositAmount,
      furnishedStatus: row.furnishedStatus,
      petsAllowed: petsAllowed.value,
      utilitiesPolicy: row.utilitiesPolicy,
    },
    marketing: {
      title: row.title,
      description: firstText(listing.description, listing.publicDescription, listing.public_description, publication.description, facts.description),
      photos: media,
      marketingApprovalStatus: row.marketingApprovalStatus,
      mandateStatus: row.mandateStatus,
    },
  }
}

export function buildRentalProperty24Readiness(listing = {}) {
  const row = buildRentalListingIndexRow(listing)
  const publication = getRentalListingPublication(listing)
  const facts = getRentalListingFacts(listing)
  const rentalInfo = getRentalListingRentalInfo(listing)
  const payloadPreview = buildRentalProperty24PayloadPreview(listing)
  const petsAllowed = resolvePetsAllowed(row.petsPolicy)
  const media = extractMediaItems(listing, publication)
  const garden = resolveFeatureFlag(listing, publication, facts, rentalInfo, 'garden')
  const pool = resolveFeatureFlag(listing, publication, facts, rentalInfo, 'pool')
  const flatlet = resolveFeatureFlag(listing, publication, facts, rentalInfo, 'flatlet')
  const garages = payloadPreview.property.garages
  const items = []

  addItem(items, 'listingType', 'Listing type', payloadPreview.listingType === 'Rental', 'Rental', 'Listing type must be Rental')
  addItem(items, 'rentalInfo', 'Rental info object', Boolean(row.monthlyRent && row.availableFrom), 'Rent and availability included', 'Capture rentalInfo with rent and availability')
  addItem(items, 'agencyId', 'Property24 agency', Boolean(payloadPreview.agencyId), payloadPreview.agencyId || 'Missing Property24 agency id', 'Map this agency to Property24')
  addItem(items, 'contactAgentIds', 'Contact agents', payloadPreview.contactAgentIds.length > 0, payloadPreview.contactAgentIds.join(', ') || 'No Property24 contact agents', 'Map at least one rental agent to Property24')
  addItem(items, 'agentSourceReference', 'Agent source reference', Boolean(payloadPreview.agentSourceReference), payloadPreview.agentSourceReference || 'Missing listing reference', 'Add a stable source reference')
  addItem(items, 'suburbId', 'Property24 suburb', Boolean(payloadPreview.property.suburbId), payloadPreview.property.suburbId || row.location || 'Missing Property24 suburb id', 'Resolve the Property24 suburb id')
  addItem(items, 'propertyTypeId', 'Property24 property type', Boolean(payloadPreview.property.propertyTypeId), payloadPreview.property.propertyTypeId || row.propertyType || 'Missing Property24 property type id', 'Resolve the Property24 property type id')
  addItem(items, 'monthlyRent', 'Monthly rent', Boolean(row.monthlyRent), row.monthlyRent ? `R${row.monthlyRent}` : 'Missing monthly rent', 'Capture monthly rent')
  addItem(items, 'availableFrom', 'Available from', Boolean(row.availableFrom), row.availableFrom || 'Missing availability date', 'Capture availability date')
  addItem(items, 'expiryDate', 'Listing expiry', Boolean(payloadPreview.expiryDate), payloadPreview.expiryDate || 'Missing mandate end date', 'Capture mandate end / expiry date')
  addItem(items, 'description', 'Public description', Boolean(payloadPreview.marketing.description), payloadPreview.marketing.description ? 'Description ready' : 'Missing public description', 'Capture a public rental description')
  addItem(items, 'photos', 'Photos', media.length > 0, `${media.length} photo${media.length === 1 ? '' : 's'}`, 'Add at least one listing photo')
  addItem(items, 'petsAllowed', 'Pets allowed', petsAllowed.captured, petsAllowed.detail, 'Capture pets policy')
  addItem(items, 'furnishedStatus', 'Furnished status', Boolean(row.furnishedStatus), row.furnishedStatus || 'Missing furnished status', 'Capture furnished status')
  addItem(items, 'garages', 'Garages', garages !== null && garages !== undefined, garages === null || garages === undefined ? 'Missing garage count' : `${garages} garage${garages === 1 ? '' : 's'}`, 'Capture garage count, even if it is 0')
  addItem(items, 'garden', 'Garden flag', garden.captured, garden.detail, 'Capture garden flag')
  addItem(items, 'pool', 'Pool flag', pool.captured, pool.detail, 'Capture pool flag')
  addItem(items, 'flatlet', 'Flatlet flag', flatlet.captured, flatlet.detail, 'Capture flatlet flag')
  addItem(items, 'marketingApprovalStatus', 'Marketing approval', MARKETING_READY_STATUSES.has(normalizeKey(row.marketingApprovalStatus)), row.marketingApprovalStatus, 'Approve landlord-facing marketing')
  addItem(items, 'mandateStatus', 'Rental mandate', MANDATE_READY_STATUSES.has(normalizeKey(row.mandateStatus)), row.mandateStatus, 'Complete signed rental mandate')

  const contractFields = new Set(PROPERTY24_RENTAL_READINESS_FIELDS)
  const missingContractFields = PROPERTY24_RENTAL_READINESS_FIELDS.filter((field) => !items.some((item) => item.key === field))
  const readinessItems = items.filter((item) => contractFields.has(item.key))
  const completedCount = readinessItems.filter((item) => item.complete).length
  const blockers = readinessItems.filter((item) => !item.complete).map((item) => ({
    key: item.key,
    label: item.label,
    detail: item.blocker,
  }))

  return {
    version: RENTAL_PROPERTY24_READINESS_VERSION,
    items: readinessItems,
    blockers,
    missingContractFields,
    completedCount,
    totalCount: readinessItems.length,
    readinessPercent: readinessItems.length ? Math.round((completedCount / readinessItems.length) * 100) : 0,
    readyToPublish: blockers.length === 0 && missingContractFields.length === 0,
    payloadPreview,
  }
}
