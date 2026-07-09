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

function isMissingSecurityAuditTableError(error) {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return error.code === '42P01' || error.code === 'PGRST205' || message.includes('security_audit_events')
}

function isMissingSecurityAuditRpcError(error) {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return error.code === '42883' || error.code === 'PGRST202' || message.includes('bridge_record_security_audit_event')
}

function isAuditPolicyBlockedError(error) {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return error.code === '42501' || message.includes('row-level security')
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

  const rpcResult = await supabase.rpc('bridge_record_security_audit_event', {
    p_user_id: payload.user_id,
    p_workspace_id: payload.workspace_id,
    p_action: payload.action,
    p_target_type: payload.target_type,
    p_target_id: payload.target_id,
    p_metadata: payload.metadata,
  })

  if (!rpcResult.error) {
    const response = rpcResult.data && typeof rpcResult.data === 'object' ? rpcResult.data : {}
    if (response.success === false || response.persisted === false) {
      const reason = response.code || response.reason || 'rpc_rejected'
      console.warn('[AUDIT] security audit event was not persisted.', {
        action: safeAction,
        targetType: payload.target_type,
        reason,
      })
      return { persisted: false, reason }
    }
    return { persisted: true, id: response.id || null, via: 'rpc' }
  }

  if (!isMissingSecurityAuditRpcError(rpcResult.error)) {
    const reason = rpcResult.error.code || 'rpc_error'
    console.warn('[AUDIT] security audit event was not persisted.', {
      action: safeAction,
      targetType: payload.target_type,
      reason,
      message: rpcResult.error.message,
    })
    return { persisted: false, reason, error: rpcResult.error }
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
    if (isMissingSecurityAuditTableError(result.error)) {
      console.warn('[AUDIT] security_audit_events table is unavailable; event was not persisted.', {
        action: safeAction,
        targetType: payload.target_type,
      })
      return { persisted: false, reason: 'table_missing' }
    }
    if (isAuditPolicyBlockedError(result.error)) {
      console.warn('[AUDIT] security audit event insert was blocked by policy; event was not persisted.', {
        action: safeAction,
        targetType: payload.target_type,
        reason: result.error.code || 'policy_blocked',
      })
      return { persisted: false, reason: 'policy_blocked', error: result.error }
    }
    console.warn('[AUDIT] security audit event was not persisted.', {
      action: safeAction,
      targetType: payload.target_type,
      reason: result.error.code || 'insert_failed',
      message: result.error.message,
    })
    return { persisted: false, reason: result.error.code || 'insert_failed', error: result.error }
  }

  return { persisted: true, id: result.data?.id || null, via: 'direct_insert' }
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
