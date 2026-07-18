import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'
import { assessDocumentExperienceLaunchHealth } from '../core/documents/documentExperienceLaunchGate.js'

function missingTelemetrySchema(error = {}) {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return ['42p01', '42703', 'pgrst204', 'pgrst205'].includes(code) || message.includes('telemetry_events')
}

export function mapDocumentExperienceTelemetryRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    event_name: row?.event_name || '',
    severity: row?.severity || 'info',
    created_at: row?.created_at || '',
    metadata: row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
  }))
}

export async function fetchDocumentExperienceLaunchEvidence({ since = '', limit = 5000, client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) return { available: false, reason: 'telemetry_not_configured', events: [] }
  let query = client
    .from('telemetry_events')
    .select('event_name, severity, created_at, metadata')
    .eq('category', 'document_experience')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 1, 1), 5000))
  if (String(since || '').trim()) query = query.gte('created_at', String(since).trim())
  const result = await query
  if (result.error) {
    if (missingTelemetrySchema(result.error)) return { available: false, reason: 'telemetry_schema_missing', events: [] }
    return { available: false, reason: result.error.message || 'telemetry_read_failed', events: [] }
  }
  return { available: true, reason: null, events: mapDocumentExperienceTelemetryRows(result.data) }
}

export async function evaluateDocumentExperienceLaunchHealth({ n1 = null, n2 = null, since = '', limit = 5000, browserEvents = [], evidenceLoader = fetchDocumentExperienceLaunchEvidence } = {}) {
  const evidence = await evidenceLoader({ since, limit })
  return assessDocumentExperienceLaunchHealth({
    n1,
    n2,
    telemetryAvailable: evidence?.available === true,
    events: [...(Array.isArray(evidence?.events) ? evidence.events : []), ...(Array.isArray(browserEvents) ? browserEvents : [])],
  })
}
