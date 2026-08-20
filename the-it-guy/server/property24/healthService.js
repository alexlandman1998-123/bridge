import { normalizeProperty24Text } from './client.js'

const DAY_MS = 24 * 60 * 60 * 1000

function normalizeText(value = '') {
  return normalizeProperty24Text(value)
}

function normalizeStatus(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '_')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function latestIso(rows = [], keys = []) {
  const latest = rows
    .flatMap((row) => keys.map((key) => toDate(row?.[key])).filter(Boolean))
    .sort((left, right) => right.getTime() - left.getTime())[0]
  return latest ? latest.toISOString() : null
}

function countRecent(rows = [], keys = [], now = new Date(), ageMs = DAY_MS) {
  const cutoff = new Date((toDate(now) || new Date()).getTime() - ageMs)
  return rows.filter((row) => keys.some((key) => {
    const date = toDate(row?.[key])
    return date && date >= cutoff
  })).length
}

function isMissingOptionalTableError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message || error?.details).toLowerCase()
  return code === '42P01' || code === 'PGRST205' || message.includes('does not exist')
}

async function selectRows(query, { optional = false } = {}) {
  const result = await query
  if (result?.error) {
    if (optional && isMissingOptionalTableError(result.error)) return []
    throw result.error
  }
  return Array.isArray(result?.data) ? result.data : []
}

async function fetchOrganisationListingIds({ supabase, organisationId } = {}) {
  if (!organisationId) return []
  const rows = await selectRows(
    supabase
      .from('private_listings')
      .select('id')
      .eq('organisation_id', organisationId)
      .limit(1000),
    { optional: true },
  )
  return rows.map((row) => normalizeText(row.id)).filter(Boolean)
}

async function fetchProperty24ListingSyncRows({
  supabase,
  organisationId,
  listingIds = [],
  environment = 'exdev',
  agencyId = '',
} = {}) {
  if (!organisationId || !listingIds.length) return []
  let query = supabase
    .from('property24_listing_syncs')
    .select('*')
    .eq('environment', environment)
    .limit(1000)
  if (agencyId) query = query.eq('agency_id', Number(agencyId))
  if (typeof query.in === 'function') query = query.in('private_listing_id', listingIds)
  const rows = await selectRows(query, { optional: true })
  const allowedIds = new Set(listingIds)
  return rows.filter((row) => allowedIds.has(normalizeText(row.private_listing_id || row.privateListingId)))
}

async function fetchProperty24LeadIngestionRows({ supabase, organisationId } = {}) {
  if (!organisationId) return []
  return selectRows(
    supabase
      .from('lead_ingestion_logs')
      .select('*')
      .eq('organisation_id', organisationId)
      .eq('source', 'Property24')
      .order('created_at', { ascending: false })
      .limit(500),
    { optional: true },
  )
}

function normalizeSettings(settings = {}) {
  return settings?.property24 && typeof settings.property24 === 'object' ? settings.property24 : settings
}

function createCheck({ key, label, ok, severity = 'warning', detail = '' }) {
  return {
    key,
    label,
    status: ok ? 'ok' : severity,
    detail,
  }
}

export function summarizeProperty24OperationalHealth({
  config = {},
  settings = {},
  listingSyncRows = [],
  leadIngestionRows = [],
  now = new Date(),
} = {}) {
  const property24Settings = normalizeSettings(settings)
  const enabled = Boolean(property24Settings.enabled ?? config.syndicationEnabled)
  const agencyId = normalizeText(property24Settings.agencyId || config.agencyId)
  const environment = normalizeText(property24Settings.environment || config.environment || 'exdev')
  const mappings = asArray(property24Settings.agentMappings)
  const mappedCount = mappings.filter((mapping) => normalizeText(mapping.property24AgentId || mapping.property24_agent_id)).length
  const unmappedCount = mappings.filter((mapping) => !normalizeText(mapping.property24AgentId || mapping.property24_agent_id)).length
  const syncStatuses = listingSyncRows.map((row) => normalizeStatus(row.external_status || row.externalStatus || row.status))
  const failedSyncCount = syncStatuses.filter((status) => ['failed', 'rejected', 'blocked'].includes(status)).length
  const onPortalCount = listingSyncRows.filter((row) => Boolean(row.is_on_portal ?? row.isOnPortal)).length
  const processedLeadCount = leadIngestionRows.filter((row) => normalizeStatus(row.status) === 'processed').length
  const failedLeadCount = leadIngestionRows.filter((row) => ['failed', 'error', 'needs_review'].includes(normalizeStatus(row.status))).length

  const checks = [
    createCheck({
      key: 'connection_enabled',
      label: 'Property24 connection enabled',
      ok: enabled,
      severity: 'blocked',
      detail: enabled ? 'Publishing is enabled for this agency.' : 'Turn on Property24 before go-live.',
    }),
    createCheck({
      key: 'agency_id',
      label: 'Agency ID saved',
      ok: Boolean(agencyId),
      severity: 'blocked',
      detail: agencyId ? `Agency ${agencyId}` : 'Add the Property24 agency ID.',
    }),
    createCheck({
      key: 'server_credentials',
      label: 'Server credentials configured',
      ok: Boolean(config.serverCredentialsReady),
      severity: 'blocked',
      detail: config.serverCredentialsReady ? 'Username and password are server-side.' : 'Property24 username/password missing on the server.',
    }),
    createCheck({
      key: 'internal_api_token',
      label: 'Internal API token configured',
      ok: Boolean(config.apiInternalTokenReady),
      severity: 'blocked',
      detail: config.apiInternalTokenReady ? 'Internal API routes are protected.' : 'PROPERTY24_API_INTERNAL_TOKEN is missing.',
    }),
    createCheck({
      key: 'lead_sync_secret',
      label: 'Scheduled lead sync protected',
      ok: Boolean(config.leadSyncSecretReady),
      severity: 'warning',
      detail: config.leadSyncSecretReady ? 'Cron endpoint has a bearer secret.' : 'Set PROPERTY24_LEAD_SYNC_CRON_SECRET or CRON_SECRET before production cron.',
    }),
    createCheck({
      key: 'agent_mappings',
      label: 'Agent mappings reviewed',
      ok: mappings.length > 0 && unmappedCount === 0,
      severity: 'warning',
      detail: mappings.length ? `${mappedCount}/${mappings.length} agents mapped.` : 'No Arch9 agents are mapped to Property24 agents yet.',
    }),
    createCheck({
      key: 'listing_syncs',
      label: 'Published listings tracked',
      ok: listingSyncRows.length > 0,
      severity: 'warning',
      detail: listingSyncRows.length ? `${listingSyncRows.length} listings tracked, ${onPortalCount} marked on portal.` : 'No Property24 listing sync records found yet.',
    }),
    createCheck({
      key: 'lead_imports',
      label: 'Lead imports clean',
      ok: failedLeadCount === 0,
      severity: 'warning',
      detail: failedLeadCount ? `${failedLeadCount} lead import records need review.` : `${processedLeadCount} Property24 lead import records processed.`,
    }),
    createCheck({
      key: 'listing_sync_errors',
      label: 'Listing sync errors clear',
      ok: failedSyncCount === 0,
      severity: 'warning',
      detail: failedSyncCount ? `${failedSyncCount} listing sync records are failed or blocked.` : 'No failed listing sync records found.',
    }),
  ]
  const blockedCount = checks.filter((check) => check.status === 'blocked').length
  const warningCount = checks.filter((check) => check.status === 'warning').length

  return {
    phase: 'property24-phase10-operational-health',
    generatedAt: (toDate(now) || new Date()).toISOString(),
    status: blockedCount ? 'BLOCKED' : warningCount ? 'WARNING' : 'OK',
    environment,
    agencyId: agencyId || null,
    summary: {
      checkCount: checks.length,
      blockedCount,
      warningCount,
      mappedAgentCount: mappedCount,
      unmappedAgentCount: unmappedCount,
      trackedListingCount: listingSyncRows.length,
      onPortalListingCount: onPortalCount,
      failedListingSyncCount: failedSyncCount,
      processedLeadImportCount: processedLeadCount,
      failedLeadImportCount: failedLeadCount,
      recentLeadImportCount: countRecent(leadIngestionRows, ['created_at', 'processed_at', 'updated_at'], now),
      latestLeadImportAt: latestIso(leadIngestionRows, ['created_at', 'processed_at', 'updated_at']),
      latestListingSyncAt: latestIso(listingSyncRows, ['last_successful_sync_at', 'last_checked_at', 'updated_at', 'created_at']),
    },
    checks,
  }
}

export async function createProperty24OperationalHealth({
  supabase,
  config = {},
  settings = {},
  organisationId = '',
  now = new Date(),
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  const property24Settings = normalizeSettings(settings)
  const environment = normalizeText(property24Settings.environment || config.environment || 'exdev')
  const agencyId = normalizeText(property24Settings.agencyId || config.agencyId)
  const listingIds = await fetchOrganisationListingIds({ supabase, organisationId })
  const [listingSyncRows, leadIngestionRows] = await Promise.all([
    fetchProperty24ListingSyncRows({
      supabase,
      organisationId,
      listingIds,
      environment,
      agencyId,
    }),
    fetchProperty24LeadIngestionRows({ supabase, organisationId }),
  ])

  return summarizeProperty24OperationalHealth({
    config: {
      ...config,
      environment,
      agencyId,
    },
    settings: property24Settings,
    listingSyncRows,
    leadIngestionRows,
    now,
  })
}
