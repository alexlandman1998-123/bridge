import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { trackTelemetryEvent } from './telemetry'

const SLOW_OPERATION_MS = 1500
const SLOW_ROUTE_MS = 2500

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

export async function recordPerformanceMetric({
  metricName = '',
  durationMs = null,
  value = null,
  unit = 'ms',
  userId = '',
  workspaceId = '',
  route = '',
  metadata = {},
} = {}) {
  const name = normalizeText(metricName)
  if (!name) return { persisted: false, reason: 'missing_metric_name' }
  if (!isSupabaseConfigured || !supabase || !userId) return { persisted: false, reason: 'not_persisted' }

  try {
    const result = await supabase
      .from('performance_metrics')
      .insert({
        user_id: normalizeText(userId) || null,
        workspace_id: normalizeText(workspaceId) || null,
        metric_name: name,
        route: normalizeText(route) || (typeof window !== 'undefined' ? window.location.pathname : null),
        duration_ms: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
        value: Number.isFinite(Number(value)) ? Number(value) : null,
        unit,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      })
      .select('id')
      .maybeSingle()

    if (result.error) {
      if (isMissingSchemaError(result.error, 'performance_metrics')) return { persisted: false, reason: 'schema_missing' }
      return { persisted: false, reason: result.error.message || 'write_failed' }
    }
    return { persisted: true, id: result.data?.id || null }
  } catch (error) {
    console.warn('[PERFORMANCE] metric write failed.', error)
    return { persisted: false, reason: 'write_failed' }
  }
}

export async function measureAsyncOperation(metricName, task, context = {}) {
  const started = performance.now()
  try {
    const result = await task()
    const durationMs = performance.now() - started
    void recordPerformanceMetric({ ...context, metricName, durationMs })
    if (durationMs > SLOW_OPERATION_MS) {
      void trackTelemetryEvent({
        category: 'performance',
        eventName: 'slow_operation',
        severity: 'warning',
        userId: context.userId,
        workspaceId: context.workspaceId,
        route: context.route,
        metadata: { metricName, durationMs },
      })
    }
    return result
  } catch (error) {
    const durationMs = performance.now() - started
    void recordPerformanceMetric({ ...context, metricName, durationMs, metadata: { failed: true } })
    throw error
  }
}

export function createRoutePerformanceMarker(route) {
  const started = performance.now()
  return {
    finish(context = {}) {
      const durationMs = performance.now() - started
      void recordPerformanceMetric({ ...context, metricName: 'route_transition', route, durationMs })
      if (durationMs > SLOW_ROUTE_MS) {
        void trackTelemetryEvent({
          category: 'performance',
          eventName: 'slow_route_transition',
          severity: 'warning',
          userId: context.userId,
          workspaceId: context.workspaceId,
          route,
          metadata: { durationMs },
        })
      }
      return durationMs
    },
  }
}
