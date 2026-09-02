import crypto from 'node:crypto'
import { pickImportValue } from '../../src/lib/csvImport.js'
import {
  PROPERTY_TYPES_BY_CATEGORY,
  normalizePropertyCategory,
} from '../../src/lib/propertyTaxonomy.js'
import {
  createProperty24MigrationDryRun,
  parseProperty24ContactAgentIds,
  parseProperty24MigrationSourceRows,
  resolveProperty24ListingSourceReference,
} from './migrationImportService.js'
import {
  normalizeArch9AgentCandidate,
  normalizeProperty24Agent,
} from './synchronisationService.js'

export const PROPERTY24_MIGRATION_MAPPING_VERSION = 'property24_migration_mapping_v1'

const ACTIVE_LISTING_STATUSES = new Set(['active', 'newlisting'])
const CLOSED_LISTING_STATUSES = new Set(['sold', 'rented', 'withdrawn', 'inactive', 'expired', 'deleted'])
const ACTIVE_AGENT_STATUSES = new Set(['active'])

const DIRECT_AGENT_FIELD_MAP = Object.freeze({
  AgencyId: 'property24_agent_mappings.agency_id',
  AgentId: 'property24_agent_mappings.property24_agent_id',
  Firstname: 'agentDraft.firstName',
  Lastname: 'agentDraft.lastName',
  Status: 'property24_agent_mappings.status',
  SourceReference: 'property24_agent_mappings.source_reference',
  CountryId: 'agentDraft.property24CountryId',
  MobileNumber: 'property24_agent_mappings.mobile_snapshot',
  EmailAddress: 'property24_agent_mappings.email_snapshot',
  Qualification: 'agentDraft.qualification',
  About: 'agentDraft.about',
  Property24ProfilePictureURL: 'agentDraft.profilePictureSourceUrl',
  Published: 'agentDraft.published',
  ReceiveStatsMail: 'agentDraft.receiveStatsMail',
  ReceiveGroupListingEmail: 'agentDraft.receiveGroupListingEmail',
})

const DIRECT_LISTING_FIELD_MAP = Object.freeze({
  AgencyId: 'property24_listing_syncs.agency_id',
  ContactAgentIds: 'relationships.contactAgents',
  ListingNumber: 'property24_listing_syncs.listing_number',
  ListingType: 'listing_publication_data.listing_type',
  Status: 'private_listings.listing_status',
  Price: 'private_listings.asking_price',
  ListingVisibility: 'private_listings.listing_visibility',
  OccupationDate: 'sellerCanonicalFacts.rentalInfo.occupationDate',
  ExpiryDate: 'sellerCanonicalFacts.property24Import.expiryDate',
  Description: 'private_listings.description',
  DescriptionHeader: 'private_listings.title',
  SuburbId: 'sellerCanonicalFacts.property24Import.suburbId',
  StreetNumber: 'private_listings.street_number',
  StreetName: 'private_listings.street_name',
  SourceReference: 'private_listings.listing_reference',
  Longitude: 'private_listings.longitude',
  Latitude: 'private_listings.latitude',
  ErfSize: 'listing_publication_data.erf_size',
  FloorArea: 'listing_publication_data.floor_size',
  PropertyTypeId: 'sellerCanonicalFacts.property24Import.propertyTypeId',
  Bedrooms: 'listing_publication_data.bedrooms',
  Bathrooms: 'listing_publication_data.bathrooms',
  Garages: 'listing_publication_data.garages',
  NumberOfParkingSpaces: 'listing_publication_data.parking_bays',
  MunicipalRatesAndTaxes: 'listing_publication_data.rates_taxes',
  MonthlyLevy: 'listing_publication_data.levies',
  Garden: 'listing_publication_data.features',
  Pool: 'listing_publication_data.features',
  Flatlet: 'listing_publication_data.features',
  PetsAllowed: 'sellerCanonicalFacts.property24Import.propertyFeatures.petsAllowed',
  Furnished: 'sellerCanonicalFacts.rentalInfo.furnishedStatus',
  DepositRequirementsComments: 'sellerCanonicalFacts.rentalInfo.depositRequirement',
  LeasePeriod: 'sellerCanonicalFacts.rentalInfo.leasePeriodMonths',
  RentalRate: 'sellerCanonicalFacts.rentalInfo.rentalRate',
})

const DIRECT_IMAGE_FIELD_MAP = Object.freeze({
  ListingNumber: 'mediaPlan.privateListingKey',
  Caption: 'mediaPlan.images.caption',
  Ordinal: 'mediaPlan.images.sortOrder',
  Prop24ImageUrl: 'mediaPlan.images.sourceUrl',
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function normalizeTaxonomyValue(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function value(row, field) {
  return pickImportValue(row, [field])
}

function compactObject(source = {}) {
  return Object.fromEntries(Object.entries(source).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ''))
}

function sourceSnapshot(row = {}) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== '__rowNumber'))
}

function toNumber(input) {
  const text = normalizeText(input)
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function toInteger(input) {
  const number = toNumber(input)
  return Number.isSafeInteger(number) ? number : null
}

function toBoolean(input) {
  const key = normalizeKey(input)
  if (['1', 'true', 'yes'].includes(key)) return true
  if (['0', 'false', 'no'].includes(key)) return false
  return null
}

function toDateOnly(input) {
  const text = normalizeText(input)
  if (!text) return null
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || null
}

function parseLeasePeriodMonths(input) {
  const match = normalizeText(input).match(/\d+/)
  const number = match ? Number(match[0]) : null
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function extractRandAmount(input) {
  const match = normalizeText(input).match(/\bR\s*([\d\s,]+(?:\.\d{1,2})?)/i)
  if (!match) return null
  const number = Number(match[1].replace(/[\s,]/g, ''))
  return Number.isFinite(number) && number >= 0 ? number : null
}

function normalizePhone(input) {
  return normalizeText(input).replace(/[^0-9+]+/g, '')
}

function stableValue(input) {
  if (Array.isArray(input)) return input.map(stableValue)
  if (!input || typeof input !== 'object') return input
  return Object.fromEntries(Object.keys(input).sort().map((key) => [key, stableValue(input[key])]))
}

function fingerprint(input) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(input))).digest('hex')
}

function isUuid(input) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(input))
}

function createResolution({ code, entityType, externalId, field = '', message }) {
  return {
    code,
    entityType,
    externalId: externalId ?? null,
    field: field || null,
    message,
  }
}

function groupBy(items = [], keyFn) {
  const groups = new Map()
  for (const item of items) {
    const key = keyFn(item)
    if (!key) continue
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return groups
}

function normalizeExistingMapping(mapping = {}) {
  return {
    property24AgentId: normalizeText(mapping.property24_agent_id || mapping.property24AgentId),
    arch9UserId: normalizeText(mapping.arch9_user_id || mapping.arch9UserId || mapping.user_id || mapping.userId),
    sourceReference: normalizeText(mapping.source_reference || mapping.sourceReference),
    status: normalizeKey(mapping.status || 'active'),
  }
}

function buildAgentPlans(rows, { organisationId, environment, arch9Agents = [], existingAgentMappings = [] } = {}) {
  const resolutions = []
  const candidates = arch9Agents
    .map(normalizeArch9AgentCandidate)
    .filter((candidate) => candidate.status !== 'inactive' && (!organisationId || !candidate.organisationId || candidate.organisationId === organisationId))
  const mappings = existingAgentMappings.map(normalizeExistingMapping).filter((mapping) => mapping.status !== 'inactive')
  const candidatesBySource = groupBy(candidates, (candidate) => normalizeKey(candidate.sourceReference))
  const candidatesByEmail = groupBy(candidates, (candidate) => normalizeKey(candidate.email))
  const mappingByExternalId = groupBy(mappings, (mapping) => mapping.property24AgentId)

  const plans = rows.map((row) => {
    const property24 = normalizeProperty24Agent(row)
    const property24AgentId = Number(property24.property24AgentId)
    const firstName = property24.firstName || value(row, 'Firstname') || null
    const lastName = property24.lastName || value(row, 'Lastname') || null
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || null
    const explicit = mappingByExternalId.get(String(property24AgentId)) || []
    const sourceMatches = property24.sourceReference
      ? candidatesBySource.get(normalizeKey(property24.sourceReference)) || []
      : []
    const emailMatches = property24.email ? candidatesByEmail.get(normalizeKey(property24.email)) || [] : []
    let arch9UserId = ''
    let matchType = 'manual'
    let confidence = 0
    let resolutionStatus = 'create_or_invite'

    if (explicit.length === 1 && isUuid(explicit[0].arch9UserId)) {
      arch9UserId = explicit[0].arch9UserId
      matchType = 'explicit'
      confidence = 1
      resolutionStatus = 'mapped'
    } else if (sourceMatches.length === 1 && isUuid(sourceMatches[0].userId || sourceMatches[0].profileId)) {
      arch9UserId = sourceMatches[0].userId || sourceMatches[0].profileId
      matchType = 'source_reference'
      confidence = 0.98
      resolutionStatus = 'mapped'
    } else if (emailMatches.length === 1 && isUuid(emailMatches[0].userId || emailMatches[0].profileId)) {
      arch9UserId = emailMatches[0].userId || emailMatches[0].profileId
      matchType = 'email'
      confidence = 0.94
      resolutionStatus = 'mapped'
    } else {
      const ambiguousCount = Math.max(explicit.length, sourceMatches.length, emailMatches.length)
      resolutionStatus = ambiguousCount > 1 ? 'needs_review' : 'create_or_invite'
      resolutions.push(createResolution({
        code: ambiguousCount > 1 ? 'ambiguous_arch9_agent_match' : 'arch9_agent_resolution_required',
        entityType: 'agent',
        externalId: property24AgentId,
        field: 'arch9_user_id',
        message: ambiguousCount > 1
          ? `Property24 agent ${property24AgentId} matches multiple Arch9 agents.`
          : `Property24 agent ${property24AgentId} must be linked to an existing or newly invited Arch9 user before apply.`,
      }))
    }

    const status = ACTIVE_AGENT_STATUSES.has(normalizeKey(property24.status)) ? 'active' : 'inactive'
    const snapshot = sourceSnapshot(row)
    const agentDraft = {
      firstName,
      lastName,
      fullName: property24.fullName || fullName,
      email: property24.email || null,
      mobile: property24.mobile || null,
      property24CountryId: toInteger(value(row, 'CountryId')),
      qualification: value(row, 'Qualification') || null,
      about: value(row, 'About') || null,
      profilePictureSourceUrl: value(row, 'Property24ProfilePictureURL') || null,
      published: toBoolean(value(row, 'Published')),
      receiveStatsMail: toBoolean(value(row, 'ReceiveStatsMail')),
      receiveGroupListingEmail: toBoolean(value(row, 'ReceiveGroupListingEmail')),
      sourceSnapshot: snapshot,
    }
    const mappingRow = {
      organisation_id: organisationId || null,
      environment,
      agency_id: Number(property24.agencyId),
      arch9_user_id: arch9UserId || null,
      property24_agent_id: property24AgentId,
      source_reference: property24.sourceReference,
      email_snapshot: property24.email || null,
      first_name_snapshot: firstName,
      last_name_snapshot: lastName,
      mobile_snapshot: normalizePhone(property24.mobile) || null,
      match_type: matchType,
      confidence,
      status,
    }
    const identityKey = `property24:${environment}:${mappingRow.agency_id}:agent:${property24AgentId}`
    return {
      identityKey,
      property24AgentId,
      sourceReference: property24.sourceReference,
      resolutionStatus,
      arch9UserId: arch9UserId || null,
      targetTable: 'property24_agent_mappings',
      agentDraft,
      mappingRow,
      mappingFingerprint: fingerprint({ identityKey, agentDraft, mappingRow }),
    }
  })
  return { plans, resolutions }
}

function normalizeCatalog(catalog = {}) {
  const propertyTypes = Array.isArray(catalog.propertyTypes) ? catalog.propertyTypes : []
  const suburbs = Array.isArray(catalog.suburbs) ? catalog.suburbs : []
  return {
    propertyTypesById: groupBy(propertyTypes, (entry) => normalizeText(entry.property24Id || entry.property24_id || entry.id)),
    suburbsById: groupBy(suburbs, (entry) => normalizeText(entry.property24Id || entry.property24_id || entry.id)),
  }
}

function resolvePropertyType(propertyTypeId, catalog, resolutions, listingNumber) {
  const matches = catalog.propertyTypesById.get(String(propertyTypeId)) || []
  if (matches.length !== 1) {
    resolutions.push(createResolution({
      code: matches.length > 1 ? 'ambiguous_property_type_catalog_mapping' : 'property_type_catalog_mapping_required',
      entityType: 'listing',
      externalId: listingNumber,
      field: 'PropertyTypeId',
      message: `Property24 property type ${propertyTypeId} needs one Arch9 property-type mapping.`,
    }))
    return { propertyType: null, propertyTypeLabel: null, propertyCategory: 'residential' }
  }
  const match = matches[0]
  const propertyType = normalizeTaxonomyValue(match.arch9PropertyType || match.arch9_property_type || match.name)
  const allTypes = Object.values(PROPERTY_TYPES_BY_CATEGORY).flat()
  const safePropertyType = allTypes.includes(propertyType) ? propertyType : null
  if (!safePropertyType) {
    resolutions.push(createResolution({
      code: 'unsupported_arch9_property_type',
      entityType: 'listing',
      externalId: listingNumber,
      field: 'PropertyTypeId',
      message: `Catalog mapping for Property24 property type ${propertyTypeId} does not resolve to a supported Arch9 property type.`,
    }))
  }
  return {
    propertyType: safePropertyType,
    propertyTypeLabel: normalizeText(match.name) || safePropertyType,
    propertyCategory: normalizePropertyCategory(match.propertyCategory || match.property_category || safePropertyType, { fallback: 'residential' }),
  }
}

function resolveSuburb(suburbId, catalog, resolutions, listingNumber) {
  const matches = catalog.suburbsById.get(String(suburbId)) || []
  if (matches.length !== 1) {
    resolutions.push(createResolution({
      code: matches.length > 1 ? 'ambiguous_suburb_catalog_mapping' : 'suburb_catalog_mapping_required',
      entityType: 'listing',
      externalId: listingNumber,
      field: 'SuburbId',
      message: `Property24 suburb ${suburbId} needs one Arch9 location mapping.`,
    }))
    return { suburb: null, city: null, province: null, country: 'South Africa', latitude: null, longitude: null }
  }
  const match = matches[0]
  return {
    suburb: normalizeText(match.name || match.suburb) || null,
    city: normalizeText(match.cityName || match.city) || null,
    province: normalizeText(match.provinceName || match.province) || null,
    country: normalizeText(match.countryName || match.country) || 'South Africa',
    latitude: toNumber(match.latitude ?? match.geoPoint?.latitude),
    longitude: toNumber(match.longitude ?? match.geoPoint?.longitude),
  }
}

export function mapProperty24ListingStatus(sourceStatus, listingType = 'Sale', listingVisibility = 'Public') {
  const status = normalizeKey(sourceStatus)
  const isRental = normalizeKey(listingType) === 'rental'
  const isPublic = normalizeKey(listingVisibility) === 'public'
  if (ACTIVE_LISTING_STATUSES.has(status)) {
    return {
      semanticStatus: status,
      listingStatus: 'active',
      listingVisibility: isPublic ? 'active_market' : 'internal',
      isActive: true,
      property24Status: 'published',
      publicationStatus: 'Published',
      syncExternalStatus: 'on_portal',
      isOnPortal: true,
      mandateStatus: 'signed_external_pending_upload',
      mappingNote: null,
    }
  }
  if (status === 'pending') {
    return {
      semanticStatus: status,
      listingStatus: 'listing_review',
      listingVisibility: 'internal',
      isActive: false,
      property24Status: 'paused',
      publicationStatus: 'Draft',
      syncExternalStatus: 'paused',
      isOnPortal: false,
      mandateStatus: 'not_started',
      mappingNote: null,
    }
  }
  if (status === 'sold') {
    return {
      semanticStatus: status,
      listingStatus: 'sold',
      listingVisibility: 'archived',
      isActive: false,
      property24Status: 'removed',
      publicationStatus: 'Archived',
      syncExternalStatus: 'removed',
      isOnPortal: false,
      mandateStatus: 'signed_external_pending_upload',
      mappingNote: null,
    }
  }
  if (status === 'rented') {
    return {
      semanticStatus: status,
      listingStatus: 'withdrawn',
      listingVisibility: 'archived',
      isActive: false,
      property24Status: 'removed',
      publicationStatus: 'Archived',
      syncExternalStatus: 'removed',
      isOnPortal: false,
      mandateStatus: 'not_started',
      mappingNote: isRental ? 'Arch9 preserves Rented as the rental semantic status and uses the closed shared-listing fallback withdrawn.' : 'Unexpected Rented status on a sale listing.',
    }
  }
  if (CLOSED_LISTING_STATUSES.has(status)) {
    return {
      semanticStatus: status,
      listingStatus: 'withdrawn',
      listingVisibility: 'archived',
      isActive: false,
      property24Status: 'removed',
      publicationStatus: 'Archived',
      syncExternalStatus: 'removed',
      isOnPortal: false,
      mandateStatus: 'not_started',
      mappingNote: null,
    }
  }
  return {
    semanticStatus: status || 'unknown',
    listingStatus: 'listing_review',
    listingVisibility: 'internal',
    isActive: false,
    property24Status: 'draft',
    publicationStatus: 'Draft',
    syncExternalStatus: 'paused',
    isOnPortal: false,
    mandateStatus: 'not_started',
    mappingNote: 'Unknown Property24 status mapped conservatively to Arch9 listing review.',
  }
}

function buildAddress(row, location) {
  const streetNumber = value(row, 'StreetNumber')
  const streetName = value(row, 'StreetName')
  const streetAddress = [streetNumber, streetName].filter(Boolean).join(' ').trim() || null
  const addressLine2 = [value(row, 'ComplexUnitNumber'), value(row, 'StandNumber')].filter(Boolean).join(' / ') || null
  const formattedAddress = [streetAddress, location.suburb, location.city, location.province].filter(Boolean).join(', ') || null
  return { streetNumber: streetNumber || null, streetName: streetName || null, streetAddress, addressLine2, formattedAddress }
}

function buildFeatureSnapshot(row) {
  return {
    bedrooms: toNumber(value(row, 'Bedrooms')),
    bedroomsDescription: value(row, 'BedroomsDescription') || null,
    bathrooms: toNumber(value(row, 'Bathrooms')),
    bathroomsDescription: value(row, 'BathroomsDescription') || null,
    garages: toNumber(value(row, 'Garages')),
    garagesDescription: value(row, 'GaragesDescription') || null,
    receptionRooms: toNumber(value(row, 'ReceptionRooms')),
    studies: toNumber(value(row, 'Studies')),
    kitchens: toNumber(value(row, 'Kitchens')),
    secureParkings: toNumber(value(row, 'SecureParkings')),
    parkingSpaces: toNumber(value(row, 'NumberOfParkingSpaces')),
    domesticRooms: toNumber(value(row, 'DomesticRooms')),
    domesticBathrooms: toNumber(value(row, 'DomesticBathrooms')),
    outsideToilets: toNumber(value(row, 'OutsideToilets')),
    garden: toBoolean(value(row, 'Garden')),
    pool: toBoolean(value(row, 'Pool')),
    poolDescription: value(row, 'PoolDescription') || null,
    flatlet: toBoolean(value(row, 'Flatlet')),
    flatDescription: value(row, 'FlatDescription') || null,
    petsAllowed: value(row, 'PetsAllowed') || null,
    furnishedStatus: value(row, 'Furnished') || null,
  }
}

function featureLabels(features) {
  return [
    features.garden ? 'Garden' : null,
    features.pool ? 'Pool' : null,
    features.flatlet ? 'Flatlet' : null,
    normalizeKey(features.petsAllowed) === 'yes' ? 'Pets allowed' : null,
    normalizeKey(features.furnishedStatus) === 'yes' ? 'Furnished' : null,
  ].filter(Boolean)
}

function buildRentalInfo(row, listingType, sourceStatus) {
  if (normalizeKey(listingType) !== 'rental') return null
  const depositRequirement = value(row, 'DepositRequirementsComments') || null
  return {
    status: normalizeKey(sourceStatus),
    monthlyRent: toNumber(value(row, 'Price')),
    rentalRate: value(row, 'RentalRate') || null,
    availableFrom: toDateOnly(value(row, 'OccupationDate')),
    occupationDate: toDateOnly(value(row, 'OccupationDate')),
    expiryDate: toDateOnly(value(row, 'ExpiryDate')),
    depositAmount: extractRandAmount(depositRequirement),
    depositRequirement,
    leasePeriodMonths: parseLeasePeriodMonths(value(row, 'LeasePeriod')),
    furnishedStatus: value(row, 'Furnished') || null,
    petsAllowed: value(row, 'PetsAllowed') || null,
  }
}

function buildImagePlans(rows) {
  const grouped = groupBy(rows, (row) => value(row, 'ListingNumber'))
  return grouped
}

function buildListingPlans(rows, {
  organisationId,
  environment,
  catalog,
  agentPlans,
  imageRows,
} = {}) {
  const resolutions = []
  const plans = []
  const agentsById = new Map(agentPlans.map((plan) => [String(plan.property24AgentId), plan]))
  const imagesByListing = buildImagePlans(imageRows)

  for (const row of rows) {
    const listingNumber = toInteger(value(row, 'ListingNumber'))
    const listingType = value(row, 'ListingType')
    const sourceStatus = value(row, 'Status')
    const sourceReference = resolveProperty24ListingSourceReference({
      agencyId: value(row, 'AgencyId'),
      listingNumber,
      sourceReference: value(row, 'SourceReference'),
    })
    const contacts = parseProperty24ContactAgentIds(value(row, 'ContactAgentIds')).ids
    const agentRelationships = contacts.map((property24AgentId) => {
      const agentPlan = agentsById.get(String(property24AgentId)) || null
      return {
        property24AgentId,
        agentIdentityKey: agentPlan?.identityKey || null,
        sourceReference: agentPlan?.sourceReference || null,
        arch9UserId: agentPlan?.arch9UserId || null,
        resolutionStatus: agentPlan?.resolutionStatus || 'missing',
      }
    })
    const primaryAgent = agentRelationships[0] || null
    if (contacts.length > 1) {
      resolutions.push(createResolution({
        code: 'multiple_contact_agents_primary_selected',
        entityType: 'listing',
        externalId: listingNumber,
        field: 'ContactAgentIds',
        message: `Listing ${listingNumber} has multiple contact agents; the first is selected as Arch9 primary while all relationships are preserved.`,
      }))
    }

    const propertyTypeId = toInteger(value(row, 'PropertyTypeId'))
    const suburbId = toInteger(value(row, 'SuburbId'))
    const propertyType = resolvePropertyType(propertyTypeId, catalog, resolutions, listingNumber)
    const location = resolveSuburb(suburbId, catalog, resolutions, listingNumber)
    const status = mapProperty24ListingStatus(sourceStatus, listingType, value(row, 'ListingVisibility'))
    const address = buildAddress(row, location)
    const features = buildFeatureSnapshot(row)
    const rentalInfo = buildRentalInfo(row, listingType, sourceStatus)
    const rawSource = sourceSnapshot(row)
    const migrationMetadata = {
      quickAddIntent: 'imported_existing_listing',
      source: 'property24_import',
      property24AgencyId: toInteger(value(row, 'AgencyId')),
      property24ListingNumber: listingNumber,
      property24SourceReference: sourceReference,
      property24Status: sourceStatus,
      property24SemanticStatus: status.semanticStatus,
    }
    const internalListingNotes = `BRIDGE_QUICK_ADD_METADATA: ${JSON.stringify(migrationMetadata)}`
    const privateListing = {
      organisationId: organisationId || null,
      branchId: null,
      assignedAgentId: primaryAgent?.arch9UserId || null,
      assignedAgentSourceReference: primaryAgent?.sourceReference || null,
      listingReference: sourceReference,
      listingStatus: status.listingStatus,
      listingVisibility: status.listingVisibility,
      propertyCategory: propertyType.propertyCategory,
      listingSource: 'imported_stock',
      propertyStructureType: 'other',
      propertyType: propertyType.propertyType,
      listingCategory: normalizeKey(listingType) === 'rental' ? 'rental' : 'private_sale',
      title: value(row, 'DescriptionHeader'),
      description: value(row, 'Description'),
      askingPrice: toNumber(value(row, 'Price')),
      addressLine1: address.streetAddress,
      addressLine2: address.addressLine2,
      formattedAddress: address.formattedAddress,
      streetNumber: address.streetNumber,
      streetName: address.streetName,
      streetAddress: address.streetAddress,
      suburb: location.suburb,
      city: location.city,
      province: location.province,
      country: location.country,
      latitude: toNumber(value(row, 'Latitude')) ?? location.latitude,
      longitude: toNumber(value(row, 'Longitude')) ?? location.longitude,
      mandateStatus: status.mandateStatus,
      sellerOnboardingStatus: 'not_started',
      isActive: status.isActive,
      property24Reference: String(listingNumber),
      property24Status: status.property24Status,
      internalListingNotes,
      sellerCanonicalFacts: compactObject({
        rentalInfo,
        property24Import: {
          agencyId: toInteger(value(row, 'AgencyId')),
          listingNumber,
          sourceReference,
          listingType,
          sourceStatus,
          semanticStatus: status.semanticStatus,
          expiryDate: toDateOnly(value(row, 'ExpiryDate')),
          suburbId,
          propertyTypeId,
          propertyTypeLabel: propertyType.propertyTypeLabel,
          floorAreaUnit: value(row, 'FloorAreaAreaUnit') || null,
          erfAreaUnit: value(row, 'ErfAreaUnit') || null,
          propertyFeatures: features,
          contactAgentIds: contacts,
          raw: rawSource,
        },
      }),
    }
    const publicationData = {
      title: value(row, 'DescriptionHeader'),
      address: address.formattedAddress || address.streetAddress,
      suburb: location.suburb,
      province: location.province,
      propertyType: propertyType.propertyType,
      listingType: normalizeKey(listingType) === 'rental' ? 'Rental' : 'Sale',
      askingPrice: toNumber(value(row, 'Price')),
      bedrooms: features.bedrooms,
      bathrooms: features.bathrooms,
      garages: features.garages,
      parkingBays: features.parkingSpaces,
      floorSize: toNumber(value(row, 'FloorArea')),
      erfSize: toNumber(value(row, 'ErfSize')),
      ratesTaxes: toNumber(value(row, 'MunicipalRatesAndTaxes')),
      levies: toNumber(value(row, 'MonthlyLevy')),
      description: value(row, 'Description'),
      features: featureLabels(features),
      amenities: [],
      status: status.publicationStatus,
    }
    const sourceImages = (imagesByListing.get(String(listingNumber)) || [])
      .map((imageRow) => ({
        property24ListingNumber: listingNumber,
        sourceUrl: value(imageRow, 'Prop24ImageUrl'),
        caption: value(imageRow, 'Caption') || null,
        sourceOrdinal: toInteger(value(imageRow, 'Ordinal')),
      }))
      .sort((left, right) => left.sourceOrdinal - right.sourceOrdinal)
      .map((image, index) => ({ ...image, sortOrder: index, isCover: index === 0 }))
    const property24Sync = {
      privateListingKey: sourceReference,
      environment,
      agency_id: toInteger(value(row, 'AgencyId')),
      listing_number: listingNumber,
      external_status: status.syncExternalStatus,
      is_on_portal: status.isOnPortal,
      source_status: sourceStatus,
    }
    const identityKey = `property24:${environment}:${property24Sync.agency_id}:listing:${listingNumber}`
    const mappingPayload = {
      privateListing,
      publicationData,
      mediaPlan: {
        targetTable: 'listing_media',
        phase: 'image_import_pending',
        images: sourceImages,
      },
      property24Sync,
      agentRelationships,
    }
    plans.push({
      identityKey,
      listingNumber,
      sourceReference,
      sourceStatus,
      semanticStatus: status.semanticStatus,
      mappingNote: status.mappingNote,
      targetTables: ['private_listings', 'listing_publication_data', 'property24_listing_syncs', 'listing_media'],
      ...mappingPayload,
      mappingFingerprint: fingerprint({ identityKey, ...mappingPayload }),
    })
  }

  return { plans, resolutions }
}

function createFieldCoverage(headers = [], directMap = {}, fallbackTarget) {
  const fields = headers.map((sourceField) => ({
    sourceField,
    target: directMap[sourceField] || `${fallbackTarget}.${sourceField}`,
    mode: directMap[sourceField] ? 'direct' : 'preserved',
  }))
  return {
    sourceFieldCount: fields.length,
    directMappedCount: fields.filter((field) => field.mode === 'direct').length,
    preservedOnlyCount: fields.filter((field) => field.mode === 'preserved').length,
    fields,
  }
}

export function createProperty24MigrationMappingPlan({
  agents: agentsSource = {},
  listings: listingsSource = {},
  images: imagesSource = {},
  expectedAgencyId = null,
  organisationId = '',
  environment = 'exdev',
  arch9Agents = [],
  existingAgentMappings = [],
  catalog = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const validation = createProperty24MigrationDryRun({
    agents: agentsSource,
    listings: listingsSource,
    images: imagesSource,
    expectedAgencyId,
    generatedAt,
  })
  const normalizedEnvironment = normalizeKey(environment)
  const errors = []
  const contextResolutions = []
  if (!['exdev', 'production'].includes(normalizedEnvironment)) errors.push('Environment must be exdev or production.')
  if (organisationId && !isUuid(organisationId)) errors.push('Organisation ID must be a valid UUID.')
  if (!organisationId) {
    contextResolutions.push(createResolution({
      code: 'organisation_id_required_before_apply',
      entityType: 'import',
      externalId: expectedAgencyId,
      field: 'organisation_id',
      message: 'Resolve the Property24 agency to an Arch9 organisation UUID before apply.',
    }))
  }

  if (validation.status === 'BLOCKED' || errors.length) {
    return {
      version: PROPERTY24_MIGRATION_MAPPING_VERSION,
      phase: 'property24-migration-import-phase2-data-mapping',
      mode: 'mapping-plan',
      status: 'BLOCKED',
      generatedAt,
      safety: {
        property24WritesPerformed: false,
        databaseWritesPerformed: false,
        imageDownloadsPerformed: false,
        reportFileOnly: true,
      },
      validation,
      errors,
      resolutionQueue: contextResolutions,
      agentPlans: [],
      listingPlans: [],
    }
  }

  const agentRows = parseProperty24MigrationSourceRows('agents', agentsSource)
  const listingRows = parseProperty24MigrationSourceRows('listings', listingsSource)
  const imageRows = parseProperty24MigrationSourceRows('images', imagesSource)
  const normalizedCatalog = normalizeCatalog(catalog)
  const agentMapping = buildAgentPlans(agentRows, {
    organisationId,
    environment: normalizedEnvironment,
    arch9Agents,
    existingAgentMappings,
  })
  const listingMapping = buildListingPlans(listingRows, {
    organisationId,
    environment: normalizedEnvironment,
    catalog: normalizedCatalog,
    agentPlans: agentMapping.plans,
    imageRows,
  })
  const resolutionQueue = [...contextResolutions, ...agentMapping.resolutions, ...listingMapping.resolutions]
  const mappedListingAgentRelationships = listingMapping.plans.flatMap((plan) => plan.agentRelationships)
  const status = resolutionQueue.length ? 'READY_WITH_RESOLUTION_REQUIRED' : 'READY'
  return {
    version: PROPERTY24_MIGRATION_MAPPING_VERSION,
    phase: 'property24-migration-import-phase2-data-mapping',
    mode: 'mapping-plan',
    status,
    generatedAt,
    safety: {
      property24WritesPerformed: false,
      databaseWritesPerformed: false,
      imageDownloadsPerformed: false,
      reportFileOnly: true,
    },
    context: {
      organisationId: organisationId || null,
      environment: normalizedEnvironment,
      agencyId: validation.agency.resolvedAgencyId,
    },
    validation: {
      status: validation.status,
      summary: validation.summary,
      inputHashes: Object.fromEntries(Object.entries(validation.inputs).map(([role, input]) => [role, input.sha256])),
    },
    summary: {
      agentPlanCount: agentMapping.plans.length,
      mappedArch9AgentCount: agentMapping.plans.filter((plan) => plan.resolutionStatus === 'mapped').length,
      agentResolutionRequiredCount: agentMapping.plans.filter((plan) => plan.resolutionStatus !== 'mapped').length,
      listingPlanCount: listingMapping.plans.length,
      saleListingCount: listingMapping.plans.filter((plan) => normalizeKey(plan.publicationData.listingType) === 'sale').length,
      rentalListingCount: listingMapping.plans.filter((plan) => normalizeKey(plan.publicationData.listingType) === 'rental').length,
      imageRelationshipCount: listingMapping.plans.reduce((count, plan) => count + plan.mediaPlan.images.length, 0),
      propertyTypeResolvedCount: listingMapping.plans.filter((plan) => Boolean(plan.privateListing.propertyType)).length,
      suburbResolvedCount: listingMapping.plans.filter((plan) => Boolean(plan.privateListing.suburb)).length,
      externalAgentRelationshipCount: mappedListingAgentRelationships.length,
      arch9AgentRelationshipCount: mappedListingAgentRelationships.filter((relationship) => Boolean(relationship.arch9UserId)).length,
      resolutionRequiredCount: resolutionQueue.length,
      errorCount: 0,
    },
    fieldCoverage: {
      agents: createFieldCoverage(validation.inputs.agents.headers, DIRECT_AGENT_FIELD_MAP, 'agentDraft.sourceSnapshot'),
      listings: createFieldCoverage(validation.inputs.listings.headers, DIRECT_LISTING_FIELD_MAP, 'sellerCanonicalFacts.property24Import.raw'),
      images: createFieldCoverage(validation.inputs.images.headers, DIRECT_IMAGE_FIELD_MAP, 'mediaPlan.images.sourceSnapshot'),
    },
    relationships: listingMapping.plans.map((plan) => ({
      listingNumber: plan.listingNumber,
      listingIdentityKey: plan.identityKey,
      contactAgents: plan.agentRelationships,
      imageCount: plan.mediaPlan.images.length,
    })),
    resolutionQueue,
    agentPlans: agentMapping.plans,
    listingPlans: listingMapping.plans,
    nextPhase: resolutionQueue.length
      ? 'Resolve the queued organisation, agent, or catalog identities before applying this mapping plan.'
      : 'Mapping is complete. Proceed to image download/rehosting without writing listing records yet.',
  }
}
