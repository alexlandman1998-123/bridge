import {
  PROPERTY24_RENTAL_READINESS_FIELDS,
} from './rentalListingArchitecture.js'
import {
  buildRentalListingIndexRow,
  getRentalListingPublication,
  getRentalListingRentalInfo,
} from './rentalListingIndexModel.js'
import {
  buildRentalProperty24Readiness,
} from './rentalListingProperty24ReadinessModel.js'

export const RENTAL_PROPERTY24_FIELD_COMPARISON_VERSION = 'arch9_rental_property24_field_comparison_v1'

export const RENTAL_PROPERTY24_FIELD_STATUS = Object.freeze({
  MAPPED: 'mapped',
  DEFAULTED: 'defaulted',
  NEEDS_CAPTURE: 'needs_capture',
  NEEDS_MAPPING: 'needs_mapping',
  INTERNAL_GATE: 'internal_gate',
  OPTIONAL: 'optional',
})

export const RENTAL_PROPERTY24_FIELD_SEVERITY = Object.freeze({
  BLOCKER: 'blocker',
  WARNING: 'warning',
  INFO: 'info',
})

const PROPERTY24_RENTAL_FIELD_CONTRACT = Object.freeze([
  {
    key: 'listingType',
    arch9Field: 'listingCategory / listingPublicationData.listingType',
    property24Field: 'listingType',
    requirement: 'Property24 required for rental routing',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'listingType',
    expectedValue: 'Rental',
  },
  {
    key: 'agencyId',
    arch9Field: 'organisation Property24 settings',
    property24Field: 'agencyId',
    requirement: 'Property24 required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'agencyId',
    requiresInteger: true,
  },
  {
    key: 'contactAgentIds',
    arch9Field: 'Property24 agent mapping',
    property24Field: 'contactAgentIds',
    requirement: 'Property24 required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'contactAgentIds',
    requiresIntegerArray: true,
  },
  {
    key: 'agentSourceReference',
    arch9Field: 'Property24 agent mapping source reference',
    property24Field: 'internal mapping only',
    requirement: 'Arch9 required before backend submit',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'agentSourceReference',
  },
  {
    key: 'status',
    arch9Field: 'listingStatus / property24Status',
    property24Field: 'status',
    requirement: 'Property24 required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    defaultValue: 'NewListing',
  },
  {
    key: 'monthlyRent',
    arch9Field: 'rentalInfo.monthlyRent / askingPrice',
    property24Field: 'price',
    requirement: 'Property24 price for rental listing',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'monthlyRent',
  },
  {
    key: 'rentalInfo',
    arch9Field: 'sellerCanonicalFacts.rentalInfo',
    property24Field: 'rentalInfo',
    requirement: 'Property24 rental object for rental listings',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'rentalInfo',
  },
  {
    key: 'rentalRate',
    arch9Field: 'rentalInfo rental cadence',
    property24Field: 'rentalInfo.rentalRate',
    requirement: 'Property24 rentalInfo',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    defaultValue: 'Month',
  },
  {
    key: 'availableFrom',
    arch9Field: 'rentalInfo.availableFrom',
    property24Field: 'occupationDate',
    requirement: 'Property24 optional, Arch9 rental readiness required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'availableFrom',
  },
  {
    key: 'expiryDate',
    arch9Field: 'mandateEndDate / expiryDate',
    property24Field: 'expiryDate',
    requirement: 'Property24 required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'expiryDate',
  },
  {
    key: 'description',
    arch9Field: 'description / listingPublicationData.description',
    property24Field: 'description',
    requirement: 'Property24 required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'description',
  },
  {
    key: 'title',
    arch9Field: 'title / listingPublicationData.title',
    property24Field: 'descriptionHeader',
    requirement: 'Property24 optional, recommended',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.WARNING,
  },
  {
    key: 'photos',
    arch9Field: 'listing media / publication media',
    property24Field: 'photos',
    requirement: 'Property24 required on new listing',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'photos',
  },
  {
    key: 'suburbId',
    arch9Field: 'Property24 suburb lookup',
    property24Field: 'propertyInfo.suburbId',
    requirement: 'Property24 required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'suburbId',
    requiresInteger: true,
  },
  {
    key: 'propertyTypeId',
    arch9Field: 'propertyType mapped to Property24 type',
    property24Field: 'propertyInfo.propertyTypeId',
    requirement: 'Property24 required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'propertyTypeId',
    requiresInteger: true,
  },
  {
    key: 'address',
    arch9Field: 'propertyAddress / formattedAddress',
    property24Field: 'propertyInfo.streetName / streetNumber',
    requirement: 'Property24 optional, strongly recommended',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.WARNING,
  },
  {
    key: 'bedrooms',
    arch9Field: 'bedrooms',
    property24Field: 'propertyFeatures.bedrooms',
    requirement: 'Property24 optional',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.INFO,
  },
  {
    key: 'bathrooms',
    arch9Field: 'bathrooms',
    property24Field: 'propertyFeatures.bathrooms.bathrooms',
    requirement: 'Property24 optional',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.INFO,
  },
  {
    key: 'garages',
    arch9Field: 'garages / parkingBays',
    property24Field: 'propertyFeatures.garages',
    requirement: 'Property24 propertyFeatures required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'garages',
  },
  {
    key: 'parkingBays',
    arch9Field: 'parkingBays',
    property24Field: 'propertyFeatures.parking.open',
    requirement: 'Property24 optional',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.INFO,
  },
  {
    key: 'garden',
    arch9Field: 'garden',
    property24Field: 'propertyFeatures.garden',
    requirement: 'Property24 propertyFeatures required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'garden',
  },
  {
    key: 'pool',
    arch9Field: 'pool',
    property24Field: 'propertyFeatures.pool',
    requirement: 'Property24 propertyFeatures required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'pool',
  },
  {
    key: 'flatlet',
    arch9Field: 'flatlet',
    property24Field: 'propertyFeatures.flatlet',
    requirement: 'Property24 propertyFeatures required',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'flatlet',
  },
  {
    key: 'petsAllowed',
    arch9Field: 'rentalInfo.petsPolicy',
    property24Field: 'propertyFeatures.petsAllowed',
    requirement: 'Property24 enum: Yes, No, DontKnow',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'petsAllowed',
  },
  {
    key: 'furnishedStatus',
    arch9Field: 'rentalInfo.furnishedStatus',
    property24Field: 'propertyFeatures.furnishedStatus',
    requirement: 'Property24 enum: Yes, No, Optional',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'furnishedStatus',
  },
  {
    key: 'depositAmount',
    arch9Field: 'rentalInfo.depositAmount',
    property24Field: 'rentalInfo.depositRequirementsComments',
    requirement: 'Property24 optional',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.WARNING,
  },
  {
    key: 'leasePeriodMonths',
    arch9Field: 'rentalInfo.leasePeriodMonths',
    property24Field: 'rentalInfo.leasePeriod',
    requirement: 'Property24 optional',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.WARNING,
  },
  {
    key: 'utilitiesPolicy',
    arch9Field: 'rentalInfo.utilitiesPolicy',
    property24Field: 'description / internal Arch9 metadata',
    requirement: 'No direct Property24 field in Listing Service v53',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.INFO,
  },
  {
    key: 'marketingApprovalStatus',
    arch9Field: 'rentalInfo.marketingApprovalStatus',
    property24Field: 'internal publish gate',
    requirement: 'Arch9 required before publishing',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'marketingApprovalStatus',
  },
  {
    key: 'mandateStatus',
    arch9Field: 'rentalInfo.mandateStatus',
    property24Field: 'internal publish gate',
    requirement: 'Arch9 required before publishing',
    severity: RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER,
    readinessKey: 'mandateStatus',
  },
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function firstText(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function asDateTime(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? text : date.toISOString()
}

function mapPetsAllowed(value) {
  const key = normalizeKey(value)
  if (['allowed', 'pets_allowed', 'pet_friendly', 'yes', 'true'].includes(key)) return 'Yes'
  if (['not_allowed', 'no_pets', 'no', 'false'].includes(key)) return 'No'
  return 'DontKnow'
}

function mapFurnishedStatus(value) {
  const key = normalizeKey(value)
  if (['furnished', 'yes', 'true'].includes(key)) return 'Yes'
  if (['semi_furnished', 'optional', 'partly_furnished'].includes(key)) return 'Optional'
  return 'No'
}

function getValueForField(key, { listing, row, publication, rentalInfo, payloadPreview }) {
  switch (key) {
    case 'listingType':
      return payloadPreview.listingType || row.raw?.listingType || row.raw?.listing_type
    case 'agencyId':
      return payloadPreview.agencyId
    case 'contactAgentIds':
      return payloadPreview.contactAgentIds
    case 'agentSourceReference':
      return payloadPreview.agentSourceReference
    case 'status':
      return firstText(listing.property24Status, listing.property24_status, publication.status, 'NewListing')
    case 'monthlyRent':
      return payloadPreview.rentalInfo?.monthlyRent
    case 'rentalInfo':
      return payloadPreview.rentalInfo
    case 'rentalRate':
      return 'Month'
    case 'availableFrom':
      return payloadPreview.rentalInfo?.availableFrom
    case 'expiryDate':
      return firstText(listing.expiryDate, listing.expiry_date, listing.mandateEndDate, listing.mandate_end_date, row.mandateEndDate, rentalInfo.mandateEndDate, rentalInfo.mandate_end_date)
    case 'description':
      return payloadPreview.marketing?.description
    case 'title':
      return payloadPreview.marketing?.title
    case 'photos':
      return payloadPreview.marketing?.photos
    case 'suburbId':
      return payloadPreview.property?.suburbId
    case 'propertyTypeId':
      return payloadPreview.property?.propertyTypeId
    case 'address':
      return payloadPreview.property?.address
    case 'bedrooms':
      return payloadPreview.property?.bedrooms
    case 'bathrooms':
      return payloadPreview.property?.bathrooms
    case 'garages':
      return payloadPreview.property?.garages
    case 'parkingBays':
      return row.parkingBays
    case 'garden':
      return payloadPreview.property?.garden
    case 'pool':
      return payloadPreview.property?.pool
    case 'flatlet':
      return payloadPreview.property?.flatlet
    case 'petsAllowed':
      return mapPetsAllowed(payloadPreview.rentalInfo?.petsAllowed === true ? 'allowed' : payloadPreview.rentalInfo?.petsAllowed === false ? 'not_allowed' : row.petsPolicy)
    case 'furnishedStatus':
      return mapFurnishedStatus(row.furnishedStatus)
    case 'depositAmount':
      return payloadPreview.rentalInfo?.depositAmount
    case 'leasePeriodMonths':
      return payloadPreview.rentalInfo?.leasePeriodMonths
    case 'utilitiesPolicy':
      return row.utilitiesPolicy
    case 'marketingApprovalStatus':
      return row.marketingApprovalStatus
    case 'mandateStatus':
      return row.mandateStatus
    default:
      return undefined
  }
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return Boolean(normalizeText(value))
}

function isIntegerLike(value) {
  if (!hasValue(value)) return false
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0
}

function hasValidContractValue(definition, value) {
  if (definition.requiresInteger) return isIntegerLike(value)
  if (definition.requiresIntegerArray) return Array.isArray(value) && value.length > 0 && value.every(isIntegerLike)
  return hasValue(value)
}

function resolveStatus(definition, value, readinessByKey) {
  if (definition.defaultValue && !hasValue(value)) return RENTAL_PROPERTY24_FIELD_STATUS.DEFAULTED
  if (definition.key === 'rentalRate') return RENTAL_PROPERTY24_FIELD_STATUS.DEFAULTED
  if (['marketingApprovalStatus', 'mandateStatus', 'agentSourceReference'].includes(definition.key)) {
    return readinessByKey[definition.readinessKey]?.complete
      ? RENTAL_PROPERTY24_FIELD_STATUS.INTERNAL_GATE
      : RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_CAPTURE
  }
  if (definition.readinessKey) {
    return readinessByKey[definition.readinessKey]?.complete && hasValidContractValue(definition, value)
      ? RENTAL_PROPERTY24_FIELD_STATUS.MAPPED
      : definition.key.includes('Id') || definition.key === 'contactAgentIds'
        ? RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING
        : RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_CAPTURE
  }
  if (definition.severity === RENTAL_PROPERTY24_FIELD_SEVERITY.INFO) return hasValue(value) ? RENTAL_PROPERTY24_FIELD_STATUS.MAPPED : RENTAL_PROPERTY24_FIELD_STATUS.OPTIONAL
  return hasValue(value) ? RENTAL_PROPERTY24_FIELD_STATUS.MAPPED : RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_CAPTURE
}

function formatProperty24Value(key, value) {
  if (key === 'availableFrom' || key === 'expiryDate') return asDateTime(value)
  if (key === 'depositAmount') return value ? `Equal to deposit amount R${value}` : ''
  if (key === 'leasePeriodMonths') return value ? `${value} Months` : ''
  if (Array.isArray(value)) return value
  return value
}

function summarizeRows(rows = []) {
  const summary = {
    total: rows.length,
    mapped: 0,
    defaulted: 0,
    needsCapture: 0,
    needsMapping: 0,
    internalGates: 0,
    optional: 0,
    blockers: 0,
    warnings: 0,
  }
  for (const row of rows) {
    if (row.status === RENTAL_PROPERTY24_FIELD_STATUS.MAPPED) summary.mapped += 1
    if (row.status === RENTAL_PROPERTY24_FIELD_STATUS.DEFAULTED) summary.defaulted += 1
    if (row.status === RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_CAPTURE) summary.needsCapture += 1
    if (row.status === RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING) summary.needsMapping += 1
    if (row.status === RENTAL_PROPERTY24_FIELD_STATUS.INTERNAL_GATE) summary.internalGates += 1
    if (row.status === RENTAL_PROPERTY24_FIELD_STATUS.OPTIONAL) summary.optional += 1
    if (row.blocksPublish) summary.blockers += 1
    if (row.warnsBeforePublish) summary.warnings += 1
  }
  return summary
}

export function buildRentalProperty24FieldComparison(listing = {}) {
  const readiness = buildRentalProperty24Readiness(listing)
  const row = buildRentalListingIndexRow(listing)
  const publication = getRentalListingPublication(listing)
  const rentalInfo = getRentalListingRentalInfo(listing)
  const payloadPreview = readiness.payloadPreview || {}
  const readinessByKey = Object.fromEntries((readiness.items || []).map((item) => [item.key, item]))

  const rows = PROPERTY24_RENTAL_FIELD_CONTRACT.map((definition) => {
    const value = getValueForField(definition.key, { listing, row, publication, rentalInfo, payloadPreview })
    const status = resolveStatus(definition, value, readinessByKey)
    const blocksPublish = definition.severity === RENTAL_PROPERTY24_FIELD_SEVERITY.BLOCKER &&
      [RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_CAPTURE, RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING].includes(status)
    const warnsBeforePublish = definition.severity === RENTAL_PROPERTY24_FIELD_SEVERITY.WARNING &&
      [RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_CAPTURE, RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING, RENTAL_PROPERTY24_FIELD_STATUS.OPTIONAL].includes(status)

    return {
      key: definition.key,
      arch9Field: definition.arch9Field,
      property24Field: definition.property24Field,
      requirement: definition.requirement,
      severity: definition.severity,
      status,
      valuePresent: hasValidContractValue(definition, value) || status === RENTAL_PROPERTY24_FIELD_STATUS.DEFAULTED,
      arch9Value: value,
      property24Value: formatProperty24Value(definition.key, hasValue(value) ? value : definition.defaultValue),
      blocksPublish,
      warnsBeforePublish,
      notes: readinessByKey[definition.readinessKey]?.blocker || '',
    }
  })

  const missingReadinessFields = PROPERTY24_RENTAL_READINESS_FIELDS.filter((field) => !readinessByKey[field])
  const missingComparisonFields = PROPERTY24_RENTAL_READINESS_FIELDS.filter((field) => !rows.some((item) => item.key === field))
  const summary = summarizeRows(rows)

  return {
    version: RENTAL_PROPERTY24_FIELD_COMPARISON_VERSION,
    property24Service: 'Listing Service v53',
    listingType: payloadPreview.listingType || 'Rental',
    rows,
    summary,
    blockers: rows.filter((item) => item.blocksPublish),
    warnings: rows.filter((item) => item.warnsBeforePublish),
    missingReadinessFields,
    missingComparisonFields,
    readyForBackendAdapter: summary.blockers === 0 && missingReadinessFields.length === 0 && missingComparisonFields.length === 0,
    readiness,
  }
}

export function getRentalProperty24FieldContract() {
  return PROPERTY24_RENTAL_FIELD_CONTRACT.map((item) => ({ ...item }))
}
