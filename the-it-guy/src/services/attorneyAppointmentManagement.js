import { requireClient } from './attorneyFirmServiceShared'

export function appointmentEditDraft(appointment = {}) {
  const date = new Date(appointment.dateTime || appointment.date_time || '')
  const parts = Number.isNaN(date.getTime()) ? {} : new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {})
  return {
    date: appointment.appointmentDate || appointment.appointment_date || (parts.year ? `${parts.year}-${parts.month}-${parts.day}` : ''),
    startTime: String(appointment.startTime || appointment.start_time || (parts.hour ? `${parts.hour}:${parts.minute}` : '')).slice(0, 5),
    endTime: String(appointment.endTime || appointment.end_time || '').slice(0, 5),
  }
}

export function buildAppointmentEditChanges(draft = {}, now = new Date()) {
  const { date, startTime, endTime } = draft
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime || '')) {
    throw new Error('Choose a valid appointment date, start time and end time.')
  }
  const start = new Date(`${date}T${startTime}:00+02:00`)
  const end = new Date(`${date}T${endTime}:00+02:00`)
  if (Number.isNaN(start.getTime()) || new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10) !== date || start <= now || end <= start) {
    throw new Error('Choose a future start and end time on the same day.')
  }
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function manageAttorneyAppointment(appointmentId, action, expectedUpdatedAt, changes = {}, { client = requireClient() } = {}) {
  if (!appointmentId || !expectedUpdatedAt) throw new Error('Refresh the calendar before changing this appointment.')
  if (!['edit', 'resource', 'owner', 'cancel', 'complete'].includes(action)) throw new Error('Unknown appointment action.')
  const mutation = await client.rpc('manage_attorney_appointment', {
    p_appointment_id: appointmentId, p_action: action, p_expected_updated_at: expectedUpdatedAt, p_changes: changes,
  })
  if (mutation.error) {
    if (['PGRST202', '42703'].includes(mutation.error.code)) throw new Error('Appointment management needs the latest database migration before changes can be saved.')
    throw mutation.error
  }
  const saved = mutation.data
  if (saved?.appointment?.appointment_id !== appointmentId || !Array.isArray(saved.participants)) {
    throw new Error('Appointment save could not be confirmed. Refresh the calendar before trying again.')
  }
  const outcome = {
    appointmentId, transactionId: saved.appointment.transaction_id || null,
    appointment: saved.appointment, participants: saved.participants,
    rescheduleRequests: (saved.reschedule_requests || []).map(row => ({
      id: row.id, status: row.status, preferredStart: row.preferred_start, preferredEnd: row.preferred_end,
      requestedByRole: row.requested_by_role, reason: row.reason, createdAt: row.created_at, updatedAt: row.updated_at,
    })),
  }
  // The RPC saves notifications/reminders in the same database transaction.
  outcome.delivery = { status: saved.appointment.attorney_delivery_enabled === false ? 'disabled' : 'queued' }
  return outcome
}
