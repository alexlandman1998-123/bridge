import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

const SENSITIVE_KEY_PATTERN = /(password|token|secret|key|authorization|cookie|otp|session|email|phone|name)/i

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

export function redactTelemetryMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
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
  if (!isSupabaseConfigured || !supabase || !userId) {
    if (import.meta.env?.DEV) console.debug('[TELEMETRY]', { category, eventName: safeEventName, route, severity, metadata })
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
      return { persisted: false, reason: result.error.message || 'write_failed' }
    }
    return { persisted: true, id: result.data?.id || null }
  } catch (error) {
    console.warn('[TELEMETRY] event write failed.', error)
    return { persisted: false, reason: 'write_failed' }
  }
}
