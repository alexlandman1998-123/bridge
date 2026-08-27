import {
  PRIVATE_PROPERTY_SANDBOX_BASE_URL,
  normalizePrivatePropertyBaseUrl,
  normalizePrivatePropertyText,
} from './privatePropertyClient.js'

export const PRIVATE_PROPERTY_AGENCY_CONFIG_SERVICE_VERSION = 'arch9_private_property_agency_config_service_v1'

const READY_STATUSES = new Set(['sandbox_ready', 'approved', 'active'])

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

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeConfigBaseUrl(value = '', environment = 'sandbox') {
  const text = normalizePrivatePropertyText(value)
  if (text) return normalizePrivatePropertyBaseUrl(text)
  return environment === 'sandbox' ? PRIVATE_PROPERTY_SANDBOX_BASE_URL : ''
}

function normalizeConfigRow(row = {}) {
  if (!row || typeof row !== 'object' || Object.keys(row).length === 0) return null
  const environment = normalizeEnvironment(row.environment)
  return {
    id: normalizePrivatePropertyText(row.id),
    organisationId: normalizePrivatePropertyText(row.organisation_id || row.organisationId),
    branchId: normalizePrivatePropertyText(row.branch_id || row.branchId) || null,
    environment,
    vendorName: normalizePrivatePropertyText(row.vendor_name || row.vendorName || 'Arch9') || 'Arch9',
    branchGuid: normalizePrivatePropertyText(row.branch_guid || row.branchGuid),
    usernameSecretName: normalizePrivatePropertyText(row.username_secret_name || row.usernameSecretName),
    passwordSecretName: normalizePrivatePropertyText(row.password_secret_name || row.passwordSecretName),
    baseUrl: normalizeConfigBaseUrl(row.base_url || row.baseUrl, environment),
    enabled: Boolean(row.enabled),
    status: normalizeKey(row.status || 'pending') || 'pending',
    goLiveApprovedAt: normalizePrivatePropertyText(row.go_live_approved_at || row.goLiveApprovedAt),
    goLiveApprovedBy: normalizePrivatePropertyText(row.go_live_approved_by || row.goLiveApprovedBy),
    lastAuthCheckAt: normalizePrivatePropertyText(row.last_auth_check_at || row.lastAuthCheckAt),
    lastPublishCheckAt: normalizePrivatePropertyText(row.last_publish_check_at || row.lastPublishCheckAt),
    lastEventFeedCheckAt: normalizePrivatePropertyText(row.last_event_feed_check_at || row.lastEventFeedCheckAt),
    notes: normalizePrivatePropertyText(row.notes),
    metadata: normalizeObject(row.metadata_json || row.metadataJson),
    createdAt: normalizePrivatePropertyText(row.created_at || row.createdAt),
    updatedAt: normalizePrivatePropertyText(row.updated_at || row.updatedAt),
  }
}

export function redactPrivatePropertyAgencyConfig(config = {}) {
  const row = normalizeConfigRow(config)
  if (!row) return null
  return {
    id: row.id,
    organisationId: row.organisationId,
    branchId: row.branchId,
    environment: row.environment,
    vendorName: row.vendorName,
    branchGuid: row.branchGuid,
    usernameSecretName: row.usernameSecretName,
    passwordSecretName: row.passwordSecretName,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    status: row.status,
    goLiveApprovedAt: row.goLiveApprovedAt,
    lastAuthCheckAt: row.lastAuthCheckAt,
    lastPublishCheckAt: row.lastPublishCheckAt,
    lastEventFeedCheckAt: row.lastEventFeedCheckAt,
    metadata: row.metadata,
  }
}

export function buildPrivatePropertyAgencyConfigReadiness(config = null, { allowDisabled = false } = {}) {
  const row = normalizeConfigRow(config)
  const blockers = []
  const warnings = []

  if (!row) {
    blockers.push('missing_private_property_agency_config')
    return { ready: false, blockers, warnings, config: null }
  }
  if (!row.organisationId) blockers.push('missing_organisation_id')
  if (!row.branchGuid) blockers.push('missing_private_property_branch_guid')
  if (!row.usernameSecretName) blockers.push('missing_private_property_username_secret_name')
  if (!row.passwordSecretName) blockers.push('missing_private_property_password_secret_name')
  if (!row.baseUrl) blockers.push('missing_private_property_base_url')
  if (!allowDisabled && !row.enabled) blockers.push('private_property_config_disabled')
  if (!READY_STATUSES.has(row.status)) blockers.push('private_property_config_not_approved')
  if (row.environment === 'production' && !row.goLiveApprovedAt) blockers.push('private_property_production_go_live_not_approved')
  if (!row.branchId) warnings.push('using_organisation_default_private_property_config')

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    config: redactPrivatePropertyAgencyConfig(row),
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

async function fetchPrivatePropertyConfigRow({ client, organisationId, branchId, environment } = {}) {
  const normalizedOrganisationId = normalizePrivatePropertyText(organisationId)
  const normalizedBranchId = normalizePrivatePropertyText(branchId)
  const normalizedEnvironment = normalizeEnvironment(environment)
  if (!normalizedOrganisationId) return null

  if (normalizedBranchId) {
    const branchRow = await fetchOptionalSingle({
      client,
      table: 'private_property_agency_configs',
      filters: [
        ['eq', 'organisation_id', normalizedOrganisationId],
        ['eq', 'branch_id', normalizedBranchId],
        ['eq', 'environment', normalizedEnvironment],
      ],
    })
    if (branchRow) return { row: branchRow, source: 'private_property_agency_configs.branch' }
  }

  const defaultRow = await fetchOptionalSingle({
    client,
    table: 'private_property_agency_configs',
    filters: [
      ['eq', 'organisation_id', normalizedOrganisationId],
      ['is', 'branch_id', null],
      ['eq', 'environment', normalizedEnvironment],
    ],
  })
  return defaultRow ? { row: defaultRow, source: 'private_property_agency_configs.organisation_default' } : null
}

async function fetchExactPrivatePropertyConfigRow({ client, organisationId, branchId, environment } = {}) {
  const normalizedOrganisationId = normalizePrivatePropertyText(organisationId)
  const normalizedBranchId = normalizePrivatePropertyText(branchId)
  const normalizedEnvironment = normalizeEnvironment(environment)
  if (!normalizedOrganisationId) return null

  const filters = [
    ['eq', 'organisation_id', normalizedOrganisationId],
    ['eq', 'environment', normalizedEnvironment],
    normalizedBranchId ? ['eq', 'branch_id', normalizedBranchId] : ['is', 'branch_id', null],
  ]

  return fetchOptionalSingle({
    client,
    table: 'private_property_agency_configs',
    filters,
  })
}

export function buildPrivatePropertyAgencyConfigPayload(options = {}) {
  const environment = normalizeEnvironment(options.environment)
  const organisationId = normalizePrivatePropertyText(options.organisationId || options.organisation_id)
  const branchId = normalizePrivatePropertyText(options.branchId || options.branch_id)
  const usernameSecretName = normalizePrivatePropertyText(options.usernameSecretName || options.username_secret_name)
  const passwordSecretName = normalizePrivatePropertyText(options.passwordSecretName || options.password_secret_name)
  const payload = {
    organisation_id: organisationId,
    branch_id: branchId || null,
    environment,
    vendor_name: normalizePrivatePropertyText(options.vendorName || options.vendor_name || 'Arch9') || 'Arch9',
    branch_guid: normalizePrivatePropertyText(options.branchGuid || options.branch_guid),
    username_secret_name: usernameSecretName,
    password_secret_name: passwordSecretName,
    base_url: normalizePrivatePropertyText(options.baseUrl || options.base_url) || null,
    enabled: normalizeBoolean(options.enabled, false),
    status: normalizeKey(options.status || 'pending') || 'pending',
    go_live_approved_at: normalizePrivatePropertyText(options.goLiveApprovedAt || options.go_live_approved_at) || null,
    notes: normalizePrivatePropertyText(options.notes) || null,
    metadata_json: normalizeObject(options.metadataJson || options.metadata_json),
  }

  const missing = []
  if (!payload.organisation_id) missing.push('organisation_id')
  if (!payload.branch_guid) missing.push('branch_guid')
  if (!payload.username_secret_name) missing.push('username_secret_name')
  if (!payload.password_secret_name) missing.push('password_secret_name')
  if (environment === 'production' && !payload.base_url) missing.push('base_url')

  return { payload, missing }
}

export async function upsertPrivatePropertyAgencyConfig({ client, ...options } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const { payload, missing } = buildPrivatePropertyAgencyConfigPayload(options)
  if (missing.length) {
    const error = new Error(`Private Property config is missing required fields: ${missing.join(', ')}`)
    error.missing = missing
    throw error
  }

  const existing = await fetchExactPrivatePropertyConfigRow({
    client,
    organisationId: payload.organisation_id,
    branchId: payload.branch_id,
    environment: payload.environment,
  })

  const query = existing
    ? client
      .from('private_property_agency_configs')
      .update(payload)
      .eq('id', existing.id)
    : client
      .from('private_property_agency_configs')
      .insert(payload)

  const { data, error } = await query
    .select('*')
    .single()

  if (error) throw error
  return {
    action: existing ? 'updated' : 'inserted',
    config: redactPrivatePropertyAgencyConfig(data),
    readiness: buildPrivatePropertyAgencyConfigReadiness(data),
  }
}

export async function resolvePrivatePropertyAgencyConfig({
  client,
  listingId = '',
  organisationId = '',
  branchId = '',
  environment = 'sandbox',
  allowDisabled = false,
} = {}) {
  if (!client) throw new Error('Supabase client is required.')

  let listing = null
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (normalizedListingId) {
    listing = await fetchOptionalSingle({
      client,
      table: 'private_listings',
      select: 'id, organisation_id, branch_id',
      filters: [['eq', 'id', normalizedListingId]],
    })
  }

  const resolvedOrganisationId = normalizePrivatePropertyText(organisationId || listing?.organisation_id || listing?.organisationId)
  const resolvedBranchId = normalizePrivatePropertyText(branchId || listing?.branch_id || listing?.branchId)
  if (!resolvedOrganisationId) {
    return {
      version: PRIVATE_PROPERTY_AGENCY_CONFIG_SERVICE_VERSION,
      ready: false,
      source: 'none',
      listingId: normalizedListingId,
      organisationId: '',
      branchId: resolvedBranchId || null,
      environment: normalizeEnvironment(environment),
      blockers: ['missing_organisation_id'],
      warnings: [],
      config: null,
    }
  }

  const match = await fetchPrivatePropertyConfigRow({
    client,
    organisationId: resolvedOrganisationId,
    branchId: resolvedBranchId,
    environment,
  })
  const readiness = buildPrivatePropertyAgencyConfigReadiness(match?.row, { allowDisabled })

  return {
    version: PRIVATE_PROPERTY_AGENCY_CONFIG_SERVICE_VERSION,
    ready: readiness.ready,
    source: match?.source || 'none',
    listingId: normalizedListingId,
    organisationId: resolvedOrganisationId,
    branchId: resolvedBranchId || null,
    environment: normalizeEnvironment(environment),
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    config: readiness.config,
  }
}

export function resolvePrivatePropertyRuntimeCredentials(config = null, secrets = process.env) {
  const row = normalizeConfigRow(config)
  if (!row) return { username: '', password: '', missingSecrets: ['private_property_config'] }

  const username = normalizePrivatePropertyText(secrets[row.usernameSecretName])
  const password = normalizePrivatePropertyText(secrets[row.passwordSecretName])
  const missingSecrets = []
  if (!username) missingSecrets.push(row.usernameSecretName)
  if (!password) missingSecrets.push(row.passwordSecretName)

  return {
    username,
    password,
    missingSecrets,
    redacted: {
      usernamePresent: Boolean(username),
      passwordPresent: Boolean(password),
      usernameSecretName: row.usernameSecretName,
      passwordSecretName: row.passwordSecretName,
    },
  }
}
