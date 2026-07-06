import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isMissingRpcError(error, rpcName = 'bridge_notification_automation_health_phase5') {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  return code === '42883' || message.includes(String(rpcName || '').toLowerCase())
}

function normalizeHealthSnapshot(snapshot = {}) {
  const totals = snapshot?.totals && typeof snapshot.totals === 'object' ? snapshot.totals : {}
  const premiumControls = snapshot?.premiumControls && typeof snapshot.premiumControls === 'object' ? snapshot.premiumControls : null
  return {
    status: normalizeText(snapshot.status) || 'unknown',
    generatedAt: snapshot.generatedAt || snapshot.generated_at || null,
    since: snapshot.since || null,
    organisationId: snapshot.organisationId || snapshot.organisation_id || null,
    totals: {
      activeDefinitions: normalizeNumber(totals.activeDefinitions ?? totals.active_definitions),
      plannedDefinitions: normalizeNumber(totals.plannedDefinitions ?? totals.planned_definitions),
      disabledDefinitions: normalizeNumber(totals.disabledDefinitions ?? totals.disabled_definitions),
      totalEvents: normalizeNumber(totals.totalEvents ?? totals.total_events),
      sentEvents: normalizeNumber(totals.sentEvents ?? totals.sent_events),
      failedEvents: normalizeNumber(totals.failedEvents ?? totals.failed_events),
      queuedReminders: normalizeNumber(totals.queuedReminders ?? totals.queued_reminders),
      processingReminders: normalizeNumber(totals.processingReminders ?? totals.processing_reminders),
      staleProcessingReminders: normalizeNumber(totals.staleProcessingReminders ?? totals.stale_processing_reminders),
      failedReminders: normalizeNumber(totals.failedReminders ?? totals.failed_reminders),
      lastEventAt: totals.lastEventAt ?? totals.last_event_at ?? null,
      lastDispatchAt: totals.lastDispatchAt ?? totals.last_dispatch_at ?? null,
    },
    countsByStatus: snapshot.countsByStatus || snapshot.counts_by_status || {},
    countsByCategory: snapshot.countsByCategory || snapshot.counts_by_category || {},
    countsByAutomation: snapshot.countsByAutomation || snapshot.counts_by_automation || {},
    issues: Array.isArray(snapshot.issues) ? snapshot.issues : [],
    recentEvents: Array.isArray(snapshot.recentEvents || snapshot.recent_events) ? snapshot.recentEvents || snapshot.recent_events : [],
    recentFailures: Array.isArray(snapshot.recentFailures || snapshot.recent_failures) ? snapshot.recentFailures || snapshot.recent_failures : [],
    recentRuns: Array.isArray(snapshot.recentRuns || snapshot.recent_runs) ? snapshot.recentRuns || snapshot.recent_runs : [],
    premiumControls: premiumControls
      ? {
          phase: normalizeText(premiumControls.phase) || 'phase_6_premium_controls',
          totalReminderAutomations: normalizeNumber(premiumControls.totalReminderAutomations ?? premiumControls.total_reminder_automations),
          activeReminderAutomations: normalizeNumber(premiumControls.activeReminderAutomations ?? premiumControls.active_reminder_automations),
          cadenceConfigured: normalizeNumber(premiumControls.cadenceConfigured ?? premiumControls.cadence_configured),
          quietHoursConfigured: normalizeNumber(premiumControls.quietHoursConfigured ?? premiumControls.quiet_hours_configured),
          escalationConfigured: normalizeNumber(premiumControls.escalationConfigured ?? premiumControls.escalation_configured),
          missingControls: normalizeNumber(premiumControls.missingControls ?? premiumControls.missing_controls),
          ready: premiumControls.ready === true,
        }
      : null,
    reminderPolicies: Array.isArray(snapshot.reminderPolicies || snapshot.reminder_policies) ? snapshot.reminderPolicies || snapshot.reminder_policies : [],
  }
}

export async function getNotificationAutomationHealth({
  organisationId = '',
  since = '',
} = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return normalizeHealthSnapshot({
      status: 'not_configured',
      totals: {},
      issues: [
        {
          code: 'supabase_not_configured',
          severity: 'warning',
          count: 1,
          message: 'Supabase is not configured for this runtime.',
        },
      ],
    })
  }

  const rpcPayload = {
    p_organisation_id: normalizeText(organisationId) || null,
    p_since: normalizeText(since) || null,
  }

  const phase6 = await supabase.rpc('bridge_notification_automation_health_phase6', rpcPayload)
  if (!phase6.error) {
    return normalizeHealthSnapshot(phase6.data || {})
  }

  if (!isMissingRpcError(phase6.error, 'bridge_notification_automation_health_phase6')) {
    throw phase6.error
  }

  const { data, error } = await supabase.rpc('bridge_notification_automation_health_phase5', rpcPayload)

  if (error) {
    if (isMissingRpcError(error, 'bridge_notification_automation_health_phase5')) {
      return normalizeHealthSnapshot({
        status: 'not_installed',
        totals: {},
        issues: [
          {
            code: 'phase_5_migration_missing',
            severity: 'warning',
            count: 1,
            message: 'Notification automation observability migration has not been applied.',
          },
        ],
      })
    }
    throw error
  }

  return normalizeHealthSnapshot(data || {})
}

export async function dispatchNotificationReminders({
  dryRun = true,
  limit = 25,
  queueDue = true,
  queueLimit = 50,
  resetStale = true,
} = {}) {
  const response = await invokeEdgeFunction('send-email', {
    body: {
      type: 'notification_reminder_dispatch',
      dryRun,
      limit,
      queueDue,
      queueLimit,
      resetStale,
    },
  })

  const error = response?.error || response?.data?.error
  if (error) {
    throw new Error(typeof error === 'string' ? error : error.message || 'Notification reminder dispatch failed.')
  }
  if (response?.data?.ok === false) {
    throw new Error(response.data.error || 'Notification reminder dispatch failed.')
  }

  return response?.data || null
}
