import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

async function call(name, args) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Calendar support is unavailable in this workspace.')
  const result = await supabase.rpc(name, args)
  if (result.error) throw new Error(result.error.message || 'Calendar support could not be verified. Retry.')
  return result.data
}
export async function readCalendarHealth(organisationId) {
  const data = await call('read_calendar_health', { p_organisation_id: organisationId, p_limit: 100 })
  if (data?.verified !== true || data.organisationId !== organisationId || !Array.isArray(data.issues)
    || !data.monitor || !['not_started', 'current', 'stale', 'partial', 'failed'].includes(data.monitor.status) || typeof data.truncated !== 'boolean'
    || data.issues.some(issue => typeof issue.issue_key !== 'string' || typeof issue.kind !== 'string' || typeof issue.inspectAllowed !== 'boolean' || (issue.inspectAllowed && typeof issue.appointment_id !== 'string'))) {
    throw new Error('Calendar health could not be verified. Retry.')
  }
  return data
}
export async function readAppointmentSupport(organisationId, appointmentId) {
  const data = await call('read_calendar_appointment_support', { p_organisation_id: organisationId, p_appointment_id: appointmentId })
  if (data?.verified !== true || data.organisationId !== organisationId || data.appointmentId !== appointmentId
    || !Number.isInteger(data.revision) || !Array.isArray(data.jobs) || !Array.isArray(data.history) || !Array.isArray(data.participants)
    || typeof data.reconcileAllowed !== 'boolean' || typeof data.status !== 'string'
    || data.jobs.some(job => typeof job.id !== 'string' || typeof job.status !== 'string' || typeof job.event_kind !== 'string'
      || typeof job.retry_allowed !== 'boolean' || !Number.isInteger(job.revision) || !Number.isInteger(job.attempt_count) || !Number.isInteger(job.max_attempts))
    || data.history.some(entry => !Array.isArray(entry.changed_fields) || entry.changed_fields.some(field => typeof field !== 'string'))
    || data.participants.some(person => typeof person.id !== 'string')) {
    throw new Error('Appointment support details could not be verified. Retry.')
  }
  return data
}
export async function recoverAppointmentDelivery({ organisationId, appointmentId, revision, action, jobId = null, commandId, reason }) {
  if (!['retry', 'reconcile'].includes(action) || !commandId || !reason?.trim()) throw new Error('Choose a recovery action and give a reason.')
  const data = await call('calendar_support_action', { p_organisation_id: organisationId, p_appointment_id: appointmentId,
    p_expected_revision: revision, p_action: action, p_job_id: jobId, p_command_id: commandId, p_reason: reason.trim() })
  if (data?.verified !== true || data.organisationId !== organisationId || data.appointmentId !== appointmentId
    || data.revision !== revision || data.commandId !== commandId || data.action !== action
    || !Number.isInteger(data.queued) || data.queued < 0 || !Number.isInteger(data.retired) || data.retired < 0) {
    throw new Error('Recovery could not be verified. Retry with the same details.')
  }
  return data
}
export function calendarSupportDeadline(promise) {
  let timeout
  return Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Calendar support is taking too long. Retry.')), 15000) })])
    .finally(() => clearTimeout(timeout))
}
