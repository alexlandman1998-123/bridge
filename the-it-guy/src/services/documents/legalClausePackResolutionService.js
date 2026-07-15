import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { buildLegalClausePackEscalationPlan } from './legalClausePackEscalationService.js'
import { getLegalClausePackOperationalDiagnosticsSnapshot } from './legalClausePackOperationalDiagnosticsService.js'

export const LEGAL_CLAUSE_PACK_RESOLUTION_VERSION = 'sa_legal_clause_pack_resolution_v1'

const ESCALATION_SOURCE = 'legal_clause_pack_phase9_escalation'
const ESCALATION_DEDUPE_PREFIX = 'legal-otp-escalation:'
const SLA_HOURS = Object.freeze({ critical: 2, high: 24, normal: 48 })

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseTime(value) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function hoursSince(value, nowMs) {
  const timestamp = parseTime(value)
  return timestamp === null ? 0 : Math.max(0, (nowMs - timestamp) / 3_600_000)
}

function notificationActionId(notification = {}) {
  const eventData = asRecord(notification.event_data || notification.eventData)
  const dedupeKey = normalizeText(notification.dedupe_key || notification.dedupeKey)
  if (dedupeKey.startsWith(ESCALATION_DEDUPE_PREFIX)) {
    return dedupeKey.slice(ESCALATION_DEDUPE_PREFIX.length).split(':')[0]
  }
  return normalizeText(eventData.actionId || eventData.action_id)
}

function isPhase9Notification(notification = {}) {
  const eventData = asRecord(notification.event_data || notification.eventData)
  return normalizeText(eventData.source) === ESCALATION_SOURCE || normalizeText(notification.dedupe_key || notification.dedupeKey).startsWith(ESCALATION_DEDUPE_PREFIX)
}

function notificationIsRead(notification = {}) {
  return notification.is_read === true || notification.isRead === true || Boolean(notification.read_at || notification.readAt)
}

function latestCreatedAt(notifications = []) {
  return [...notifications]
    .map((notification) => normalizeText(notification.created_at || notification.createdAt))
    .filter(Boolean)
    .sort()
    .at(-1) || null
}

function resolutionDetail(state, action, notifications, nowMs) {
  const oldestUnreadAt = notifications
    .filter((notification) => !notificationIsRead(notification))
    .map((notification) => normalizeText(notification.created_at || notification.createdAt))
    .filter(Boolean)
    .sort()[0] || null
  const ageHours = hoursSince(oldestUnreadAt, nowMs)
  const details = {
    unroutable: action.skipReason,
    notification_missing: 'The finding is still active, but no matching Phase 9 notification evidence was found.',
    overdue_unread: `The finding is still active and its latest notification has been unread for ${Math.floor(ageHours)} hours.`,
    awaiting_acknowledgement: 'The finding is still active and at least one assigned reviewer has not acknowledged the notification.',
    acknowledged_unresolved: 'The assigned reviewers acknowledged the notification, but the underlying OTP finding is still active.',
  }
  return details[state] || 'Review the current OTP finding and its notification evidence.'
}

function currentResolutionState(action, notifications, nowMs) {
  if (!action.executable) return 'unroutable'
  if (!notifications.length) return 'notification_missing'
  const hasUnread = notifications.some((notification) => !notificationIsRead(notification))
  if (!hasUnread) return 'acknowledged_unresolved'
  const slaHours = SLA_HOURS[action.priority] || SLA_HOURS.normal
  const overdue = notifications
    .filter((notification) => !notificationIsRead(notification))
    .some((notification) => hoursSince(notification.created_at || notification.createdAt, nowMs) > slaHours)
  return overdue ? 'overdue_unread' : 'awaiting_acknowledgement'
}

function stateSeverity(state, priority = 'normal') {
  if (state === 'notification_missing' || state === 'overdue_unread') return 'critical'
  if (state === 'unroutable' || state === 'acknowledged_unresolved') return priority === 'critical' ? 'critical' : 'warning'
  if (state === 'awaiting_acknowledgement') return 'warning'
  return 'healthy'
}

function isMissingSchemaError(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return ['42p01', '42703', 'pgrst204', 'pgrst205'].includes(code) || message.includes('does not exist')
}

export function buildLegalClausePackResolutionReport({
  diagnostics = null,
  notifications = [],
  generatedAt = new Date().toISOString(),
  queryWarnings = [],
} = {}) {
  const plan = buildLegalClausePackEscalationPlan({ diagnostics, generatedAt })
  const nowMs = parseTime(generatedAt) || Date.now()
  const phase9Notifications = asArray(notifications).filter(isPhase9Notification)
  const notificationsByActionId = phase9Notifications.reduce((groups, notification) => {
    const actionId = notificationActionId(notification)
    if (!actionId) return groups
    if (!groups[actionId]) groups[actionId] = []
    groups[actionId].push(notification)
    return groups
  }, {})
  const currentActionIds = new Set(plan.actions.map((action) => action.actionId))
  const current = plan.actions.map((action) => {
    const actionNotifications = notificationsByActionId[action.actionId] || []
    const resolutionState = currentResolutionState(action, actionNotifications, nowMs)
    return {
      ...action,
      resolutionState,
      severity: stateSeverity(resolutionState, action.priority),
      notificationCount: actionNotifications.length,
      acknowledgedCount: actionNotifications.filter(notificationIsRead).length,
      latestNotificationAt: latestCreatedAt(actionNotifications),
      detail: resolutionDetail(resolutionState, action, actionNotifications, nowMs),
    }
  })
  const resolved = Object.entries(notificationsByActionId)
    .filter(([actionId]) => !currentActionIds.has(actionId))
    .map(([actionId, actionNotifications]) => {
      const latest = [...actionNotifications].sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))[0] || {}
      const eventData = asRecord(latest.event_data || latest.eventData)
      return {
        actionId,
        packetId: normalizeText(eventData.packetId || eventData.packet_id) || null,
        versionId: normalizeText(eventData.versionId || eventData.version_id) || null,
        operationalState: normalizeText(eventData.operationalState || eventData.operational_state) || null,
        resolutionState: 'resolved_after_notification',
        severity: 'healthy',
        notificationCount: actionNotifications.length,
        acknowledgedCount: actionNotifications.filter(notificationIsRead).length,
        latestNotificationAt: latestCreatedAt(actionNotifications),
        detail: 'The notified finding is no longer present in the current operational audit.',
      }
    })
  const warnings = [...asArray(diagnostics?.queryWarnings), ...asArray(queryWarnings)]
  const dataComplete = warnings.length === 0
  const critical = current.filter((item) => item.severity === 'critical')
  const warning = current.filter((item) => item.severity === 'warning')
  const gate = !dataComplete
    ? { status: 'incomplete', reason: 'Follow-up resolution cannot be concluded because one or more audit queries were incomplete.' }
    : critical.length
      ? { status: 'fail', reason: `${critical.length} active OTP follow-up item${critical.length === 1 ? '' : 's'} are missing or overdue.` }
      : warning.length
        ? { status: 'warning', reason: `${warning.length} active OTP follow-up item${warning.length === 1 ? '' : 's'} remain unresolved.` }
        : { status: 'pass', reason: 'No active governed OTP review follow-up remains unresolved.' }

  return {
    schemaVersion: LEGAL_CLAUSE_PACK_RESOLUTION_VERSION,
    generatedAt,
    dataComplete,
    queryWarnings: warnings,
    gate,
    summary: {
      activeFindings: current.length,
      critical: critical.length,
      warning: warning.length,
      awaitingAcknowledgement: current.filter((item) => item.resolutionState === 'awaiting_acknowledgement').length,
      acknowledgedUnresolved: current.filter((item) => item.resolutionState === 'acknowledged_unresolved').length,
      missingNotifications: current.filter((item) => item.resolutionState === 'notification_missing').length,
      overdue: current.filter((item) => item.resolutionState === 'overdue_unread').length,
      unroutable: current.filter((item) => item.resolutionState === 'unroutable').length,
      resolvedAfterNotification: resolved.length,
    },
    current,
    resolved,
    records: [...current, ...resolved],
  }
}

export async function getLegalClausePackResolutionSnapshot({
  client = supabase,
  organisationId = '',
  diagnostics = null,
  limit = 100,
  notificationLimit = 1000,
} = {}) {
  if (!isSupabaseConfigured || !client) throw new Error('Supabase is not configured for legal OTP follow-up diagnostics.')
  const resolvedOrganisationId = normalizeText(organisationId)
  if (!resolvedOrganisationId) throw new Error('organisationId is required for legal OTP follow-up diagnostics.')
  const currentDiagnostics = diagnostics || await getLegalClausePackOperationalDiagnosticsSnapshot({
    client,
    organisationId: resolvedOrganisationId,
    limit,
  })
  const transactionIds = [...new Set(asArray(currentDiagnostics.records).map((record) => normalizeText(record.transactionId)).filter(Boolean))]
  const queryWarnings = []
  let notifications = []
  if (transactionIds.length) {
    const resolvedNotificationLimit = Math.min(5000, Math.max(1, Number(notificationLimit) || 1000))
    const result = await client
      .from('transaction_notifications')
      .select('id, transaction_id, role_type, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at', { count: 'exact' })
      .in('transaction_id', transactionIds)
      .like('dedupe_key', `${ESCALATION_DEDUPE_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(resolvedNotificationLimit)
    if (result.error) {
      if (isMissingSchemaError(result.error)) queryWarnings.push({ source: 'transaction_notifications', message: result.error.message })
      else throw result.error
    } else {
      notifications = result.data || []
      if (Number(result.count || 0) > notifications.length) {
        queryWarnings.push({ source: 'transaction_notifications', message: `Only ${notifications.length} of ${result.count} transaction notifications were inspected.` })
      }
    }
  }
  return {
    ...buildLegalClausePackResolutionReport({ diagnostics: currentDiagnostics, notifications, queryWarnings }),
    organisationId: resolvedOrganisationId,
    diagnostics: currentDiagnostics,
  }
}
