import { normalizeProperty24Text } from './client.js'
import { assertProperty24ProductionConnectionEnablement } from './liveCutoverService.js'

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function positiveIntegerText(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? String(number) : ''
}

function connectionError(code, message, status = 409) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export function normalizeOrganisationProperty24Connection(settings = {}) {
  const root = asObject(settings)
  const source = asObject(root.property24 || root.property_24 || root)
  const environment = normalizeProperty24Text(source.environment).toLowerCase()
  return {
    dataOwnershipVersion: 'arch9_property24_canonical_v1',
    enabled: source.enabled === true,
    agencyId: positiveIntegerText(source.agencyId || source.agency_id),
    environment: ['production', 'exdev'].includes(environment) ? environment : 'exdev',
    sourceReferencePrefix: normalizeProperty24Text(source.sourceReferencePrefix || source.source_reference_prefix || 'ARCH9'),
    configured: Boolean(positiveIntegerText(source.agencyId || source.agency_id)),
  }
}

function selectConnection(rows = [], environment = '') {
  const normalizedEnvironment = normalizeProperty24Text(environment).toLowerCase()
  if (normalizedEnvironment) return rows.find((row) => row.environment === normalizedEnvironment) || null
  return rows.find((row) => row.enabled && row.environment === 'production') ||
    rows.find((row) => row.enabled && row.environment === 'exdev') ||
    rows.find((row) => row.environment === 'production') ||
    rows[0] ||
    null
}

export async function fetchOrganisationProperty24Connection({ supabase, organisationId, environment = '' } = {}) {
  if (!supabase?.from) throw connectionError('supabase_required', 'Supabase client is required.', 500)
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  if (!normalizedOrganisationId) throw connectionError('organisation_id_required', 'Organisation ID is required.', 400)

  const accountResult = await supabase
    .from('property24_accounts')
    .select('organisation_id, environment, agency_id, enabled, last_auth_check_at, last_catalog_sync_at, last_agent_sync_at, updated_at')
    .eq('organisation_id', normalizedOrganisationId)
    .order('enabled', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(10)

  if (accountResult.error && accountResult.error.code !== '42P01') throw accountResult.error
  const account = selectConnection((accountResult.data || []).map((row) => ({
    dataOwnershipVersion: 'arch9_property24_canonical_v1',
    enabled: row.enabled === true,
    agencyId: positiveIntegerText(row.agency_id),
    environment: normalizeProperty24Text(row.environment).toLowerCase() || 'exdev',
    sourceReferencePrefix: 'ARCH9',
    configured: Boolean(positiveIntegerText(row.agency_id)),
    lastAuthCheckAt: row.last_auth_check_at || null,
    lastCatalogSyncAt: row.last_catalog_sync_at || null,
    lastAgentSyncAt: row.last_agent_sync_at || null,
    updatedAt: row.updated_at || null,
    source: 'property24_accounts',
  })), environment)
  if (account) return account

  const legacyResult = await supabase
    .from('organisation_settings')
    .select('settings_json')
    .eq('organisation_id', normalizedOrganisationId)
    .maybeSingle()

  if (legacyResult.error && legacyResult.error.code !== 'PGRST116') throw legacyResult.error
  const legacyConnection = {
    ...normalizeOrganisationProperty24Connection(legacyResult.data?.settings_json || {}),
    source: 'organisation_settings_legacy',
  }
  const normalizedEnvironment = normalizeProperty24Text(environment).toLowerCase()
  if (normalizedEnvironment && legacyConnection.environment !== normalizedEnvironment) {
    return {
      ...legacyConnection,
      enabled: false,
      agencyId: '',
      environment: normalizedEnvironment,
      configured: false,
      source: 'not_configured',
    }
  }
  return legacyConnection
}

export async function upsertOrganisationProperty24Connection({
  supabase,
  organisationId,
  agencyId,
  environment = 'exdev',
  enabled = false,
} = {}) {
  if (!supabase?.from) throw connectionError('supabase_required', 'Supabase client is required.', 500)
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  const normalizedAgencyId = positiveIntegerText(agencyId)
  const normalizedEnvironment = normalizeProperty24Text(environment).toLowerCase()
  if (!normalizedOrganisationId) throw connectionError('organisation_id_required', 'Organisation ID is required.', 400)
  if (!normalizedAgencyId) throw connectionError('property24_agency_id_invalid', 'Enter a valid Property24 agency ID.', 400)
  if (!['production', 'exdev'].includes(normalizedEnvironment)) {
    throw connectionError('property24_environment_invalid', 'Property24 environment must be ExDev or production.', 400)
  }

  await assertProperty24ProductionConnectionEnablement({
    supabase,
    organisationId: normalizedOrganisationId,
    environment: normalizedEnvironment,
    enabled: enabled === true,
  })

  const result = await supabase
    .from('property24_accounts')
    .upsert({
      organisation_id: normalizedOrganisationId,
      environment: normalizedEnvironment,
      agency_id: Number(normalizedAgencyId),
      enabled: enabled === true,
    }, { onConflict: 'organisation_id,environment' })
    .select('organisation_id, environment, agency_id, enabled, last_auth_check_at, last_catalog_sync_at, last_agent_sync_at, updated_at')
    .single()
  if (result.error) throw result.error
  return {
    dataOwnershipVersion: 'arch9_property24_canonical_v1',
    configured: true,
    source: 'property24_accounts',
    organisationId: result.data.organisation_id,
    environment: result.data.environment,
    agencyId: positiveIntegerText(result.data.agency_id),
    enabled: result.data.enabled === true,
    lastAuthCheckAt: result.data.last_auth_check_at || null,
    lastCatalogSyncAt: result.data.last_catalog_sync_at || null,
    lastAgentSyncAt: result.data.last_agent_sync_at || null,
    updatedAt: result.data.updated_at || null,
  }
}

export async function resolveOrganisationProperty24Connection({
  supabase,
  organisationId,
  requestedAgencyId = '',
  environment = '',
  requireEnabled = false,
} = {}) {
  const connection = await fetchOrganisationProperty24Connection({ supabase, organisationId, environment })
  if (!connection.configured) {
    throw connectionError(
      'property24_connection_not_configured',
      'Save the organisation Property24 agency connection before managing agents.',
    )
  }
  if (requireEnabled && !connection.enabled) {
    throw connectionError('property24_connection_disabled', 'Enable the organisation Property24 connection first.')
  }

  const requested = positiveIntegerText(requestedAgencyId)
  if (requested && requested !== connection.agencyId) {
    throw connectionError(
      'property24_agency_connection_mismatch',
      'The requested Property24 agency does not match this organisation’s saved connection.',
      403,
    )
  }
  return connection
}
