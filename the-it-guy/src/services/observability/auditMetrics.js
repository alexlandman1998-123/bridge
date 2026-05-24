import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

async function safeCount(table, filters = []) {
  if (!isSupabaseConfigured || !supabase) return 0
  let query = supabase.from(table).select('id', { count: 'exact', head: true })
  for (const filter of filters) {
    query = query[filter.fn](filter.column, filter.value)
  }
  const result = await query
  if (result.error) {
    if (isMissingSchemaError(result.error, table)) return 0
    throw result.error
  }
  return result.count || 0
}

export async function getAuditMetrics() {
  const [securityEvents, onboardingEvents, errorEvents, telemetryEvents, performanceMetrics] = await Promise.all([
    safeCount('security_audit_events'),
    safeCount('onboarding_events'),
    safeCount('error_events'),
    safeCount('telemetry_events'),
    safeCount('performance_metrics'),
  ])
  return {
    securityEvents,
    onboardingEvents,
    errorEvents,
    telemetryEvents,
    performanceMetrics,
  }
}

export async function getRecentOperationalEvents(limit = 25) {
  if (!isSupabaseConfigured || !supabase) return []
  const result = await supabase
    .from('telemetry_events')
    .select('id, category, event_name, route, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (result.error) {
    if (isMissingSchemaError(result.error, 'telemetry_events')) return []
    throw result.error
  }
  return result.data || []
}
