import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { trackTelemetryEvent } from './telemetry.js'

const SLOW_OPERATION_MS = 1500
const SLOW_ROUTE_MS = 2500
export const PERFORMANCE_BUDGETS_MS = Object.freeze({
  'legal_document.generation.status_lookup': 2500,
  'legal_document.generation.seller_onboarding': 3000,
  'legal_document.generation.template_lookup': 3000,
  'legal_document.generation.packet_prepare': 5000,
  'legal_document.generation.render_save': 45000,
  'legal_document.generation.total': 65000,
  'legal_document.signing.signer_readiness': 8000,
  'legal_document.signing.email_delivery': 10000,
  'legal_document.signing.total': 15000,
})

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

export function getPerformanceBudgetMs(metricName = '', explicitBudgetMs = null) {
  const explicit = Number(explicitBudgetMs)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const name = normalizeText(metricName)
  const configured = Number(PERFORMANCE_BUDGETS_MS[name])
  return Number.isFinite(configured) && configured > 0 ? configured : null
}

export function isPerformanceBudgetBreached({ metricName = '', durationMs = null, budgetMs = null } = {}) {
  const duration = Number(durationMs)
  const budget = getPerformanceBudgetMs(metricName, budgetMs)
  return Number.isFinite(duration) && Number.isFinite(budget) && duration > budget
}

export async function recordPerformanceMetric({
  metricName = '',
  durationMs = null,
  performanceBudgetMs = null,
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
  const numericDurationMs = Number.isFinite(Number(durationMs)) ? Number(durationMs) : null
  const budgetMs = getPerformanceBudgetMs(name, performanceBudgetMs)
  const metricMetadata = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    ...(Number.isFinite(Number(budgetMs)) ? { performanceBudgetMs: budgetMs } : {}),
  }

  try {
    const result = await supabase
      .from('performance_metrics')
      .insert({
        user_id: normalizeText(userId) || null,
        workspace_id: normalizeText(workspaceId) || null,
        metric_name: name,
        route: normalizeText(route) || (typeof window !== 'undefined' ? window.location.pathname : null),
        duration_ms: numericDurationMs,
        value: Number.isFinite(Number(value)) ? Number(value) : null,
        unit,
        metadata: metricMetadata,
      })
      .select('id')
      .maybeSingle()

    if (result.error) {
      if (isMissingSchemaError(result.error, 'performance_metrics')) return { persisted: false, reason: 'schema_missing' }
      return { persisted: false, reason: result.error.message || 'write_failed' }
    }
    if (isPerformanceBudgetBreached({ metricName: name, durationMs: numericDurationMs, budgetMs })) {
      void trackTelemetryEvent({
        category: 'performance',
        eventName: 'performance_budget_breached',
        severity: 'warning',
        userId,
        workspaceId,
        route,
        metadata: {
          metric: name,
          durationMs: numericDurationMs,
          budgetMs,
          overBudgetMs: Math.round(numericDurationMs - budgetMs),
          unit,
          ...metricMetadata,
        },
      })
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
