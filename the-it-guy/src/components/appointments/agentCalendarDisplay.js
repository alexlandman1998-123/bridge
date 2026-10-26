import { resolveAppointmentSchedule } from '../../core/appointments/appointmentTime'
import { canonicalReservationStatus } from '../../core/appointments/appointmentReservation'
import { sastDateKey, sastDayStart } from '../../core/appointments/attorneyCalendarModel'
import { getAppointmentTypeLabel } from '../../lib/appointmentTypeDefinitions'

const MINUTE = 60000
const statusLabels = { requested: 'Pending', confirmed: 'Confirmed', accepted: 'Accepted', alternative_proposed: 'Needs reschedule', alternative_requested: 'Needs reschedule', completed: 'Completed', cancelled: 'Cancelled', declined: 'Declined', no_show: 'No show', draft: 'Draft' }
const typeTone = row => {
  const description = `${row.appointmentType} ${row.title}`.replace(/[_-]/g, ' ')
  return /\b(viewing|view|show day)\b/i.test(description) ? 'viewing' : /\b(valuation|appraisal|cma)\b/i.test(description) ? 'valuation' : 'meeting'
}
const statusFor = row => statusLabels[canonicalReservationStatus(row.status)] || row.status || 'Pending'

// Split at SAST midnight so overnight and all-day appointments stay visible on
// each day they occupy. Lane placement uses the established calendar model.
export function buildCalendarDayEvents(appointments, days) {
  const result = new Map(days.map(day => [sastDateKey(day), []]))
  for (const appointment of appointments) {
    const schedule = resolveAppointmentSchedule(appointment, { strict: false })
    const start = Date.parse(schedule.dateTime)
    const end = Date.parse(schedule.endDateTime)
    if (!Number.isFinite(start)) continue
    const finish = Number.isFinite(end) && end > start ? end : start + 30 * MINUTE
    for (const day of days) {
      const dayStart = sastDayStart(day).getTime()
      const dayEnd = dayStart + 24 * 60 * MINUTE
      if (start >= dayEnd || finish <= dayStart) continue
      const from = Math.max(start, dayStart), to = Math.min(finish, dayEnd)
      result.get(sastDateKey(day)).push({
        id: appointment.appointmentId || appointment.appointment_id || appointment.id,
        appointment, title: appointment.title || getAppointmentTypeLabel(appointment.appointmentType),
        tone: typeTone(appointment), status: statusFor(appointment), allDay: schedule.allDay,
        start: (from - dayStart) / MINUTE, end: (to - dayStart) / MINUTE,
        dateTime: new Date(from).toISOString(), durationMinutes: (to - from) / MINUTE,
      })
    }
  }
  for (const events of result.values()) events.sort((a, b) => a.start - b.start || a.end - b.end)
  return result
}

