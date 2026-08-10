import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'
import { PIPELINE_OPERATIONAL_TELEMETRY_CATEGORY } from './pipelineOperationalTelemetryService.js'

const DEFAULT_PIPELINE_DIAGNOSTICS_HOURS = 24
const DEFAULT_PIPELINE_DIAGNOSTICS_LIMIT = 500

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSeverity(value) {
  const severity = normalizeText(value).toLowerCase()
  return ['error', 'warning', 'info', 'debug'].includes(severity) ? severity : 'info'
}

function isMissingTelemetrySchema(error = {}) {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return ['42p01', '42703', 'pgrst204', 'pgrst205'].includes(code) || message.includes('telemetry_events')
}

function asMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getNumber(value, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function countBy(rows = [], keyFn = () => '') {
  return rows.reduce((accumulator, row) => {
    const key = normalizeText(keyFn(row)) || 'unknown'
    accumulator[key] = Number(accumulator[key] || 0) + 1
    return accumulator
  }, {})
}

function percentile(values = [], percentileValue = 95) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1))
  return sorted[index]
}

function mapPipelineTelemetryRow(row = {}) {
  const metadata = asMetadata(row.metadata)
  return {
    id: normalizeText(row.id),
    eventName: normalizeText(row.event_name),
    event_name: normalizeText(row.event_name),
    severity: normalizeSeverity(row.severity),
    route: normalizeText(row.route),
    workspaceId: normalizeText(row.workspace_id),
    userId: normalizeText(row.user_id),
    createdAt: normalizeText(row.created_at),
    created_at: normalizeText(row.created_at),
    metadata,
    elapsedMs: getNumber(metadata.elapsedMs),
    source: normalizeText(metadata.source),
    leadId: normalizeText(metadata.leadId),
    listingId: normalizeText(metadata.listingId),
    documentKey: normalizeText(metadata.documentKey),
  }
}

function derivePipelineDiagnosticsStatus({ events = [], counts = {}, latency = {} } = {}) {
  if (!events.length) return 'unknown'
  if (Number(counts.errors || 0) > 0) return 'critical'
  if (Number(counts.warnings || 0) > 0) return 'warning'
  if (Number(latency.p95Ms || 0) >= 15000) return 'warning'
  return 'healthy'
}

export function summarizePipelineOperationalDiagnostics(events = [], { since = '', hours = DEFAULT_PIPELINE_DIAGNOSTICS_HOURS } = {}) {
  const rows = Array.isArray(events) ? events.map(mapPipelineTelemetryRow) : []
  const elapsedValues = rows.map((row) => row.elapsedMs).filter((value) => Number.isFinite(value))
  const uploadRows = rows.filter((row) => row.eventName.includes('upload_'))
  const hydrationRows = rows.filter((row) => row.eventName.includes('lead_workspace_hydration'))
  const kingstonsRows = rows.filter((row) => row.eventName.includes('kingstons_'))
  const authRows = rows.filter((row) => row.eventName.includes('supabase_auth_read'))
  const errorRows = rows.filter((row) => row.severity === 'error')
  const warningRows = rows.filter((row) => row.severity === 'warning')
  const uploadFailures = uploadRows.filter((row) => row.eventName.endsWith('_failed') || row.severity === 'error')
  const slowSaves = rows.filter((row) => row.eventName.includes('lead_record_sync_slow'))
  const linkFailures = rows.filter((row) => row.eventName.includes('listing_document_link_failed'))
  const cacheHits = rows.filter((row) => row.eventName.includes('cache_hit'))
  const slowHydration = rows.filter((row) => row.eventName === 'lead_workspace_hydration_slow')
  const successfulUploads = uploadRows.filter((row) => row.eventName.endsWith('_succeeded'))
  const uploadSuccessRate = uploadRows.length
    ? Math.round((successfulUploads.length / Math.max(successfulUploads.length + uploadFailures.length, 1)) * 100)
    : null
  const latency = {
    averageMs: elapsedValues.length ? Math.round(elapsedValues.reduce((total, value) => total + value, 0) / elapsedValues.length) : null,
    p95Ms: percentile(elapsedValues, 95),
    maxMs: elapsedValues.length ? Math.max(...elapsedValues) : null,
  }
  const counts = {
    totalEvents: rows.length,
    errors: errorRows.length,
    warnings: warningRows.length,
    uploads: uploadRows.length,
    uploadFailures: uploadFailures.length,
    successfulUploads: successfulUploads.length,
    slowLeadSaves: slowSaves.length,
    listingLinkFailures: linkFailures.length,
    hydrationEvents: hydrationRows.length,
    slowHydration: slowHydration.length,
    kingstonsEvents: kingstonsRows.length,
    authReadEvents: authRows.length,
    cacheHits: cacheHits.length,
  }
  const topEvents = Object.entries(countBy(rows, (row) => row.eventName))
    .map(([eventName, count]) => ({ eventName, count }))
    .sort((left, right) => right.count - left.count || left.eventName.localeCompare(right.eventName))
    .slice(0, 8)
  const issueRows = [...errorRows, ...warningRows]
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, 10)
  const recentEvents = rows
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, 12)
  return {
    available: true,
    status: derivePipelineDiagnosticsStatus({ events: rows, counts, latency }),
    generatedAt: new Date().toISOString(),
    since,
    hours,
    counts,
    latency,
    uploadSuccessRate,
    topEvents,
    issueRows,
    recentEvents,
    bySeverity: countBy(rows, (row) => row.severity),
    byRoute: countBy(rows, (row) => row.route || 'unknown'),
  }
}

export async function getPipelineOperationalDiagnostics({
  workspaceId = '',
  hours = DEFAULT_PIPELINE_DIAGNOSTICS_HOURS,
  limit = DEFAULT_PIPELINE_DIAGNOSTICS_LIMIT,
  client = supabase,
} = {}) {
  if (!isSupabaseConfigured || !client) {
    return {
      available: false,
      status: 'not_configured',
      reason: 'telemetry_not_configured',
      generatedAt: new Date().toISOString(),
      counts: {},
      latency: {},
      topEvents: [],
      issueRows: [],
      recentEvents: [],
    }
  }

  const normalizedHours = Math.min(Math.max(Number(hours) || DEFAULT_PIPELINE_DIAGNOSTICS_HOURS, 1), 168)
  const normalizedLimit = Math.min(Math.max(Number(limit) || DEFAULT_PIPELINE_DIAGNOSTICS_LIMIT, 1), 5000)
  const since = new Date(Date.now() - normalizedHours * 60 * 60 * 1000).toISOString()
  let query = client
    .from('telemetry_events')
    .select('id, user_id, workspace_id, category, event_name, route, severity, metadata, created_at')
    .eq('category', PIPELINE_OPERATIONAL_TELEMETRY_CATEGORY)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(normalizedLimit)
  if (normalizeText(workspaceId)) query = query.eq('workspace_id', normalizeText(workspaceId))

  const result = await query
  if (result.error) {
    if (isMissingTelemetrySchema(result.error)) {
      return {
        available: false,
        status: 'not_installed',
        reason: 'telemetry_schema_missing',
        generatedAt: new Date().toISOString(),
        counts: {},
        latency: {},
        topEvents: [],
        issueRows: [],
        recentEvents: [],
      }
    }
    throw result.error
  }

  return summarizePipelineOperationalDiagnostics(result.data || [], {
    since,
    hours: normalizedHours,
  })
}
