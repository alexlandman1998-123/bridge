import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { recordSecurityAuditEvent } from '../auditLogService'
import { normalizeValidationError } from './validationErrors'

function normalizeText(value) {
  return String(value || '').trim()
}

function safeMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export async function logPlatformError(error, context = {}) {
  const normalized = normalizeValidationError(error)
  const payload = {
    userId: normalizeText(context.userId),
    workspaceId: normalizeText(context.workspaceId),
    action: context.operation || normalized.code || 'platform_error',
    targetType: context.entityType || normalized.entityType || 'platform',
    targetId: context.entityId || normalized.entityId || '',
    metadata: {
      errorType: normalized.name,
      code: normalized.code,
      severity: normalized.severity,
      message: normalized.message,
      ...safeMetadata(normalized.metadata),
      ...safeMetadata(context.metadata),
    },
  }

  try {
    await recordSecurityAuditEvent(payload)
  } catch (auditError) {
    console.warn('[ERROR] audit log write failed.', auditError)
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('integrity_logs').insert({
        entity_type: payload.targetType,
        entity_id: payload.targetId || null,
        workspace_id: payload.workspaceId || null,
        user_id: payload.userId || null,
        issue_code: normalized.code,
        severity: normalized.severity || 'error',
        message: normalized.message,
        metadata: payload.metadata,
      })
    } catch (integrityError) {
      console.warn('[ERROR] integrity log write failed.', integrityError)
    }
  }

  return {
    code: normalized.code,
    severity: normalized.severity,
    userMessage: normalized.userMessage,
    supportMessage: normalized.message,
  }
}

export function getUserSafeError(error, fallback = 'Something needs attention before this can continue.') {
  const normalized = normalizeValidationError(error, fallback)
  return normalized.userMessage || fallback
}
