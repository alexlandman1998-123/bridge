import { useMemo } from 'react'
import { ArrowRight, CalendarDays, CheckCircle2, CheckSquare, ChevronDown, Clock3, Eye, X } from 'lucide-react'

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'declined', 'no_show'])

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function getWorkspaceStatusLabel(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'draft' || normalized === 'requested') return 'Pending'
  if (normalized === 'accepted' || normalized === 'confirmed') return 'Confirmed'
  if (normalized === 'alternative_requested' || normalized === 'alternative_proposed') return 'Rescheduled'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'cancelled' || normalized === 'declined') return 'Cancelled'
  if (normalized === 'no_show') return 'No-show'
  return String(status || 'Pending')
}

function getAppointmentIdentity(appointment = {}, fallback = 'appointment') {
  return String(
    appointment?.appointmentId ||
      appointment?.id ||
      appointment?.appointment_id ||
      appointment?.calendarEventId ||
      `${appointment?.dateTime || appointment?.createdAt || fallback}`,
  )
}

function getAppointmentStartDate(appointment = {}) {
  const dateValue =
    appointment.dateTime ||
    appointment.startDateTime ||
    appointment.start_date_time ||
    appointment.startsAt ||
    appointment.starts_at ||
    appointment.date ||
    appointment.appointmentDate ||
    appointment.appointment_date

  if (dateValue && appointment.startTime && !String(dateValue).includes('T')) {
    const parsed = new Date(`${dateValue}T${appointment.startTime}`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  if (!dateValue) return null
  const parsed = new Date(dateValue)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isSameCalendarDay(left, right) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

function getCurrentWeekRange(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

function isPendingAppointmentRequest(appointment = {}) {
  const status = normalizeStatus(appointment.status)
  return ['draft', 'requested', 'pending', 'seller_availability_requested', 'awaiting_buyer_confirmation'].includes(status) ||
    status.includes('request') ||
    status.includes('pending') ||
    status.includes('awaiting')
}

function resolveClientLabel(appointment = {}, currentAgent = {}) {
  const participants = Array.isArray(appointment.participants) ? appointment.participants : []
  const client = participants.find((participant) => {
    const role = normalizeStatus(participant.participantRole || participant.participant_role || participant.role)
    return role && !role.includes('agent')
  }) || participants[0] || {}

  return String(
    appointment.clientName ||
      appointment.client_name ||
      appointment.sellerName ||
      appointment.seller_name ||
      client.name ||
      client.fullName ||
      client.full_name ||
      client.email ||
      currentAgent?.clientName ||
      'Seller',
  ).trim()
}

function AppointmentMetricCard({ metric }) {
  const Icon = metric.icon
  return (
    <article className="grid min-h-[112px] grid-cols-[44px_minmax(0,1fr)] items-center gap-4 rounded-[18px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_28px_rgba(31,54,78,0.04)]">
      <span className={`grid h-11 w-11 place-items-center rounded-[16px] ${metric.iconClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold tracking-[-0.04em] text-[#13283f]">{metric.value}</span>
        <span className="mt-1 block text-sm font-semibold text-[#4f6680]">{metric.label}</span>
        <span className="mt-1 block text-xs font-medium text-[#6d839b]">{metric.meta}</span>
      </span>
    </article>
  )
}

function AppointmentActionButton({ title, children, tone = 'default', onClick }) {
  const toneClass = tone === 'danger'
    ? 'text-[#b42318] hover:border-[#f3cfcb] hover:bg-[#fff5f3]'
    : tone === 'success'
      ? 'text-[#13784f] hover:border-[#bfe7d0] hover:bg-[#f4faf5]'
      : 'text-[#516982] hover:border-[#c9d8e8] hover:bg-[#f6f9fc]'

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#dbe6f0] bg-white transition ${toneClass}`}
    >
      {children}
    </button>
  )
}

function KingstonsSellerAppointmentsWorkspace({
  appointments = [],
  currentAgent = {},
  resolveAppointmentListingLabel = () => '',
  getAppointmentTypeLabel = () => '',
  formatDateShort = () => '-',
  formatAppointmentTimeRange = () => 'Time pending',
  getAppointmentStatusTone = () => 'border-[#dde7f2] bg-[#f7fbff] text-[#4c6680]',
  handleViewCalendar = () => {},
  handleOpenAppointmentModal = () => {},
  handleScheduleAppointment = () => {},
  handleCancelAppointment = () => {},
  handleMarkAppointmentComplete = () => {},
}) {
  const now = useMemo(() => new Date(), [])
  const { start: weekStart, end: weekEnd } = useMemo(() => getCurrentWeekRange(now), [now])

  const activeAppointments = useMemo(
    () =>
      (Array.isArray(appointments) ? appointments : [])
        .filter((appointment) => !TERMINAL_STATUSES.has(normalizeStatus(appointment?.status)))
        .sort((a, b) => (getAppointmentStartDate(a)?.getTime() || 0) - (getAppointmentStartDate(b)?.getTime() || 0)),
    [appointments],
  )

  const upcomingAppointments = useMemo(
    () => activeAppointments.filter((appointment) => {
      const start = getAppointmentStartDate(appointment)
      return !start || start.getTime() >= now.getTime()
    }),
    [activeAppointments, now],
  )

  const metrics = useMemo(
    () => [
      {
        key: 'today',
        label: 'Today',
        value: upcomingAppointments.filter((appointment) => {
          const start = getAppointmentStartDate(appointment)
          return start && isSameCalendarDay(start, now)
        }).length,
        meta: 'No appointments',
        icon: CalendarDays,
        iconClass: 'bg-[#e8f7ef] text-[#13784f]',
      },
      {
        key: 'week',
        label: 'This Week',
        value: upcomingAppointments.filter((appointment) => {
          const start = getAppointmentStartDate(appointment)
          return start && start >= weekStart && start < weekEnd
        }).length,
        meta: 'No appointments',
        icon: CalendarDays,
        iconClass: 'bg-[#f0eafd] text-[#6b49b6]',
      },
      {
        key: 'month',
        label: 'This Month',
        value: upcomingAppointments.filter((appointment) => {
          const start = getAppointmentStartDate(appointment)
          return start && start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth()
        }).length,
        meta: 'No appointments',
        icon: CalendarDays,
        iconClass: 'bg-[#fff4d7] text-[#be7a13]',
      },
      {
        key: 'requests',
        label: 'Requests',
        value: activeAppointments.filter(isPendingAppointmentRequest).length,
        meta: 'Pending response',
        icon: Clock3,
        iconClass: 'bg-[#e6f2ff] text-[#1773c6]',
      },
    ],
    [activeAppointments, now, upcomingAppointments, weekEnd, weekStart],
  )

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-[24px] border border-[#dfe9f4] bg-white shadow-[0_18px_44px_rgba(31,54,78,0.08)]">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-[#e8f7ef] text-[#13784f]">
              <CalendarDays className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h3 className="text-3xl font-semibold tracking-[-0.04em] text-[#13283f]">Appointments</h3>
              <p className="mt-1 text-sm leading-6 text-[#5f748d]">Manage upcoming appointments and client meetings across your pipeline.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleViewCalendar}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dfe8f2] bg-white px-4 text-sm font-semibold text-[#13784f] shadow-[0_8px_18px_rgba(31,54,78,0.05)] transition hover:border-[#bddfcb] hover:bg-[#f4faf5]"
          >
            <CalendarDays className="h-4 w-4" />
            View Calendar
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="border-t border-[#edf2f7] p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => <AppointmentMetricCard key={metric.key} metric={metric} />)}
          </div>

          {!upcomingAppointments.length ? (
            <div className="mt-5 grid min-h-[190px] place-items-center rounded-[18px] border border-dashed border-[#dce6ef] bg-white px-5 py-8 text-center">
              <div>
                <div className="relative mx-auto flex h-20 w-20 items-center justify-center text-[#9aaabb]">
                  <CalendarDays className="h-16 w-16" strokeWidth={1.7} />
                  <span className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-[#13784f] text-white shadow-[0_8px_18px_rgba(19,120,79,0.24)]">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                </div>
                <h4 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#13283f]">No appointments scheduled</h4>
                <p className="mt-2 text-sm leading-6 text-[#5f748d]">Your upcoming appointments and client meetings will appear here.</p>
                <button
                  type="button"
                  onClick={handleScheduleAppointment}
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[#13784f] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(19,120,79,0.2)] transition hover:bg-[#0f6843]"
                >
                  <CalendarDays className="h-4 w-4" />
                  Schedule Appointment
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[#dfe9f4] bg-white shadow-[0_18px_44px_rgba(31,54,78,0.06)]">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div>
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#13283f]">Upcoming Appointments</h3>
            <p className="mt-1 text-sm leading-6 text-[#5f748d]">Your next scheduled appointments will appear here.</p>
          </div>
          <label className="relative inline-flex min-h-11 min-w-[190px] items-center">
            <select aria-label="Filter appointments" defaultValue="all" className="min-h-11 w-full appearance-none rounded-[14px] border border-[#dfe8f2] bg-white px-4 pr-10 text-sm font-semibold text-[#29435d] outline-none transition hover:bg-[#f7fbff] focus:border-[#8bc8a5] focus:ring-4 focus:ring-[#e8f7ef]">
              <option value="all">All Appointments</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[#8aa0b7]" />
          </label>
        </div>

        {upcomingAppointments.length ? (
          <>
            <div className="hidden md:block">
              <table className="w-full border-t border-[#edf2f7] text-left">
                <thead className="bg-[#f8fafc]">
                  <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#6f839a]">
                    <th className="px-5 py-3">Date &amp; Time</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">With</th>
                    <th className="px-5 py-3">Property</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {upcomingAppointments.map((appointment, index) => {
                    const appointmentId = getAppointmentIdentity(appointment, `upcoming-${index}`)
                    const appointmentTitle = getAppointmentTypeLabel(appointment.appointmentType) || appointment.title || 'Appointment'
                    const propertyLabel =
                      resolveAppointmentListingLabel(appointment.listingId) ||
                      String(appointment.location || '').trim() ||
                      'Property TBC'
                    const appointmentDate = getAppointmentStartDate(appointment)
                    const isTerminal = TERMINAL_STATUSES.has(normalizeStatus(appointment.status))

                    return (
                      <tr key={appointmentId} className="text-sm">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-[#13283f]">{appointmentDate ? formatDateShort(appointmentDate) : 'Date TBC'}</p>
                          <p className="mt-1 text-xs font-medium text-[#6d839b]">{formatAppointmentTimeRange(appointment)}</p>
                        </td>
                        <td className="px-5 py-4 font-semibold text-[#29435d]">{appointmentTitle}</td>
                        <td className="px-5 py-4 text-[#526b84]">{resolveClientLabel(appointment, currentAgent)}</td>
                        <td className="px-5 py-4">
                          <p className="max-w-[280px] truncate font-semibold text-[#13283f]" title={propertyLabel}>{propertyLabel}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold ${getAppointmentStatusTone(appointment.status)}`}>
                            {getWorkspaceStatusLabel(appointment.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <AppointmentActionButton title="View appointment" onClick={() => handleOpenAppointmentModal(appointment)}>
                              <Eye className="h-4 w-4" />
                            </AppointmentActionButton>
                            {!isTerminal ? (
                              <AppointmentActionButton title="Mark complete" tone="success" onClick={() => void handleMarkAppointmentComplete(appointment)}>
                                <CheckSquare className="h-4 w-4" />
                              </AppointmentActionButton>
                            ) : null}
                            {!isTerminal ? (
                              <AppointmentActionButton title="Cancel appointment" tone="danger" onClick={() => void handleCancelAppointment(appointment)}>
                                <X className="h-4 w-4" />
                              </AppointmentActionButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 border-t border-[#edf2f7] p-5 md:hidden">
              {upcomingAppointments.map((appointment, index) => {
                const appointmentId = getAppointmentIdentity(appointment, `mobile-${index}`)
                const appointmentTitle = getAppointmentTypeLabel(appointment.appointmentType) || appointment.title || 'Appointment'
                const propertyLabel =
                  resolveAppointmentListingLabel(appointment.listingId) ||
                  String(appointment.location || '').trim() ||
                  'Property TBC'
                const appointmentDate = getAppointmentStartDate(appointment)

                return (
                  <article key={appointmentId} className="rounded-[18px] border border-[#dfe8f2] bg-white p-4 shadow-[0_10px_24px_rgba(31,54,78,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#13784f]">{appointmentDate ? formatDateShort(appointmentDate) : 'Date TBC'} · {formatAppointmentTimeRange(appointment)}</p>
                        <h4 className="mt-2 text-base font-semibold text-[#13283f]">{appointmentTitle}</h4>
                        <p className="mt-1 truncate text-sm text-[#526b84]">{resolveClientLabel(appointment, currentAgent)}</p>
                        <p className="mt-1 truncate text-sm text-[#6d839b]">{propertyLabel}</p>
                      </div>
                      <AppointmentActionButton title="View appointment" onClick={() => handleOpenAppointmentModal(appointment)}>
                        <Eye className="h-4 w-4" />
                      </AppointmentActionButton>
                    </div>
                    <div className="mt-3">
                      <span className={`inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold ${getAppointmentStatusTone(appointment.status)}`}>
                        {getWorkspaceStatusLabel(appointment.status)}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        ) : (
          <div className="border-t border-[#edf2f7] p-5 sm:p-6">
            <div className="grid min-h-[230px] place-items-center rounded-[18px] border border-dashed border-[#dce6ef] bg-white px-5 py-8 text-center">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] bg-[#f0f4f8] text-[#7e91a6]">
                  <CalendarDays className="h-6 w-6" />
                </span>
                <h4 className="mt-4 text-sm font-semibold text-[#13283f]">No upcoming appointments</h4>
                <p className="mt-2 text-sm leading-6 text-[#5f748d]">Schedule your first appointment to get started.</p>
                <button
                  type="button"
                  onClick={handleScheduleAppointment}
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[12px] border border-[#bddfcb] bg-white px-5 text-sm font-semibold text-[#13784f] transition hover:bg-[#f4faf5]"
                >
                  Schedule Appointment
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default KingstonsSellerAppointmentsWorkspace
