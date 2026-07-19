import { requireClient } from './attorneyFirmServiceShared.js'
import {
  buildTransactionProgressSnapshot,
  presentTransactionProgress,
} from '../core/transactions/sharedTransactionProgressContract.js'

function mapRow(row = {}) {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    processKey: row.process_key,
    processLabel: row.process_label,
    stepKey: row.step_key,
    status: row.status,
    responsibleRole: row.responsible_role,
    blocked: Boolean(row.blocked),
    safeExplanation: row.safe_explanation || null,
    expectedNextStep: row.expected_next_step || null,
    visibility: row.visibility,
    professional: {
      title: row.professional_title,
      description: row.professional_description,
    },
    client: row.client_title && row.client_description
      ? { title: row.client_title, description: row.client_description }
      : null,
    sourceType: row.source_type,
    sourceId: row.source_id || null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}

function mapNotificationRow(row = {}) {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    progressId: row.transaction_shared_progress_id || null,
    channel: row.channel,
    status: row.status,
    recipientRole: row.recipient_role || null,
    recipientAddress: row.recipient_address || row.recipient_email || null,
    subject: row.subject || null,
    messagePreview: row.message_preview || null,
    attemptCount: Number(row.dispatch_attempt_count || 0),
    maxAttempts: Number(row.max_dispatch_attempts || 0),
    lastAttemptAt: row.last_dispatch_attempt_at || null,
    nextAttemptAt: row.next_dispatch_attempt_at || null,
    error: row.last_dispatch_error || row.error_message || null,
    resendOfEventId: row.resend_of_event_id || null,
    sentAt: row.sent_at || null,
    deliveredAt: row.delivered_at || null,
    createdAt: row.created_at || null,
  }
}

async function invokeProgressNotificationDispatch(client, body) {
  if (!client?.functions?.invoke) {
    return { attempted: false, queued: true, reason: 'edge_function_client_unavailable' }
  }
  const result = await client.functions.invoke('send-email', { body })
  if (result.error) {
    console.warn('[transaction-progress] Email dispatch deferred; queued jobs remain available for retry.', result.error)
    return { attempted: true, queued: true, error: result.error.message || 'dispatch_failed' }
  }
  return { attempted: true, queued: false, ...(result.data || {}) }
}

export async function publishTransactionSharedProgress({
  client: providedClient = null,
  definition,
  transactionId,
  status,
  visibility = null,
  safeExplanation = '',
  expectedNextStep = '',
  sourceType = 'workflow',
  sourceId = null,
} = {}) {
  const client = providedClient || requireClient()
  const snapshot = buildTransactionProgressSnapshot(definition, {
    transactionId,
    status,
    visibility,
    blocked: status === 'blocked',
    safeExplanation,
    expectedNextStep,
  })

  const result = await client.rpc('bridge_publish_transaction_shared_progress_phase2', {
    p_transaction_id: snapshot.transactionId,
    p_process_key: snapshot.processKey,
    p_process_label: snapshot.processLabel,
    p_step_key: snapshot.stepKey,
    p_status: snapshot.status,
    p_responsible_role: snapshot.responsibleRole,
    p_blocked: snapshot.blocked,
    p_safe_explanation: snapshot.safeExplanation,
    p_expected_next_step: snapshot.expectedNextStep,
    p_visibility: snapshot.visibility,
    p_professional_title: snapshot.professional.title,
    p_professional_description: snapshot.professional.description,
    p_client_title: snapshot.client?.title || null,
    p_client_description: snapshot.client?.description || null,
    p_source_type: sourceType,
    p_source_id: sourceId ? String(sourceId) : null,
  })
  if (result.error) throw result.error
  if (!result.data) return null
  const progress = mapRow(result.data)
  progress.notificationDispatch = await invokeProgressNotificationDispatch(client, {
    type: 'transaction_progress_dispatch',
    transactionId: snapshot.transactionId,
    limit: 25,
  }).catch((error) => ({ attempted: true, queued: true, error: error?.message || 'dispatch_failed' }))
  return progress
}

export async function getTransactionSharedProgress(transactionId, {
  client: providedClient = null,
  viewerRole = null,
  canViewPrivate = false,
} = {}) {
  const client = providedClient || requireClient()
  if (!transactionId) return []
  const clientSafeSelection = 'id, transaction_id, process_key, process_label, step_key, status, responsible_role, blocked, safe_explanation, expected_next_step, visibility, client_title, client_description, source_type, source_id, updated_at, created_at'
  const selection = ['buyer', 'seller', 'client'].includes(String(viewerRole || '').trim().toLowerCase())
    ? clientSafeSelection
    : '*'
  const result = await client
    .from('transaction_shared_progress')
    .select(selection)
    .eq('transaction_id', transactionId)
    .order('updated_at', { ascending: false })
  if (result.error) throw result.error
  const rows = (result.data || []).map(mapRow)
  if (!viewerRole) return rows
  return rows
    .map((row) => presentTransactionProgress(row, { viewerRole, canViewPrivate }))
    .filter(Boolean)
}

export async function getTransactionProgressNotifications(transactionId, {
  client: providedClient = null,
  limit = 100,
} = {}) {
  const client = providedClient || requireClient()
  if (!transactionId) return []
  const result = await client
    .from('notification_events')
    .select('id, transaction_id, transaction_shared_progress_id, channel, status, recipient_role, recipient_address, recipient_email, subject, message_preview, dispatch_attempt_count, max_dispatch_attempts, last_dispatch_attempt_at, next_dispatch_attempt_at, last_dispatch_error, error_message, resend_of_event_id, sent_at, delivered_at, created_at')
    .eq('transaction_id', transactionId)
    .eq('automation_key', 'transaction_progress_changed')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 250)))
  if (result.error) throw result.error
  return (result.data || []).map(mapNotificationRow)
}

export async function resendTransactionProgressNotification(eventId, {
  client: providedClient = null,
} = {}) {
  const client = providedClient || requireClient()
  if (!eventId) throw new Error('Notification event id is required.')
  const result = await invokeProgressNotificationDispatch(client, {
    type: 'transaction_progress_resend',
    eventId,
    resend: true,
    limit: 1,
  })
  if (result.error) throw new Error(result.error)
  return result
}

function mapPropagationAudit(row = {}) {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    gapCount: Number(row.gap_count || 0),
    repairedCount: Number(row.repaired_count || 0),
    health: row.health_json || {},
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
  }
}

export async function getTransactionProgressPropagationHealth({
  client: providedClient = null,
  transactionId = null,
  staleSeconds = 120,
  includeHistory = true,
  historyLimit = 12,
} = {}) {
  const client = providedClient || requireClient()
  const result = await client.rpc('bridge_transaction_progress_propagation_health_phase6', {
    p_transaction_id: transactionId || null,
    p_stale_seconds: Math.max(30, Math.min(Number(staleSeconds) || 120, 86_400)),
  })
  if (result.error) throw result.error
  const health = result.data || { status: 'unknown', gapCount: 0, counts: {}, gaps: [] }
  if (!includeHistory || transactionId) return health

  const history = await client
    .from('transaction_progress_propagation_audits')
    .select('id, source, status, gap_count, repaired_count, health_json, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(historyLimit) || 12, 50)))
  if (history.error) throw history.error
  return { ...health, recentAudits: (history.data || []).map(mapPropagationAudit) }
}

export async function reconcileTransactionProgressPropagation({
  client: providedClient = null,
  transactionId = null,
  limit = 250,
  source = 'platform_diagnostics_phase6',
} = {}) {
  const client = providedClient || requireClient()
  const result = await client.rpc('bridge_reconcile_transaction_progress_phase6', {
    p_transaction_id: transactionId || null,
    p_limit: Math.max(1, Math.min(Number(limit) || 250, 1000)),
    p_source: String(source || 'platform_diagnostics_phase6').slice(0, 100),
  })
  if (result.error) throw result.error
  return result.data || { status: 'unknown', gapCount: 0, counts: {}, gaps: [], repairs: { total: 0 } }
}

export async function getTransactionProgressRolloutState({
  client: providedClient = null,
  environment = 'production',
} = {}) {
  const client = providedClient || requireClient()
  const result = await client.rpc('bridge_transaction_progress_rollout_state_phase7', {
    p_environment: String(environment || 'production').trim().toLowerCase(),
  })
  if (result.error) throw result.error
  return result.data || { environment, rolloutMode: 'audit_only', canaryPercent: 10, autoRepairEnabled: false, history: [], recentRuns: [] }
}

export async function setTransactionProgressRollout({
  client: providedClient = null,
  environment = 'production',
  rolloutMode = 'audit_only',
  canaryPercent = 10,
  changeReason,
} = {}) {
  const client = providedClient || requireClient()
  const reason = String(changeReason || '').trim()
  if (reason.length < 8) throw new Error('Provide a rollout change reason of at least 8 characters.')
  const result = await client.rpc('bridge_set_transaction_progress_rollout_phase7', {
    p_environment: String(environment || 'production').trim().toLowerCase(),
    p_rollout_mode: String(rolloutMode || 'audit_only').trim().toLowerCase(),
    p_canary_percent: Math.max(1, Math.min(Number(canaryPercent) || 10, 100)),
    p_change_reason: reason.slice(0, 500),
  })
  if (result.error) throw result.error
  return result.data
}

export async function runTransactionProgressRolloutAssurance({
  client: providedClient = null,
  environment = 'production',
  source = 'platform_diagnostics_phase7',
  limit = 50,
} = {}) {
  const client = providedClient || requireClient()
  const result = await client.rpc('bridge_run_transaction_progress_assurance_phase7', {
    p_environment: String(environment || 'production').trim().toLowerCase(),
    p_source: String(source || 'platform_diagnostics_phase7').trim().slice(0, 100),
    p_limit: Math.max(1, Math.min(Number(limit) || 50, 1000)),
  })
  if (result.error) throw result.error
  return result.data || { rolloutMode: 'audit_only', decision: 'audit_only', repairedCount: 0, alertRequired: false }
}

export async function getNotificationRecipientPreferences(organisationId, {
  client: providedClient = null,
} = {}) {
  const client = providedClient || requireClient()
  if (!organisationId) return []
  const result = await client
    .from('notification_recipient_preferences')
    .select('id, organisation_id, recipient_email, email_enabled, whatsapp_enabled, disabled_reason, bounced_at, complained_at, suppressed_at, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .order('updated_at', { ascending: false })
  if (result.error) throw result.error
  return (result.data || []).map((row) => ({
    id: row.id,
    organisationId: row.organisation_id,
    recipientEmail: row.recipient_email,
    emailEnabled: row.email_enabled !== false,
    whatsappEnabled: row.whatsapp_enabled === true,
    disabledReason: row.disabled_reason || null,
    bouncedAt: row.bounced_at || null,
    complainedAt: row.complained_at || null,
    suppressedAt: row.suppressed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function setNotificationRecipientPreference({
  organisationId,
  recipientEmail,
  emailEnabled = true,
  whatsappEnabled = false,
  client: providedClient = null,
} = {}) {
  const client = providedClient || requireClient()
  const result = await client.rpc('bridge_set_notification_recipient_preference_phase4', {
    p_organisation_id: organisationId,
    p_recipient_email: String(recipientEmail || '').trim().toLowerCase(),
    p_email_enabled: Boolean(emailEnabled),
    p_whatsapp_enabled: Boolean(whatsappEnabled),
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function getTransactionProgressNotificationHealth(organisationId, {
  client: providedClient = null,
} = {}) {
  const client = providedClient || requireClient()
  if (!organisationId) throw new Error('Organisation id is required.')
  const result = await client.rpc('bridge_transaction_progress_notification_health_phase4', {
    p_organisation_id: organisationId,
  })
  if (result.error) throw result.error
  return result.data || {}
}
