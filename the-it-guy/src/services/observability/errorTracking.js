import { getDeploymentEnvironment } from '../../config/productionValidation'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { recordSecurityAuditEvent } from '../auditLogService'
import { redactTelemetryMetadata, trackTelemetryEvent } from './telemetry'

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

export function categorizeError(error, fallback = 'api_error') {
  const text = `${error?.name || ''} ${error?.message || ''} ${error?.code || ''}`.toLowerCase()
  if (text.includes('auth') || text.includes('session') || text.includes('jwt')) return 'auth_error'
  if (text.includes('onboarding')) return 'onboarding_error'
  if (text.includes('workspace') || text.includes('organisation')) return 'workspace_error'
  if (text.includes('permission') || text.includes('access denied') || text.includes('rls')) return 'permission_error'
  if (text.includes('validation')) return 'validation_error'
  if (text.includes('integrity')) return 'integrity_error'
  if (text.includes('transaction')) return 'transaction_error'
  if (text.includes('render') || text.includes('component')) return 'ui_error'
  return fallback
}

export async function reportError(error, {
  userId = '',
  workspaceId = '',
  route = '',
  operation = '',
  category = '',
  severity = 'error',
  metadata = {},
} = {}) {
  const safeCategory = category || categorizeError(error)
  const safeMessage = normalizeText(error?.message) || 'Unknown error'
  const safeRoute = normalizeText(route) || (typeof window !== 'undefined' ? window.location.pathname : '')
  const safeUserId = normalizeText(userId)

  try {
    if (isSupabaseConfigured && supabase && safeUserId) {
      const result = await supabase
        .from('error_events')
        .insert({
          user_id: safeUserId,
          workspace_id: normalizeText(workspaceId) || null,
          route: safeRoute || null,
          operation: normalizeText(operation) || null,
          category: safeCategory,
          severity,
          message: safeMessage,
          stack: import.meta.env.DEV ? normalizeText(error?.stack) || null : null,
          environment: getDeploymentEnvironment(),
          metadata: redactTelemetryMetadata(metadata),
        })
        .select('id')
        .maybeSingle()
      if (result.error && !isMissingSchemaError(result.error, 'error_events')) throw result.error
    }
  } catch (writeError) {
    console.warn('[ERROR_TRACKING] error event write failed.', writeError)
  }

  try {
    await trackTelemetryEvent({
      category: 'error',
      eventName: safeCategory,
      userId: safeUserId,
      workspaceId,
      route: safeRoute,
      severity,
      metadata: { operation, message: safeMessage, ...metadata },
    })
  } catch (telemetryError) {
    console.warn('[ERROR_TRACKING] telemetry write failed.', telemetryError)
  }

  try {
    await recordSecurityAuditEvent({
      userId: safeUserId,
      workspaceId,
      action: 'system_error_recorded',
      targetType: 'error',
      targetId: '',
      metadata: { category: safeCategory, operation, severity },
    })
  } catch (auditError) {
    console.warn('[ERROR_TRACKING] audit write failed.', auditError)
  }

  return {
    category: safeCategory,
    message: safeMessage,
    userMessage: 'Something went wrong. Bridge has logged the issue for review.',
  }
}
