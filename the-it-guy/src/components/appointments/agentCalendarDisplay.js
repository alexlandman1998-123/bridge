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
    // Marketing ranges are calendar context, not one-day appointment bookings.
    const schedule = appointment.calendarSource === 'marketing' ? appointment : resolveAppointmentSchedule(appointment, { strict: false })
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
        tone: appointment.calendarSource === 'marketing' ? 'marketing' : typeTone(appointment), status: appointment.calendarSource === 'marketing' ? appointment.status : statusFor(appointment), allDay: schedule.allDay,
        pointInTime: appointment.calendarSource === 'marketing' && !schedule.allDay,
        start: (from - dayStart) / MINUTE, end: (to - dayStart) / MINUTE,
        dateTime: new Date(from).toISOString(), durationMinutes: (to - from) / MINUTE,
      })
    }
  }
  for (const events of result.values()) events.sort((a, b) => a.start - b.start || a.end - b.end)
  return result
}


const marketingLabels = { campaign: 'Campaign plan', email: 'Email', whatsapp: 'WhatsApp', post: 'Facebook post' }
export function marketingCalendarRows(items, days) {
  if (!days.length) return []
  const first = sastDateKey(days[0]), last = sastDateKey(days[days.length - 1])
  return items.filter(item => item.startDate <= last && (!item.endDate || item.endDate >= first)).map(item => {
    const from = item.startDate < first ? first : item.startDate
    const end = item.endDate && item.endDate < last ? item.endDate : last
    const endDay = new Date(`${end}T00:00:00+02:00`)
    endDay.setUTCDate(endDay.getUTCDate() + 1)
    const label = marketingLabels[item.type] || 'Marketing'
    return {
      appointmentId: `marketing:${item.id}`, calendarSource: 'marketing', marketingItem: item,
      title: `${label} · ${item.title}`, status: String(item.status || 'planned').replaceAll('_', ' ').replace(/^./, char => char.toUpperCase()),
      dateTime: item.scheduledFor || `${from}T00:00:00+02:00`,
      endDateTime: item.scheduledFor ? new Date(Date.parse(item.scheduledFor) + MINUTE).toISOString() : endDay.toISOString(),
      allDay: !item.scheduledFor, timezone: 'Africa/Johannesburg',
    }
  })
}

export function workspaceMarketingDestination(item) {
  if (item.type === 'campaign') return `/marketing?section=campaigns&view=detail&id=${encodeURIComponent(item.campaignId)}`
  if (item.type === 'post') return item.listingId ? `/agent/listings/${encodeURIComponent(item.listingId)}?tab=marketing` : '/marketing?section=campaigns&page=calendar'
  return `/marketing?section=${item.type}&view=${item.status === 'draft' ? 'create' : 'detail'}&id=${encodeURIComponent(item.sourceId)}`
}
