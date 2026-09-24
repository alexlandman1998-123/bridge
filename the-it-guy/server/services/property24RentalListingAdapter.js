import {
  createProperty24ListingPlan,
  normalizeProperty24ListingText,
  toProperty24Integer,
  toProperty24Number,
} from './property24ListingMapper.js'
import {
  buildRentalProperty24FieldComparison,
  PROPERTY24_RENTAL_LISTING_API_VERSION,
} from '../../src/services/rentals/rentalListingProperty24FieldComparisonModel.js'

export const PROPERTY24_RENTAL_LISTING_ADAPTER_VERSION = 'arch9_property24_rental_listing_adapter_v1'

export function isProperty24RentalListingApiVersionSupported(value = PROPERTY24_RENTAL_LISTING_API_VERSION) {
  const match = normalizeProperty24ListingText(value).toLowerCase().match(/^v(\d+)$/)
  return Boolean(match && Number(match[1]) >= 55)
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeProperty24ListingText(value)
    if (text) return text
  }
  return ''
}

function normalizeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && normalizeProperty24ListingText(item) !== '')
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return [value].filter(Boolean)
}

function normalizeDateTime(value) {
  const text = normalizeProperty24ListingText(value)
  if (!text) return ''
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function normalizeMoney(value) {
  const amount = toProperty24Number(value)
  return amount === null ? null : Math.round(amount)
}

function mapPetsAllowed(value) {
  const text = normalizeProperty24ListingText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['allowed', 'pets_allowed', 'pet_friendly', 'yes', 'true'].includes(text)) return 'Yes'
  if (['not_allowed', 'no_pets', 'no', 'false'].includes(text)) return 'No'
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return 'DontKnow'
}

function mapFurnishedStatus(value) {
  const text = normalizeProperty24ListingText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['furnished', 'yes', 'true'].includes(text)) return 'Yes'
  if (['semi_furnished', 'optional', 'partly_furnished'].includes(text)) return 'Optional'
  return 'No'
}

function rentalRateFromCadence(value) {
  const text = normalizeProperty24ListingText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['week', 'weekly'].includes(text)) return 'Week'
  if (['day', 'daily'].includes(text)) return 'Day'
  if (['year', 'yearly', 'annual', 'annually'].includes(text)) return 'Year'
  if (['per_square_metre', 'per_square_meter', 'square_metre', 'square_meter', 'sqm', 'm2'].includes(text)) return 'SquareMetre'
  return 'Month'
}

function buildDepositComment(value, policy = '') {
  if (normalizeProperty24ListingText(policy).toLowerCase() === 'no_deposit') return 'No deposit required'
  const amount = normalizeMoney(value)
  if (!amount) return ''
  return `Equal to deposit amount R${amount}`
}

function buildLeasePeriod(value) {
  const months = toProperty24Number(value)
  if (!months) return ''
  const roundedMonths = Math.round(months)
  return `${roundedMonths} Month${roundedMonths === 1 ? '' : 's'}`
}

function readComparisonRow(comparison = {}, key = '') {
  return (comparison.rows || []).find((row) => row.key === key) || {}
}

function buildRentalValues({ listing = {}, comparison = {} } = {}) {
  const preview = comparison.readiness?.payloadPreview || {}
  const rentalInfo = preview.rentalInfo || {}
  const property = preview.property || {}
  const marketing = preview.marketing || {}
  const agencyId = toProperty24Integer(preview.agencyId || readComparisonRow(comparison, 'agencyId').property24Value)
  const contactAgentIds = normalizeArray(preview.contactAgentIds || readComparisonRow(comparison, 'contactAgentIds').property24Value)
    .map(toProperty24Integer)
    .filter(Boolean)
  const suburbId = toProperty24Integer(property.suburbId || readComparisonRow(comparison, 'suburbId').property24Value)
  const propertyTypeId = toProperty24Integer(property.propertyTypeId || readComparisonRow(comparison, 'propertyTypeId').property24Value)
  const monthlyRent = normalizeMoney(rentalInfo.monthlyRent || readComparisonRow(comparison, 'monthlyRent').property24Value)
  const occupationDate = normalizeDateTime(rentalInfo.availableFrom || readComparisonRow(comparison, 'availableFrom').property24Value)
  const expiryDate = normalizeDateTime(readComparisonRow(comparison, 'expiryDate').property24Value || listing.expiryDate || listing.expiry_date || listing.mandateEndDate || listing.mandate_end_date)
  const rentalPriceFrequency = firstText(rentalInfo.rentalPriceFrequency, rentalInfo.rental_price_frequency, listing.rentalPriceFrequency, listing.rental_price_frequency)
  const rentalRate = rentalRateFromCadence(rentalPriceFrequency || rentalInfo.rentalRate || listing.rentalRate || listing.rental_rate)
  const depositPolicy = firstText(rentalInfo.depositPolicy, rentalInfo.deposit_policy, listing.depositPolicy, listing.deposit_policy)
  const rentalMandateType = firstText(rentalInfo.rentalMandateType, rentalInfo.rental_mandate_type, listing.rentalMandateType, listing.rental_mandate_type)
  const retirementAccommodation = firstText(property.retirementAccommodation, rentalInfo.retirementAccommodation, listing.retirementAccommodation, listing.retirement_accommodation)
  const depositRequirementsComments = firstText(
    listing.depositRequirementsComments,
    listing.deposit_requirements_comments,
    buildDepositComment(rentalInfo.depositAmount || readComparisonRow(comparison, 'depositAmount').arch9Value, depositPolicy),
  )
  const leasePeriod = firstText(
    listing.leasePeriod,
    listing.lease_period,
    buildLeasePeriod(rentalInfo.leasePeriodMonths || readComparisonRow(comparison, 'leasePeriodMonths').arch9Value),
  )

  return {
    preview,
    property,
    marketing,
    rentalInfo,
    agencyId,
    contactAgentIds,
    primaryAgentId: contactAgentIds[0] || null,
    agentSourceReference: firstText(
      preview.agentSourceReference,
      readComparisonRow(comparison, 'agentSourceReference').property24Value,
      listing.property24AgentSourceReference,
      listing.property24_agent_source_reference,
    ),
    suburbId,
    propertyTypeId,
    monthlyRent,
    occupationDate,
    expiryDate,
    rentalRate,
    rentalPriceFrequency,
    depositPolicy,
    rentalMandateType,
    retirementAccommodation,
    rentalInfoPayload: {
      rentalRate,
      depositRequirementsComments: depositRequirementsComments || null,
      leasePeriod: leasePeriod || null,
    },
    petsAllowed: mapPetsAllowed(rentalInfo.petsAllowed === true ? 'allowed' : rentalInfo.petsAllowed === false ? 'not_allowed' : listing.petsPolicy || listing.pets_policy || readComparisonRow(comparison, 'petsAllowed').arch9Value),
    furnishedStatus: mapFurnishedStatus(rentalInfo.furnishedStatus || listing.furnishedStatus || listing.furnished_status || readComparisonRow(comparison, 'furnishedStatus').arch9Value),
  }
}

function buildAdaptedListing({ listing = {}, values = {} } = {}) {
  const canonicalFacts = listing.seller_canonical_facts_json || listing.sellerCanonicalFacts || {}
  const addressProfile = canonicalFacts.addressProfile || canonicalFacts.address_profile || {}
  const propertyProfile = canonicalFacts.propertyProfile || canonicalFacts.property_profile || {}
  return {
    ...listing,
    listingType: 'Rental',
    listingStatus: firstText(listing.property24Status, listing.property24_status, listing.listingStatus, listing.listing_status),
    askingPrice: values.monthlyRent,
    expiryDate: values.expiryDate,
    mandateEndDate: values.expiryDate,
    property24SuburbId: values.suburbId,
    property24PropertyTypeId: values.propertyTypeId,
    propertyType: values.property.propertyType || listing.propertyType || listing.property_type,
    propertyCategory: listing.propertyCategory || listing.property_category || propertyProfile.propertyCategory || propertyProfile.property_category || 'residential',
    exactAddressVisibility: listing.exactAddressVisibility || listing.exact_address_visibility || addressProfile.exactAddressVisibility || addressProfile.exact_address_visibility,
    floorSize: values.property.floorSize ?? listing.floorSize ?? listing.floor_size,
    erfSize: values.property.erfSize ?? listing.erfSize ?? listing.erf_size,
    bedrooms: values.property.bedrooms ?? listing.bedrooms,
    bathrooms: values.property.bathrooms ?? listing.bathrooms,
    garages: values.property.garages ?? listing.garages,
    parkingBays: values.property.parkingBays ?? listing.parkingBays,
    garden: values.property.garden ?? listing.garden,
    pool: values.property.pool ?? listing.pool,
    flatlet: values.property.flatlet ?? listing.flatlet,
    petsAllowed: values.petsAllowed,
    furnishedStatus: values.furnishedStatus,
    listingReference: values.agentSourceReference,
  }
}

function buildAdaptedPublication({ values = {} } = {}) {
  return {
    listingType: 'Rental',
    askingPrice: values.monthlyRent,
    title: values.marketing.title,
    description: values.marketing.description,
    bedrooms: values.property.bedrooms,
    bathrooms: values.property.bathrooms,
    garages: values.property.garages,
    parkingBays: values.property.parkingBays,
    garden: values.property.garden,
    pool: values.property.pool,
    flatlet: values.property.flatlet,
    petsAllowed: values.petsAllowed,
    furnishedStatus: values.furnishedStatus,
    propertyType: values.property.propertyType,
    floorSize: values.property.floorSize,
    erfSize: values.property.erfSize,
  }
}

function addRentalPayloadFields(payload, values) {
  if (!payload) return null
  return {
    ...payload,
    listingType: 'Rental',
    price: values.monthlyRent || payload.price,
    occupationDate: values.occupationDate,
    rentalInfo: values.rentalInfoPayload,
  }
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function getAdapterDataBlockers(values = {}, { apiVersion = PROPERTY24_RENTAL_LISTING_API_VERSION } = {}) {
  const blockers = []
  if (!isProperty24RentalListingApiVersionSupported(apiVersion)) blockers.push('property24_rental_listing_service_v55_required')
  if (!values.agencyId) blockers.push('missing_property24_agency_id')
  if (!values.suburbId) blockers.push('missing_property24_suburb_id')
  if (!values.propertyTypeId) blockers.push('missing_property24_property_type_id')
  if (!values.monthlyRent) blockers.push('missing_rental_monthly_rent')
  if (!values.expiryDate) blockers.push('missing_expiry_date')
  if (!values.rentalRate) blockers.push('missing_rental_rate')
  if (!values.rentalPriceFrequency) blockers.push('missing_rental_price_frequency')
  if (!values.depositPolicy || normalizeProperty24ListingText(values.depositPolicy).toLowerCase() === 'not_captured') blockers.push('missing_rental_deposit_policy')
  if (normalizeProperty24ListingText(values.rentalMandateType).toLowerCase() === 'house_share') blockers.push('property24_house_share_not_supported')
  return unique(blockers)
}

function getRentalApprovalWarnings(fieldComparison = {}) {
  const warnings = []
  const rows = Array.isArray(fieldComparison.rows) ? fieldComparison.rows : []
  const marketing = rows.find((row) => row.key === 'marketingApprovalStatus')
  const mandate = rows.find((row) => row.key === 'mandateStatus')
  if (marketing?.blocksPublish) warnings.push('rental_marketing_not_approved')
  if (mandate?.blocksPublish) warnings.push('rental_mandate_not_signed')
  return warnings
}

function getRentalNextStep({ canPreview, canSubmit, technicalBlockers }) {
  if (!canPreview) return 'Fix the listed rental data blockers before generating a Property24 rental payload.'
  if ((technicalBlockers || []).includes('sandbox_property24_agent_id_required_before_submit')) {
    return 'Sandbox rental payload is ready for review, but a real Property24 agent ID is still required before submit.'
  }
  if (!canSubmit) return 'Preview is ready. Load image bytes and clear technical blockers before an ExDev submit.'
  return 'Rental payload is ready for a controlled ExDev submit.'
}

export function createProperty24RentalListingPlan({
  listing = {},
  publication = {},
  media = null,
  existingSync = {},
  agentMapping = {},
  catalogMapping = {},
  imageByteLoad = null,
  options = {},
} = {}) {
  const resolvedAgentId = toProperty24Integer(
    agentMapping.property24AgentId ||
      agentMapping.property24_agent_id ||
      agentMapping.agentId ||
      agentMapping.agent_id,
  )
  const resolvedAgentSourceReference = firstText(agentMapping.sourceReference, agentMapping.source_reference)
  const fieldComparison = buildRentalProperty24FieldComparison(listing, {
    resolution: {
      agencyId: options.agencyId,
      contactAgentIds: resolvedAgentId ? [resolvedAgentId] : [],
      agentSourceReference: resolvedAgentSourceReference,
      suburbId: catalogMapping.suburbId || catalogMapping.suburb_id,
      propertyTypeId: catalogMapping.propertyTypeId || catalogMapping.property_type_id,
      expiryDate: options.expiryDate,
    },
  })
  const values = buildRentalValues({ listing, comparison: fieldComparison })
  const apiVersion = firstText(options.apiVersion, PROPERTY24_RENTAL_LISTING_API_VERSION).toLowerCase()
  const adaptedListing = buildAdaptedListing({ listing, values })
  const adaptedPublication = {
    ...buildAdaptedPublication({ values }),
    ...publication,
    listingType: 'Rental',
  }
  const adaptedMedia = Array.isArray(media) ? media : values.marketing.photos || []
  const adaptedAgentMapping = {
    ...agentMapping,
    property24AgentId: resolvedAgentId || values.primaryAgentId,
    sourceReference: firstText(resolvedAgentSourceReference, values.agentSourceReference),
  }
  const adaptedCatalogMapping = {
    ...catalogMapping,
    suburbId: toProperty24Integer(catalogMapping.suburbId || catalogMapping.suburb_id || values.suburbId),
    propertyTypeId: toProperty24Integer(catalogMapping.propertyTypeId || catalogMapping.property_type_id || values.propertyTypeId),
  }
  const adapterOptions = {
    ...options,
    environment: firstText(options.environment, 'exdev'),
    sandboxPayloadTestMode: options.sandboxPayloadTestMode ?? true,
    agencyId: toProperty24Integer(options.agencyId || values.agencyId),
    agentSourceReference: values.agentSourceReference,
    price: values.monthlyRent,
    expiryDate: values.expiryDate,
    status: firstText(options.status, listing.property24Status, listing.property24_status, listing.listingStatus, listing.listing_status),
  }
  const basePlan = createProperty24ListingPlan({
    listing: adaptedListing,
    publication: adaptedPublication,
    media: adaptedMedia,
    existingSync,
    agentMapping: adaptedAgentMapping,
    catalogMapping: adaptedCatalogMapping,
    options: adapterOptions,
  })

  const adapterDataBlockers = getAdapterDataBlockers(values, { apiVersion })
  const rentalQualityWarnings = []
  // Availability and internal approvals inform an agent's decision, but are
  // not required fields in the Property24 listing payload.
  if (!values.occupationDate) rentalQualityWarnings.push('missing_rental_occupation_date')
  if (normalizeProperty24ListingText(values.retirementAccommodation).toLowerCase() === 'yes') rentalQualityWarnings.push('property24_retirement_accommodation_not_mapped')
  rentalQualityWarnings.push(...getRentalApprovalWarnings(fieldComparison))
  const dataBlockers = unique([...(basePlan.dataBlockers || []), ...adapterDataBlockers])
  const technicalBlockers = unique(basePlan.technicalBlockers || [])
  const canPreview = basePlan.canPreview && dataBlockers.length === 0
  const canSubmit = canPreview && basePlan.canSubmit && technicalBlockers.length === 0
  const previewPayload = canPreview ? addRentalPayloadFields(basePlan.previewPayload, values) : null
  const submitPayload = canSubmit ? addRentalPayloadFields(basePlan.payload, values) : null

  return {
    version: PROPERTY24_RENTAL_LISTING_ADAPTER_VERSION,
    phase: 'property24-rental-listing-backend-preview',
    generatedAt: new Date().toISOString(),
    safety: {
      property24ApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    status: canPreview ? (canSubmit ? 'SUBMIT_READY' : 'PREVIEW_READY') : 'BLOCKED',
    canPreview,
    canSubmit,
    dataBlockers,
    technicalBlockers,
    qualityWarnings: unique([...(basePlan.qualityWarnings || []), ...rentalQualityWarnings]),
    ...(imageByteLoad ? { imageByteLoad } : {}),
    fieldComparison,
    summary: {
      ...basePlan.summary,
      listingType: 'Rental',
      property24ApiVersion: apiVersion,
      agencyId: values.agencyId || null,
      contactAgentIds: values.contactAgentIds,
      agentSourceReference: values.agentSourceReference,
      monthlyRent: values.monthlyRent,
      occupationDate: values.occupationDate,
      rentalRate: values.rentalRate,
      rentalPriceFrequency: values.rentalPriceFrequency,
      depositPolicy: values.depositPolicy,
      rentalMandateType: values.rentalMandateType || 'standard_rental',
      rentalInfoPresent: Boolean(values.rentalInfoPayload.rentalRate),
      backendAdapterPreviewOnly: true,
    },
    previewPayload,
    ...(options.includeSubmitPayload ? { payload: submitPayload } : {}),
    nextStep: getRentalNextStep({ canPreview, canSubmit, technicalBlockers }),
  }
}
