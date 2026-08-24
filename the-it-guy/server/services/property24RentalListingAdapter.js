import {
  createProperty24ListingPlan,
  normalizeProperty24ListingText,
  toProperty24Integer,
  toProperty24Number,
} from './property24ListingMapper.js'
import {
  buildRentalProperty24FieldComparison,
} from '../../src/services/rentals/rentalListingProperty24FieldComparisonModel.js'

export const PROPERTY24_RENTAL_LISTING_ADAPTER_VERSION = 'arch9_property24_rental_listing_adapter_v1'

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
  if (['square_metre', 'sqm', 'm2'].includes(text)) return 'SquareMetre'
  return 'Month'
}

function buildDepositComment(value) {
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
  const rentalRate = rentalRateFromCadence(rentalInfo.rentalRate || listing.rentalRate || listing.rental_rate)
  const depositRequirementsComments = firstText(
    listing.depositRequirementsComments,
    listing.deposit_requirements_comments,
    buildDepositComment(rentalInfo.depositAmount || readComparisonRow(comparison, 'depositAmount').arch9Value),
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
    agentSourceReference: firstText(preview.agentSourceReference, readComparisonRow(comparison, 'agentSourceReference').property24Value, listing.listingReference, listing.listing_reference, listing.id),
    suburbId,
    propertyTypeId,
    monthlyRent,
    occupationDate,
    expiryDate,
    rentalRate,
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

function getAdapterDataBlockers(values = {}) {
  const blockers = []
  if (!values.agencyId) blockers.push('missing_property24_agency_id')
  if (!values.suburbId) blockers.push('missing_property24_suburb_id')
  if (!values.propertyTypeId) blockers.push('missing_property24_property_type_id')
  if (!values.monthlyRent) blockers.push('missing_rental_monthly_rent')
  if (!values.occupationDate) blockers.push('missing_rental_occupation_date')
  if (!values.expiryDate) blockers.push('missing_expiry_date')
  if (!values.rentalRate) blockers.push('missing_rental_rate')
  return unique(blockers)
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
  options = {},
} = {}) {
  const fieldComparison = buildRentalProperty24FieldComparison(listing)
  const values = buildRentalValues({ listing, comparison: fieldComparison })
  const adaptedListing = buildAdaptedListing({ listing, values })
  const adaptedPublication = {
    ...buildAdaptedPublication({ values }),
    ...publication,
    listingType: 'Rental',
  }
  const adaptedMedia = Array.isArray(media) ? media : values.marketing.photos || []
  const adaptedAgentMapping = {
    ...agentMapping,
    property24AgentId: toProperty24Integer(agentMapping.property24AgentId || agentMapping.property24_agent_id || values.primaryAgentId),
    sourceReference: firstText(agentMapping.sourceReference, agentMapping.source_reference, values.agentSourceReference),
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
    agencyId: values.agencyId,
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

  const adapterDataBlockers = getAdapterDataBlockers(values)
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
    fieldComparison,
    summary: {
      ...basePlan.summary,
      listingType: 'Rental',
      agencyId: values.agencyId || null,
      contactAgentIds: values.contactAgentIds,
      agentSourceReference: values.agentSourceReference,
      monthlyRent: values.monthlyRent,
      occupationDate: values.occupationDate,
      rentalRate: values.rentalRate,
      rentalInfoPresent: Boolean(values.rentalInfoPayload.rentalRate),
      backendAdapterPreviewOnly: true,
    },
    previewPayload,
    ...(options.includeSubmitPayload ? { payload: submitPayload } : {}),
    nextStep: getRentalNextStep({ canPreview, canSubmit, technicalBlockers }),
  }
}
