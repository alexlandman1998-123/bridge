import { normalizeProperty24Text, summarizeProperty24Payload } from './client.js'

const AGENT_ROLE_ALIASES = new Set([
  'agent',
  'estate_agent',
  'sales_agent',
  'principal',
  'agency_principal',
  'owner',
  'branch_manager',
  'manager',
])

function normalizeLower(value = '') {
  return normalizeProperty24Text(value).toLowerCase()
}

function normalizeEmail(value = '') {
  return normalizeLower(value)
}

function normalizePhone(value = '') {
  return normalizeProperty24Text(value).replace(/[^0-9+]+/g, '')
}

function normalizeNamePart(value = '') {
  return normalizeProperty24Text(value).replace(/\s+/g, ' ')
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== ''))
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.agents)) return value.agents
  if (Array.isArray(value?.data)) return value.data
  return []
}

function getProperty24RecordId(record = {}, keys = []) {
  for (const key of keys) {
    const value = record?.[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}

export function normalizeProperty24Agent(agent = {}) {
  const firstName = normalizeNamePart(agent.firstname || agent.firstName || agent.FirstName)
  const lastName = normalizeNamePart(agent.lastname || agent.lastName || agent.LastName)
  const email = normalizeEmail(agent.emailAddress || agent.email || agent.EmailAddress || agent.Email)
  const sourceReference = normalizeProperty24Text(agent.sourceReference || agent.SourceReference)
  return compactObject({
    property24AgentId: getProperty24RecordId(agent, ['property24AgentId', 'property24_agent_id', 'agentId', 'id', 'AgentId', 'Id']),
    agencyId: getProperty24RecordId(agent, ['agencyId', 'AgencyId']),
    sourceReference,
    firstName,
    lastName,
    fullName: normalizeNamePart(`${firstName} ${lastName}`),
    email,
    mobile: normalizePhone(agent.mobileNumber || agent.mobile || agent.phoneNumber || agent.MobileNumber || agent.Mobile),
    status: normalizeProperty24Text(agent.status || agent.Status),
    published: agent.published ?? agent.Published ?? null,
    raw: agent,
  })
}

export function normalizeArch9AgentCandidate(agent = {}) {
  const firstName = normalizeNamePart(agent.first_name || agent.firstName)
  const lastName = normalizeNamePart(agent.last_name || agent.lastName)
  const fullName = normalizeNamePart(agent.full_name || agent.fullName || `${firstName} ${lastName}`)
  const role = normalizeLower(agent.role || agent.workspace_role || agent.workspaceRole || agent.organisation_role || agent.organisationRole)
  return compactObject({
    userId: normalizeProperty24Text(agent.user_id || agent.userId || agent.id),
    profileId: normalizeProperty24Text(agent.profile_id || agent.profileId || agent.user_id || agent.userId || agent.id),
    organisationId: normalizeProperty24Text(agent.organisation_id || agent.organisationId),
    firstName: firstName || normalizeNamePart(fullName.split(' ')[0]),
    lastName: lastName || normalizeNamePart(fullName.split(' ').slice(1).join(' ')),
    fullName,
    email: normalizeEmail(agent.email),
    mobile: normalizePhone(agent.phone_number || agent.phoneNumber || agent.mobile),
    role,
    status: normalizeLower(agent.status || 'active') || 'active',
    sourceReference: normalizeProperty24Text(agent.property24_source_reference || agent.property24SourceReference || agent.sourceReference),
    raw: agent,
  })
}

export function isArch9AgentRole(role = '') {
  return AGENT_ROLE_ALIASES.has(normalizeLower(role))
}

export function createSuggestedAgentSourceReference(agent = {}, prefix = 'ARCH9') {
  const id = normalizeProperty24Text(agent.userId || agent.profileId || agent.id)
  const email = normalizeEmail(agent.email)
  const stableValue = id || email || normalizeLower(agent.fullName).replace(/[^a-z0-9]+/g, '-')
  return `${normalizeProperty24Text(prefix) || 'ARCH9'}-${stableValue}`.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80)
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

function normalizeExistingAgentMapping(mapping = {}) {
  return compactObject({
    userId: normalizeProperty24Text(mapping.user_id || mapping.userId || mapping.arch9_user_id || mapping.arch9UserId),
    profileId: normalizeProperty24Text(mapping.profile_id || mapping.profileId),
    property24AgentId: normalizeProperty24Text(mapping.property24_agent_id || mapping.property24AgentId),
    sourceReference: normalizeProperty24Text(mapping.source_reference || mapping.sourceReference),
    status: normalizeLower(mapping.status || 'active') || 'active',
  })
}

export function createProperty24AgentMappingPlan({
  arch9Agents = [],
  property24Agents = [],
  existingMappings = [],
  sourceReferencePrefix = 'ARCH9',
} = {}) {
  const localAgents = arch9Agents
    .map(normalizeArch9AgentCandidate)
    .filter((agent) => agent.status !== 'inactive' && (isArch9AgentRole(agent.role) || agent.email || agent.sourceReference))
  const externalAgents = property24Agents.map(normalizeProperty24Agent)
  const activeMappings = existingMappings.map(normalizeExistingAgentMapping).filter((mapping) => mapping.status !== 'inactive')

  const externalById = groupBy(externalAgents, (agent) => agent.property24AgentId)
  const externalByEmail = groupBy(externalAgents, (agent) => agent.email)
  const externalBySourceReference = groupBy(externalAgents, (agent) => normalizeLower(agent.sourceReference))
  const mappingByLocalId = groupBy(activeMappings, (mapping) => mapping.userId || mapping.profileId)
  const matchedExternalIds = new Set()
  const mappings = []
  const needsReview = []

  for (const agent of localAgents) {
    const localId = agent.userId || agent.profileId
    const explicit = mappingByLocalId.get(localId)?.[0]
    const explicitMatches = explicit?.property24AgentId ? externalById.get(explicit.property24AgentId) || [] : []
    const sourceMatches = agent.sourceReference ? externalBySourceReference.get(normalizeLower(agent.sourceReference)) || [] : []
    const emailMatches = agent.email ? externalByEmail.get(agent.email) || [] : []

    let matchType = ''
    let matches = []
    if (explicitMatches.length === 1) {
      matchType = 'explicit'
      matches = explicitMatches
    } else if (sourceMatches.length === 1) {
      matchType = 'source_reference'
      matches = sourceMatches
    } else if (emailMatches.length === 1) {
      matchType = 'email'
      matches = emailMatches
    }

    if (matches.length === 1) {
      const property24Agent = matches[0]
      matchedExternalIds.add(property24Agent.property24AgentId)
      mappings.push({
        status: 'mapped',
        matchType,
        confidence: matchType === 'explicit' ? 1 : 0.94,
        arch9Agent: agent,
        property24Agent,
        sourceReference: property24Agent.sourceReference || agent.sourceReference || createSuggestedAgentSourceReference(agent, sourceReferencePrefix),
      })
      continue
    }

    const ambiguous = [
      ...new Set([
        ...explicitMatches,
        ...sourceMatches,
        ...emailMatches,
      ]),
    ]
    if (ambiguous.length > 1) {
      needsReview.push({
        status: 'needs_review',
        reason: 'ambiguous_property24_agent_match',
        arch9Agent: agent,
        candidates: ambiguous,
      })
      continue
    }

    needsReview.push({
      status: 'unmapped',
      reason: agent.email ? 'no_property24_agent_with_matching_email' : 'arch9_agent_missing_email',
      arch9Agent: agent,
      suggestedSourceReference: createSuggestedAgentSourceReference(agent, sourceReferencePrefix),
    })
  }

  const unmappedProperty24Agents = externalAgents.filter((agent) => !matchedExternalIds.has(agent.property24AgentId))

  return {
    summary: {
      arch9AgentCount: localAgents.length,
      property24AgentCount: externalAgents.length,
      mappedCount: mappings.length,
      needsReviewCount: needsReview.length,
      unmappedProperty24AgentCount: unmappedProperty24Agents.length,
      ready: needsReview.length === 0,
    },
    mappings,
    needsReview,
    unmappedProperty24Agents,
  }
}

function normalizeCatalogName(value = '') {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeProperty24CatalogRecord(record = {}, type = '') {
  return compactObject({
    type,
    id: getProperty24RecordId(record, ['id', 'Id', `${type}Id`]),
    name: normalizeProperty24Text(record.name || record.Name || record.description || record.Description),
    countryId: getProperty24RecordId(record, ['countryId', 'CountryId']),
    provinceId: getProperty24RecordId(record, ['provinceId', 'ProvinceId']),
    cityId: getProperty24RecordId(record, ['cityId', 'CityId']),
    provinceName: normalizeProperty24Text(record.provinceName || record.ProvinceName),
    cityName: normalizeProperty24Text(record.cityName || record.CityName),
    raw: record,
  })
}

export function createProperty24CatalogMappingPlan({
  localLocations = [],
  localPropertyTypes = [],
  property24Catalog = {},
} = {}) {
  const suburbs = asArray(property24Catalog.suburbs).map((record) => normalizeProperty24CatalogRecord(record, 'suburb'))
  const propertyTypes = asArray(property24Catalog.propertyTypes).map((record) => normalizeProperty24CatalogRecord(record, 'propertyType'))
  const suburbByComposite = groupBy(suburbs, (suburb) => [
    normalizeCatalogName(suburb.name),
    normalizeCatalogName(suburb.cityName),
    normalizeCatalogName(suburb.provinceName),
  ].join('|'))
  const suburbByName = groupBy(suburbs, (suburb) => normalizeCatalogName(suburb.name))
  const propertyTypeByName = groupBy(propertyTypes, (type) => normalizeCatalogName(type.name))

  const locationMappings = []
  const locationReview = []
  for (const location of localLocations) {
    const normalized = {
      sourceId: normalizeProperty24Text(location.id || location.sourceId),
      suburbName: normalizeProperty24Text(location.suburb || location.suburbName || location.name),
      cityName: normalizeProperty24Text(location.city || location.cityName),
      provinceName: normalizeProperty24Text(location.province || location.provinceName),
    }
    const compositeKey = [
      normalizeCatalogName(normalized.suburbName),
      normalizeCatalogName(normalized.cityName),
      normalizeCatalogName(normalized.provinceName),
    ].join('|')
    const exactMatches = suburbByComposite.get(compositeKey) || []
    const nameMatches = suburbByName.get(normalizeCatalogName(normalized.suburbName)) || []
    const matches = exactMatches.length ? exactMatches : nameMatches

    if (matches.length === 1) {
      locationMappings.push({
        status: 'mapped',
        matchType: exactMatches.length ? 'suburb_city_province' : 'suburb_name',
        confidence: exactMatches.length ? 0.98 : 0.72,
        localLocation: normalized,
        property24Suburb: matches[0],
      })
    } else {
      locationReview.push({
        status: 'needs_review',
        reason: matches.length > 1 ? 'ambiguous_suburb_match' : 'no_property24_suburb_match',
        localLocation: normalized,
        candidates: matches.slice(0, 10),
      })
    }
  }

  const propertyTypeMappings = []
  const propertyTypeReview = []
  for (const propertyType of localPropertyTypes) {
    const normalized = {
      sourceId: normalizeProperty24Text(propertyType.id || propertyType.sourceId || propertyType.key),
      name: normalizeProperty24Text(propertyType.name || propertyType.label || propertyType.type),
    }
    const matches = propertyTypeByName.get(normalizeCatalogName(normalized.name)) || []
    if (matches.length === 1) {
      propertyTypeMappings.push({
        status: 'mapped',
        matchType: 'property_type_name',
        confidence: 0.95,
        localPropertyType: normalized,
        property24PropertyType: matches[0],
      })
    } else {
      propertyTypeReview.push({
        status: 'needs_review',
        reason: matches.length > 1 ? 'ambiguous_property_type_match' : 'no_property24_property_type_match',
        localPropertyType: normalized,
        candidates: matches.slice(0, 10),
      })
    }
  }

  const needsReview = [...locationReview, ...propertyTypeReview]
  return {
    summary: {
      localLocationCount: localLocations.length,
      mappedLocationCount: locationMappings.length,
      localPropertyTypeCount: localPropertyTypes.length,
      mappedPropertyTypeCount: propertyTypeMappings.length,
      needsReviewCount: needsReview.length,
      ready: needsReview.length === 0,
    },
    locationMappings,
    propertyTypeMappings,
    needsReview,
  }
}

export async function fetchProperty24AgencyAgentSnapshot({ property24, agencyId } = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  if (!agencyId) throw new Error('agencyId is required.')
  const result = await property24.fetchAgencyAgents(agencyId)
  return {
    httpStatus: result.status,
    durationMs: result.durationMs,
    summary: summarizeProperty24Payload(result.data),
    agents: asArray(result.data).map(normalizeProperty24Agent),
  }
}

export async function fetchProperty24CatalogSnapshot({ property24, countryId, provinceId, cityId } = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  const [countries, propertyTypes, listingTypes] = await Promise.all([
    property24.fetchCountries(),
    countryId ? property24.fetchPropertyTypes(countryId) : Promise.resolve(null),
    countryId ? property24.fetchListingTypes(countryId) : Promise.resolve(null),
  ])

  const provinces = countryId ? await property24.fetchProvinces(countryId) : null
  const cities = provinceId ? await property24.fetchCities(provinceId) : null
  const suburbs = cityId ? await property24.fetchSuburbs(cityId) : null

  return {
    summary: {
      countries: asArray(countries?.data).length,
      provinces: asArray(provinces?.data).length,
      cities: asArray(cities?.data).length,
      suburbs: asArray(suburbs?.data).length,
      propertyTypes: asArray(propertyTypes?.data).length,
      listingTypes: asArray(listingTypes?.data).length,
    },
    countries: asArray(countries?.data).map((record) => normalizeProperty24CatalogRecord(record, 'country')),
    provinces: asArray(provinces?.data).map((record) => normalizeProperty24CatalogRecord(record, 'province')),
    cities: asArray(cities?.data).map((record) => normalizeProperty24CatalogRecord(record, 'city')),
    suburbs: asArray(suburbs?.data).map((record) => normalizeProperty24CatalogRecord(record, 'suburb')),
    propertyTypes: asArray(propertyTypes?.data).map((record) => normalizeProperty24CatalogRecord(record, 'propertyType')),
    listingTypes: asArray(listingTypes?.data).map((record) => normalizeProperty24CatalogRecord(record, 'listingType')),
  }
}

export async function fetchArch9AgentCandidates({ supabase, organisationId } = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  if (!organisationId) throw new Error('organisationId is required.')

  const [usersResult, profilesResult] = await Promise.all([
    supabase
      .from('organisation_users')
      .select('user_id, organisation_id, first_name, last_name, email, phone_number, role, workspace_role, organisation_role, status')
      .eq('organisation_id', organisationId)
      .eq('status', 'active'),
    supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, email, phone_number, role, status'),
  ])
  if (usersResult.error) throw usersResult.error
  if (profilesResult.error && profilesResult.error.code !== '42P01') throw profilesResult.error

  const profileById = new Map((profilesResult.data || []).map((profile) => [normalizeProperty24Text(profile.id), profile]))
  return (usersResult.data || [])
    .map((user) => {
      const profile = profileById.get(normalizeProperty24Text(user.user_id)) || {}
      return normalizeArch9AgentCandidate({
        ...profile,
        ...user,
        id: user.user_id,
        full_name: profile.full_name,
        phone_number: user.phone_number || profile.phone_number,
        email: user.email || profile.email,
      })
    })
    .filter((agent) => isArch9AgentRole(agent.role) || agent.email)
}

export async function createProperty24SynchronisationPreview({
  supabase,
  property24,
  organisationId,
  agencyId,
  countryId,
  provinceId,
  cityId,
  arch9Agents,
  existingMappings = [],
  localLocations = [],
  localPropertyTypes = [],
} = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  if (!agencyId) throw new Error('agencyId is required.')

  const [agentSnapshot, catalogSnapshot, resolvedArch9Agents] = await Promise.all([
    fetchProperty24AgencyAgentSnapshot({ property24, agencyId }),
    fetchProperty24CatalogSnapshot({ property24, countryId, provinceId, cityId }),
    arch9Agents ? Promise.resolve(arch9Agents.map(normalizeArch9AgentCandidate)) : fetchArch9AgentCandidates({ supabase, organisationId }),
  ])

  const agentPlan = createProperty24AgentMappingPlan({
    arch9Agents: resolvedArch9Agents,
    property24Agents: agentSnapshot.agents,
    existingMappings,
  })
  const catalogPlan = createProperty24CatalogMappingPlan({
    localLocations,
    localPropertyTypes,
    property24Catalog: catalogSnapshot,
  })

  return {
    phase: 'property24-agent-catalog-synchronisation',
    generatedAt: new Date().toISOString(),
    agencyId: normalizeProperty24Text(agencyId),
    organisationId: normalizeProperty24Text(organisationId),
    catalogScope: compactObject({ countryId, provinceId, cityId }),
    summary: {
      ready: agentPlan.summary.ready && catalogPlan.summary.ready,
      agents: agentPlan.summary,
      catalog: catalogPlan.summary,
    },
    property24: {
      agents: agentSnapshot,
      catalog: catalogSnapshot.summary,
    },
    agentPlan,
    catalogPlan,
  }
}

export function createRedactedProperty24SynchronisationPreview(report = {}) {
  if (!report || typeof report !== 'object') return report
  if (Array.isArray(report)) return report.map(createRedactedProperty24SynchronisationPreview)
  return Object.fromEntries(
    Object.entries(report)
      .filter(([key]) => key !== 'raw')
      .map(([key, value]) => [key, createRedactedProperty24SynchronisationPreview(value)]),
  )
}
