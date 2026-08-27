import { normalizePrivatePropertyText } from './privatePropertyClient.js'
import {
  buildPrivatePropertyAgencyConfigReadiness,
  resolvePrivatePropertyAgencyConfig,
} from './privatePropertyAgencyConfigService.js'

export const PRIVATE_PROPERTY_AGENT_MAPPING_SERVICE_VERSION = 'arch9_private_property_agent_mapping_service_v1'

const ACTIVE_STATUSES = new Set(['active'])

function normalizeKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeEnvironment(value = '') {
  const key = normalizeKey(value)
  return key === 'production' ? 'production' : 'sandbox'
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === false) return value
  const key = normalizeKey(value)
  if (['true', 'yes', '1', 'enabled', 'active'].includes(key)) return true
  if (['false', 'no', '0', 'disabled', 'inactive'].includes(key)) return false
  return fallback
}

function normalizeConfidence(value, fallback = 1) {
  if (value === null || value === undefined || normalizePrivatePropertyText(value) === '') return fallback
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(0, Math.min(1, numeric))
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeEmail(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase()
}

function normalizeMappingRow(row = {}) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizePrivatePropertyText(row.id),
    agencyConfigId: normalizePrivatePropertyText(row.agency_config_id || row.agencyConfigId),
    organisationId: normalizePrivatePropertyText(row.organisation_id || row.organisationId),
    branchId: normalizePrivatePropertyText(row.branch_id || row.branchId) || null,
    organisationUserId: normalizePrivatePropertyText(row.organisation_user_id || row.organisationUserId) || null,
    arch9UserId: normalizePrivatePropertyText(row.arch9_user_id || row.arch9UserId) || null,
    environment: normalizeEnvironment(row.environment),
    privatePropertyAgentId: normalizePrivatePropertyText(row.private_property_agent_id || row.privatePropertyAgentId || row.agentId),
    sourceReference: normalizePrivatePropertyText(row.source_reference || row.sourceReference),
    emailSnapshot: normalizeEmail(row.email_snapshot || row.emailSnapshot),
    firstNameSnapshot: normalizePrivatePropertyText(row.first_name_snapshot || row.firstNameSnapshot),
    lastNameSnapshot: normalizePrivatePropertyText(row.last_name_snapshot || row.lastNameSnapshot),
    mobileSnapshot: normalizePrivatePropertyText(row.mobile_snapshot || row.mobileSnapshot),
    imageUrlSnapshot: normalizePrivatePropertyText(row.image_url_snapshot || row.imageUrlSnapshot),
    isDefaultForBranch: Boolean(row.is_default_for_branch ?? row.isDefaultForBranch),
    isDefaultForOrganisation: Boolean(row.is_default_for_organisation ?? row.isDefaultForOrganisation),
    matchType: normalizeKey(row.match_type || row.matchType || 'manual') || 'manual',
    confidence: normalizeConfidence(row.confidence),
    status: normalizeKey(row.status || 'active') || 'active',
    lastSyncedAt: normalizePrivatePropertyText(row.last_synced_at || row.lastSyncedAt),
    lastVerifiedAt: normalizePrivatePropertyText(row.last_verified_at || row.lastVerifiedAt),
    notes: normalizePrivatePropertyText(row.notes),
    metadata: normalizeObject(row.metadata_json || row.metadataJson),
    createdAt: normalizePrivatePropertyText(row.created_at || row.createdAt),
    updatedAt: normalizePrivatePropertyText(row.updated_at || row.updatedAt),
  }
}

export function redactPrivatePropertyAgentMapping(mapping = {}) {
  const row = normalizeMappingRow(mapping)
  if (!row) return null
  return {
    id: row.id,
    agencyConfigId: row.agencyConfigId,
    organisationId: row.organisationId,
    branchId: row.branchId,
    organisationUserId: row.organisationUserId,
    arch9UserId: row.arch9UserId,
    environment: row.environment,
    privatePropertyAgentId: row.privatePropertyAgentId,
    sourceReference: row.sourceReference,
    emailSnapshot: row.emailSnapshot,
    firstNameSnapshot: row.firstNameSnapshot,
    lastNameSnapshot: row.lastNameSnapshot,
    mobileSnapshot: row.mobileSnapshot,
    imageUrlSnapshot: row.imageUrlSnapshot,
    isDefaultForBranch: row.isDefaultForBranch,
    isDefaultForOrganisation: row.isDefaultForOrganisation,
    matchType: row.matchType,
    confidence: row.confidence,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt,
    lastVerifiedAt: row.lastVerifiedAt,
    metadata: row.metadata,
  }
}

function buildReadiness(mapping = null, source = 'none') {
  const row = normalizeMappingRow(mapping)
  const blockers = []
  const warnings = []

  if (!row) {
    blockers.push('missing_private_property_agent_mapping')
    return { ready: false, blockers, warnings, mapping: null }
  }

  if (!row.agencyConfigId) blockers.push('missing_private_property_agency_config_id')
  if (!row.organisationId) blockers.push('missing_organisation_id')
  if (!row.privatePropertyAgentId) blockers.push('missing_private_property_agent_id')
  if (!row.sourceReference) blockers.push('missing_private_property_agent_source_reference')
  if (!ACTIVE_STATUSES.has(row.status)) blockers.push('private_property_agent_mapping_inactive')
  if (source === 'branch_default') warnings.push('using_branch_default_private_property_agent')
  if (source === 'organisation_default') warnings.push('using_organisation_default_private_property_agent')
  if (source === 'email') warnings.push('using_email_matched_private_property_agent')

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    mapping: redactPrivatePropertyAgentMapping(row),
  }
}

async function fetchOptionalSingle({ client, table, select = '*', filters = [] } = {}) {
  let query = client.from(table).select(select)
  for (const [method, column, value] of filters) {
    query = query[method](column, value)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data || null
}

async function fetchRows({ client, table, select = '*', filters = [], orderBy = 'updated_at', ascending = false } = {}) {
  let query = client.from(table).select(select)
  for (const [method, column, value] of filters) {
    query = query[method](column, value)
  }
  if (typeof query.order === 'function') query = query.order(orderBy, { ascending })
  const { data, error } = await query
  if (error) throw error
  return Array.isArray(data) ? data : []
}

async function fetchListingContext({ client, listingId } = {}) {
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!normalizedListingId) return null
  return fetchOptionalSingle({
    client,
    table: 'private_listings',
    select: 'id, organisation_id, branch_id, assigned_agent_id, assigned_agent_email, created_by',
    filters: [['eq', 'id', normalizedListingId]],
  })
}

function pickMapping(rows = [], context = {}) {
  const agencyConfigId = normalizePrivatePropertyText(context.agencyConfigId)
  const arch9UserId = normalizePrivatePropertyText(context.arch9UserId)
  const email = normalizeEmail(context.email)
  const branchId = normalizePrivatePropertyText(context.branchId)

  const normalizedRows = rows.map(normalizeMappingRow).filter(Boolean)
  const scopedRows = agencyConfigId
    ? normalizedRows.filter((row) => row.agencyConfigId === agencyConfigId)
    : normalizedRows
  const activeRows = scopedRows.filter((row) => row.status === 'active')

  if (arch9UserId) {
    const exactUser = activeRows.find((row) => row.arch9UserId === arch9UserId)
    if (exactUser) return { row: exactUser, source: 'arch9_user' }
  }

  if (email) {
    const exactEmail = activeRows.find((row) => row.emailSnapshot === email)
    if (exactEmail) return { row: exactEmail, source: 'email' }
  }

  if (branchId) {
    const branchDefault = activeRows.find((row) => row.branchId === branchId && row.isDefaultForBranch)
    if (branchDefault) return { row: branchDefault, source: 'branch_default' }
  }

  const organisationDefault = activeRows.find((row) => row.isDefaultForOrganisation)
  if (organisationDefault) return { row: organisationDefault, source: 'organisation_default' }

  return null
}

async function fetchPrivatePropertyAgentMappingRows({ client, agencyConfigId, organisationId, environment } = {}) {
  const normalizedAgencyConfigId = normalizePrivatePropertyText(agencyConfigId)
  const normalizedOrganisationId = normalizePrivatePropertyText(organisationId)
  const normalizedEnvironment = normalizeEnvironment(environment)
  if (!normalizedOrganisationId) return []

  const filters = [
    ['eq', 'organisation_id', normalizedOrganisationId],
    ['eq', 'environment', normalizedEnvironment],
  ]
  if (normalizedAgencyConfigId) filters.push(['eq', 'agency_config_id', normalizedAgencyConfigId])

  return fetchRows({
    client,
    table: 'private_property_agent_mappings',
    filters,
  })
}

async function fetchPrivatePropertyAgencyConfigById({ client, agencyConfigId, organisationId, environment } = {}) {
  const normalizedAgencyConfigId = normalizePrivatePropertyText(agencyConfigId)
  const normalizedOrganisationId = normalizePrivatePropertyText(organisationId)
  const normalizedEnvironment = normalizeEnvironment(environment)
  if (!normalizedAgencyConfigId || !normalizedOrganisationId) return null

  return fetchOptionalSingle({
    client,
    table: 'private_property_agency_configs',
    filters: [
      ['eq', 'id', normalizedAgencyConfigId],
      ['eq', 'organisation_id', normalizedOrganisationId],
      ['eq', 'environment', normalizedEnvironment],
    ],
  })
}

async function fetchExactPrivatePropertyAgentMappingRow({ client, agencyConfigId, environment, arch9UserId, sourceReference } = {}) {
  const normalizedAgencyConfigId = normalizePrivatePropertyText(agencyConfigId)
  const normalizedEnvironment = normalizeEnvironment(environment)
  const normalizedArch9UserId = normalizePrivatePropertyText(arch9UserId)
  const normalizedSourceReference = normalizePrivatePropertyText(sourceReference)
  if (!normalizedAgencyConfigId) return null

  const filters = [
    ['eq', 'agency_config_id', normalizedAgencyConfigId],
    ['eq', 'environment', normalizedEnvironment],
  ]
  if (normalizedArch9UserId) filters.push(['eq', 'arch9_user_id', normalizedArch9UserId])
  else if (normalizedSourceReference) filters.push(['eq', 'source_reference', normalizedSourceReference])
  else return null

  return fetchOptionalSingle({
    client,
    table: 'private_property_agent_mappings',
    filters,
  })
}

export function buildPrivatePropertyAgentMappingPayload(options = {}) {
  const environment = normalizeEnvironment(options.environment)
  const organisationId = normalizePrivatePropertyText(options.organisationId || options.organisation_id)
  const branchId = normalizePrivatePropertyText(options.branchId || options.branch_id)
  const arch9UserId = normalizePrivatePropertyText(options.arch9UserId || options.arch9_user_id)
  const sourceReference = normalizePrivatePropertyText(options.sourceReference || options.source_reference || arch9UserId)
  const defaultForBranch = normalizeBoolean(options.isDefaultForBranch ?? options.is_default_for_branch, false)
  const defaultForOrganisation = normalizeBoolean(options.isDefaultForOrganisation ?? options.is_default_for_organisation, false)

  const payload = {
    agency_config_id: normalizePrivatePropertyText(options.agencyConfigId || options.agency_config_id),
    organisation_id: organisationId,
    branch_id: branchId || null,
    organisation_user_id: normalizePrivatePropertyText(options.organisationUserId || options.organisation_user_id) || null,
    arch9_user_id: arch9UserId || null,
    environment,
    private_property_agent_id: normalizePrivatePropertyText(options.privatePropertyAgentId || options.private_property_agent_id || options.agentId),
    source_reference: sourceReference,
    email_snapshot: normalizeEmail(options.emailSnapshot || options.email_snapshot || options.email),
    first_name_snapshot: normalizePrivatePropertyText(options.firstNameSnapshot || options.first_name_snapshot || options.firstName),
    last_name_snapshot: normalizePrivatePropertyText(options.lastNameSnapshot || options.last_name_snapshot || options.lastName),
    mobile_snapshot: normalizePrivatePropertyText(options.mobileSnapshot || options.mobile_snapshot || options.mobile),
    image_url_snapshot: normalizePrivatePropertyText(options.imageUrlSnapshot || options.image_url_snapshot || options.imageUrl),
    is_default_for_branch: defaultForBranch,
    is_default_for_organisation: defaultForOrganisation,
    match_type: normalizeKey(options.matchType || options.match_type || (defaultForBranch ? 'branch_default' : defaultForOrganisation ? 'organisation_default' : 'manual')) || 'manual',
    confidence: normalizeConfidence(options.confidence),
    status: normalizeKey(options.status || 'active') || 'active',
    last_synced_at: normalizePrivatePropertyText(options.lastSyncedAt || options.last_synced_at) || null,
    last_verified_at: normalizePrivatePropertyText(options.lastVerifiedAt || options.last_verified_at) || null,
    notes: normalizePrivatePropertyText(options.notes) || null,
    metadata_json: normalizeObject(options.metadataJson || options.metadata_json),
  }

  const missing = []
  if (!payload.agency_config_id) missing.push('agency_config_id')
  if (!payload.organisation_id) missing.push('organisation_id')
  if (!payload.private_property_agent_id) missing.push('private_property_agent_id')
  if (!payload.source_reference) missing.push('source_reference')
  if (payload.is_default_for_branch && !payload.branch_id) missing.push('branch_id')
  if (!payload.arch9_user_id && !payload.is_default_for_branch && !payload.is_default_for_organisation) {
    missing.push('arch9_user_id_or_default_scope')
  }

  return { payload, missing }
}

export async function upsertPrivatePropertyAgentMapping({ client, ...options } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const { payload, missing } = buildPrivatePropertyAgentMappingPayload(options)
  if (missing.length) {
    const error = new Error(`Private Property agent mapping is missing required fields: ${missing.join(', ')}`)
    error.missing = missing
    throw error
  }

  const existing = await fetchExactPrivatePropertyAgentMappingRow({
    client,
    agencyConfigId: payload.agency_config_id,
    environment: payload.environment,
    arch9UserId: payload.arch9_user_id,
    sourceReference: payload.source_reference,
  })

  const query = existing
    ? client
      .from('private_property_agent_mappings')
      .update(payload)
      .eq('id', existing.id)
    : client
      .from('private_property_agent_mappings')
      .insert(payload)

  const { data, error } = await query
    .select('*')
    .single()

  if (error) throw error
  const readiness = buildReadiness(data, payload.is_default_for_branch ? 'branch_default' : payload.is_default_for_organisation ? 'organisation_default' : 'arch9_user')
  return {
    action: existing ? 'updated' : 'inserted',
    mapping: readiness.mapping,
    readiness,
  }
}

export async function resolvePrivatePropertyAgentMapping({
  client,
  listingId = '',
  organisationId = '',
  branchId = '',
  arch9UserId = '',
  assignedAgentEmail = '',
  agencyConfigId = '',
  environment = 'sandbox',
} = {}) {
  if (!client) throw new Error('Supabase client is required.')

  const normalizedListingId = normalizePrivatePropertyText(listingId)
  const listing = await fetchListingContext({ client, listingId: normalizedListingId })
  const resolvedOrganisationId = normalizePrivatePropertyText(organisationId || listing?.organisation_id || listing?.organisationId)
  const resolvedBranchId = normalizePrivatePropertyText(branchId || listing?.branch_id || listing?.branchId)
  const resolvedArch9UserId = normalizePrivatePropertyText(arch9UserId || listing?.assigned_agent_id || listing?.assignedAgentId || listing?.created_by || listing?.createdBy)
  const resolvedEmail = normalizeEmail(assignedAgentEmail || listing?.assigned_agent_email || listing?.assignedAgentEmail)

  if (!resolvedOrganisationId) {
    return {
      version: PRIVATE_PROPERTY_AGENT_MAPPING_SERVICE_VERSION,
      ready: false,
      source: 'none',
      listingId: normalizedListingId,
      organisationId: '',
      branchId: resolvedBranchId || null,
      arch9UserId: resolvedArch9UserId || null,
      assignedAgentEmail: resolvedEmail,
      agencyConfig: null,
      mapping: null,
      agentMapping: { agentIds: '' },
      blockers: ['missing_organisation_id'],
      warnings: [],
    }
  }

  const configResolution = agencyConfigId
    ? null
    : await resolvePrivatePropertyAgencyConfig({
      client,
      listingId: normalizedListingId,
      organisationId: resolvedOrganisationId,
      branchId: resolvedBranchId,
      environment,
    })
  const resolvedAgencyConfigId = normalizePrivatePropertyText(agencyConfigId || configResolution?.config?.id)
  const rows = await fetchPrivatePropertyAgentMappingRows({
    client,
    agencyConfigId: resolvedAgencyConfigId,
    organisationId: resolvedOrganisationId,
    environment,
  })
  const match = pickMapping(rows, {
    agencyConfigId: resolvedAgencyConfigId,
    arch9UserId: resolvedArch9UserId,
    email: resolvedEmail,
    branchId: resolvedBranchId,
  })
  const mappingAgencyConfigId = normalizePrivatePropertyText(match?.row?.agency_config_id || match?.row?.agencyConfigId)
  const mappingAgencyConfig = configResolution?.config
    ? null
    : await fetchPrivatePropertyAgencyConfigById({
      client,
      agencyConfigId: mappingAgencyConfigId,
      organisationId: resolvedOrganisationId,
      environment,
    })
  const mappingConfigReadiness = mappingAgencyConfig
    ? buildPrivatePropertyAgencyConfigReadiness(mappingAgencyConfig)
    : null
  const effectiveConfigResolution = mappingConfigReadiness
    ? {
      ready: mappingConfigReadiness.ready,
      source: 'private_property_agency_configs.via_agent_mapping',
      config: mappingConfigReadiness.config,
      blockers: mappingConfigReadiness.blockers,
      warnings: mappingConfigReadiness.warnings,
    }
    : configResolution
  const readiness = buildReadiness(match?.row || null, match?.source || 'none')
  const blockers = [...(effectiveConfigResolution?.ready === false ? effectiveConfigResolution.blockers : []), ...readiness.blockers]
  const warnings = [...(effectiveConfigResolution?.warnings || []), ...readiness.warnings]

  return {
    version: PRIVATE_PROPERTY_AGENT_MAPPING_SERVICE_VERSION,
    ready: blockers.length === 0,
    source: match?.source || 'none',
    listingId: normalizedListingId,
    organisationId: resolvedOrganisationId,
    branchId: resolvedBranchId || null,
    arch9UserId: resolvedArch9UserId || null,
    assignedAgentEmail: resolvedEmail,
    agencyConfig: effectiveConfigResolution?.config || null,
    mapping: readiness.mapping,
    agentMapping: {
      agentIds: readiness.mapping?.privatePropertyAgentId || '',
      privatePropertyAgentId: readiness.mapping?.privatePropertyAgentId || '',
    },
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  }
}
