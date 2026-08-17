import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { isBackendDegraded, markBackendDegraded } from './backendDegradation.js'

const SENSITIVE_KEY_PATTERN = /(password|token|secret|key|authorization|cookie|otp|session|email|phone|name)/i
const TELEMETRY_BACKEND_DEGRADED_TTL_MS = 120_000
const TELEMETRY_FAILURE_LOG_COOLDOWN_MS = 30_000
let telemetryFailureLastWarnedAt = 0

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

function isTransientTelemetryError(error) {
  const rawStatus = error?.status ?? error?.statusCode
  const status = Number(rawStatus)
  const hasStatus = rawStatus !== undefined && rawStatus !== null && Number.isFinite(status)
  const code = String(error?.code || error?.name || '').toLowerCase()
  const message = String(error?.message || error || '').toLowerCase()
  return (
    (hasStatus && (status === 0 || status === 408 || status === 429 || status >= 500)) ||
    code.includes('abort') ||
    code.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('err_connection_closed')
  )
}

function warnTelemetryFailureOnce(error) {
  const now = Date.now()
  if (telemetryFailureLastWarnedAt && now - telemetryFailureLastWarnedAt < TELEMETRY_FAILURE_LOG_COOLDOWN_MS) return
  telemetryFailureLastWarnedAt = now
  console.warn('[TELEMETRY] event write failed; backing off telemetry persistence.', error)
}

export function redactTelemetryMetadata(metadata = {}) {
  if (Array.isArray(metadata)) {
    return metadata.slice(0, 50).map((item) => {
      if (item && typeof item === 'object') return redactTelemetryMetadata(item)
      if (typeof item === 'string' && item.length > 500) return `${item.slice(0, 500)}...`
      return item
    })
  }
  if (!metadata || typeof metadata !== 'object') return {}
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) return [key, '[redacted]']
      if (value && typeof value === 'object') return [key, redactTelemetryMetadata(value)]
      if (typeof value === 'string' && value.length > 500) return [key, `${value.slice(0, 500)}...`]
      return [key, value]
    }),
  )
}

export async function trackTelemetryEvent({
  category = 'system',
  eventName = '',
  userId = '',
  workspaceId = '',
  route = '',
  severity = 'info',
  metadata = {},
} = {}) {
  const safeEventName = normalizeText(eventName)
  if (!safeEventName) return { persisted: false, reason: 'missing_event_name' }
  if (isBackendDegraded()) return { persisted: false, reason: 'backend_degraded' }
  if (!isSupabaseConfigured || !supabase || !userId) {
    if (import.meta.env.DEV) console.debug('[TELEMETRY]', { category, eventName: safeEventName, route, severity, metadata })
    return { persisted: false, reason: 'not_persisted' }
  }

  try {
    const result = await supabase
      .from('telemetry_events')
      .insert({
        user_id: normalizeText(userId) || null,
        workspace_id: normalizeText(workspaceId) || null,
        category: normalizeText(category) || 'system',
        event_name: safeEventName,
        route: normalizeText(route) || (typeof window !== 'undefined' ? window.location.pathname : null),
        severity: normalizeText(severity) || 'info',
        metadata: redactTelemetryMetadata(metadata),
      })
      .select('id')
      .maybeSingle()

    if (result.error) {
      if (isMissingSchemaError(result.error, 'telemetry_events')) return { persisted: false, reason: 'schema_missing' }
      if (isTransientTelemetryError(result.error)) {
        markBackendDegraded({ ttlMs: TELEMETRY_BACKEND_DEGRADED_TTL_MS })
        return { persisted: false, reason: result.error.message || 'backend_degraded' }
      }
      return { persisted: false, reason: result.error.message || 'write_failed' }
    }
    return { persisted: true, id: result.data?.id || null }
  } catch (error) {
    markBackendDegraded({ ttlMs: TELEMETRY_BACKEND_DEGRADED_TTL_MS })
    warnTelemetryFailureOnce(error)
    return { persisted: false, reason: 'write_failed' }
  }
}
