import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function normalizeText(value) {
  return String(value || '').trim()
}

function isWorkspaceForeignKeyError(error) {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return (
    String(error.code || '').toLowerCase() === '23503' &&
    (message.includes('workspace_id') || message.includes('security_audit_events_workspace_id_fkey'))
  )
}

export async function recordSecurityAuditEvent({
  userId = '',
  workspaceId = '',
  action = '',
  targetType = '',
  targetId = '',
  metadata = {},
} = {}) {
  if (!isSupabaseConfigured || !supabase) return { persisted: false, reason: 'supabase_not_configured' }

  const safeAction = normalizeText(action)
  if (!safeAction) return { persisted: false, reason: 'missing_action' }
  const normalizedWorkspaceId = normalizeText(workspaceId)

  const payload = {
    user_id: normalizeText(userId) || null,
    workspace_id: normalizedWorkspaceId || null,
    action: safeAction,
    target_type: normalizeText(targetType) || null,
    target_id: normalizeText(targetId) || null,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  }

  let result = await supabase
    .from('security_audit_events')
    .insert(payload)
    .select('id')
    .single()

  if (result.error && normalizedWorkspaceId && isWorkspaceForeignKeyError(result.error)) {
    console.warn('[AUDIT] workspace_id is not organisation-backed; recording audit event without FK workspace.', {
      action: safeAction,
      targetType: payload.target_type,
    })
    result = await supabase
      .from('security_audit_events')
      .insert({
        ...payload,
        workspace_id: null,
        metadata: {
          ...payload.metadata,
          workspaceId: normalizedWorkspaceId,
          workspaceForeignKeySkipped: true,
        },
      })
      .select('id')
      .single()
  }

  if (result.error) {
    const message = `${result.error.message || ''} ${result.error.details || ''}`.toLowerCase()
    if (result.error.code === '42P01' || result.error.code === 'PGRST205' || message.includes('security_audit_events')) {
      console.warn('[AUDIT] security_audit_events table is not installed; event was not persisted.', {
        action: safeAction,
        targetType: payload.target_type,
      })
      return { persisted: false, reason: 'table_missing' }
    }
    throw result.error
  }

  return { persisted: true, id: result.data?.id || null }
}

export function recordAuthAuditEvent(action, context = {}) {
  return recordSecurityAuditEvent({
    userId: context.userId,
    workspaceId: context.workspaceId,
    action,
    targetType: 'auth',
    targetId: context.userId,
    metadata: context.metadata || {},
  })
}

export function recordWorkspaceAuditEvent(action, context = {}) {
  return recordSecurityAuditEvent({
    userId: context.userId,
    workspaceId: context.workspaceId,
    action,
    targetType: context.targetType || 'workspace',
    targetId: context.targetId || context.workspaceId,
    metadata: context.metadata || {},
  })
}

export function recordTransactionAuditEvent(action, context = {}) {
  return recordSecurityAuditEvent({
    userId: context.userId,
    workspaceId: context.workspaceId,
    action,
    targetType: 'transaction',
    targetId: context.transactionId,
    metadata: context.metadata || {},
  })
}

export function recordPermissionAuditEvent(action, context = {}) {
  return recordSecurityAuditEvent({
    userId: context.userId,
    workspaceId: context.workspaceId,
    action,
    targetType: 'permission',
    targetId: context.permission || '',
    metadata: context.metadata || {},
  })
}
