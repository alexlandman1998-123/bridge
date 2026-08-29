import { CalendarDays, CheckCircle2, ChevronRight, Clock3 } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function appointmentDate(appointment = {}) {
  const value = appointment.dateTime || appointment.date_time || appointment.date || appointment.createdAt || appointment.created_at
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
}

function statusTone(status = '') {
  const value = text(status).toLowerCase()
  if (value === 'completed') return 'border-[#bfe7d0] bg-[#edf9f1] text-[#25764a]'
  if (value === 'confirmed' || value === 'accepted') return 'border-[#c4d9ff] bg-[#eef5ff] text-[#285f9e]'
  if (value === 'cancelled' || value === 'declined') return 'border-[#f3cfcb] bg-[#fff4f2] text-[#a13b31]'
  if (value === 'no_show') return 'border-[#ead0a2] bg-[#fff8e8] text-[#8a5a12]'
  return 'border-[#dde7f2] bg-[#f7fbff] text-[#4c6680]'
}

function dashboardRows(appointments = [], now = new Date()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const week = new Date(today)
  week.setDate(week.getDate() + 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const active = appointments.filter((appointment) => !['cancelled', 'declined'].includes(text(appointment?.status).toLowerCase()))
  const countBetween = (start, end) => active.filter((appointment) => {
    const date = appointmentDate(appointment)
    return date && date >= start && date < end
  }).length
  const pending = active.filter((appointment) => /requested|pending|confirmation_required/.test(text(appointment?.status || appointment?.rsvpStatus || appointment?.rsvp_status).toLowerCase())).length
  return [
    ['Today', countBetween(today, tomorrow), 'bg-[#e5f7ed] text-[#147a4f]'],
    ['This Week', countBetween(today, week), 'bg-[#f1ebff] text-[#7058b8]'],
    ['This Month', countBetween(monthStart, monthEnd), 'bg-[#fff4d9] text-[#ba7612]'],
    ['Requests', pending, 'bg-[#e7f2ff] text-[#2470b8]'],
  ]
}

function EmptyAppointments({ onScheduleAppointment }) {
  return (
    <div className="flex min-h-[230px] flex-col items-center justify-center px-5 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef3f8] text-[#60758b]"><CalendarDays className="h-5 w-5" /></span>
      <h4 className="mt-5 text-sm font-semibold text-[#102033]">No upcoming appointments</h4>
      <p className="mt-3 text-sm leading-6 text-[#536a84]">Schedule your first appointment to get started.</p>
      <Button type="button" variant="secondary" size="sm" className="mt-5 rounded-[12px]" onClick={onScheduleAppointment}>Schedule Appointment</Button>
    </div>
  )
}

export default function BuyerLeadAppointmentsWorkspace({
  appointments = [],
  appointmentFilter = 'all',
  appointmentFilterOptions = [],
  onAppointmentFilterChange,
  onScheduleAppointment,
  onViewCalendar,
  onOpenAppointment,
  resolveAppointmentListingLabel,
  formatDateLabel,
  formatTimeRange,
  getAppointmentTypeLabel,
}) {
  const rows = dashboardRows(Array.isArray(appointments) ? appointments : [])
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = (Array.isArray(appointments) ? appointments : [])
    .filter((appointment) => !['cancelled', 'declined', 'completed', 'no_show'].includes(text(appointment?.status).toLowerCase()))
    .filter((appointment) => {
      const date = appointmentDate(appointment)
      return date && date >= today
    })
    .filter((appointment) => appointmentFilter === 'all' || key(appointment?.appointmentType || appointment?.type || 'appointment') === appointmentFilter)
    .sort((left, right) => appointmentDate(left) - appointmentDate(right))

  return (
    <div className="space-y-5" data-testid="buyer-lead-appointments-simplified">
      <section className="rounded-[22px] border border-[#dce7f2] bg-white p-5 shadow-[0_14px_34px_rgba(31,54,78,0.055)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8eef5] pb-5">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#e5f7ed] text-[#147a4f]"><CalendarDays className="h-6 w-6" /></span>
            <div><h2 className="text-2xl font-semibold text-[#102033]">Appointments</h2><p className="mt-1 text-sm text-[#536a84]">Manage upcoming appointments and client meetings.</p></div>
          </div>
          <Button type="button" variant="secondary" size="sm" className="rounded-[12px]" onClick={onViewCalendar}><CalendarDays className="h-4 w-4" />View Calendar<ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map(([label, value, tone]) => (
            <div key={label} className="rounded-[18px] border border-[#e1eaf4] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(31,54,78,0.04)]">
              <div className="flex items-center gap-4"><span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}>{label === 'Requests' ? <Clock3 className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}</span><div><p className="text-2xl font-semibold text-[#102033]">{value}</p><p className="mt-1 text-sm font-semibold text-[#536a84]">{label}</p></div></div>
            </div>
          ))}
        </div>
        {!appointments.length ? <div className="mt-5 flex items-center justify-center gap-5 rounded-[18px] border border-[#e1eaf4] px-5 py-8"><CheckCircle2 className="h-10 w-10 text-[#9cabbc]" /><div><h3 className="font-semibold text-[#102033]">No appointments scheduled</h3><Button type="button" size="sm" className="mt-3 rounded-[12px]" onClick={onScheduleAppointment}>Schedule Appointment</Button></div></div> : null}
      </section>

      <section className="rounded-[22px] border border-[#dce7f2] bg-white p-5 shadow-[0_14px_34px_rgba(31,54,78,0.055)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-lg font-semibold text-[#102033]">Upcoming Appointments</h3><p className="mt-1 text-sm text-[#536a84]">Your next scheduled appointments will appear here.</p></div><Field as="select" className="w-full sm:w-44" value={appointmentFilter} onChange={(event) => onAppointmentFilterChange(event.target.value)}>{appointmentFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Field></div>
        <div className="mt-5 overflow-hidden rounded-[14px] border border-[#dce7f2]">
          {upcoming.map((appointment) => (
            <button key={appointment.appointmentId || appointment.id} type="button" className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-[#eef3f8] bg-white px-5 py-4 text-left last:border-b-0 hover:bg-[#fbfdff]" onClick={() => onOpenAppointment(appointment)}>
              <span><span className="block text-sm font-semibold text-[#102033]">{getAppointmentTypeLabel(appointment.appointmentType) || appointment.title || 'Appointment'}</span><span className="mt-1 block text-xs text-[#60758b]">{formatDateLabel(appointment.dateTime || appointment.date || appointment.createdAt)} · {formatTimeRange(appointment)}</span><span className="mt-1 block text-xs text-[#60758b]">{resolveAppointmentListingLabel(appointment.listingId) || appointment.location || 'Property pending'}</span></span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(appointment.status)}`}>{text(appointment.status) || 'Requested'}</span>
            </button>
          ))}
          {!upcoming.length ? <EmptyAppointments onScheduleAppointment={onScheduleAppointment} /> : null}
        </div>
      </section>
    </div>
  )
}
