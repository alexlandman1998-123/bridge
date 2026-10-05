export function readAttorneyAppointmentDelivery(appointment, jobs) {
  if (appointment.attorney_delivery_enabled === false) return { status: 'disabled', reminders: { status: 'skipped' } }
  if (!Array.isArray(jobs)) return { status: 'unavailable', reminders: { status: 'unavailable' } }
  const current = jobs.filter(job => job.appointment_id === appointment.appointment_id && Number(job.revision) === Number(appointment.calendar_revision) && job.status !== 'superseded')
  const messages = current.filter(job => !job.event_kind.startsWith('reminder'))
  const status = messages.some(job => job.status === 'failed') ? 'failed' : messages.some(job => ['queued', 'processing'].includes(job.status)) ? 'queued'
    : messages.length && messages.every(job => job.status === 'sent') ? 'sent' : 'skipped'
  const reminders = current.filter(job => job.event_kind.startsWith('reminder'))
  const reminderStatus = reminders.some(job => job.status === 'failed') ? 'failed' : reminders.some(job => ['queued','processing'].includes(job.status)) ? 'scheduled'
    : reminders.some(job => job.status === 'sent') ? 'sent' : 'skipped'
  return { status, calendarInviteRequested: appointment.attorney_attach_calendar !== false,
    calendarInviteDelivered: appointment.attorney_attach_calendar !== false && messages.some(job => job.status === 'sent' && !job.event_kind.startsWith('reschedule') && job.event_kind !== 'completed'),
    reminders: { status: reminderStatus } }
}
