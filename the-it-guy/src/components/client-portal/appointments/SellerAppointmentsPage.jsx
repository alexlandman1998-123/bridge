import {
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  MoreVertical,
  PenLine,
  Phone,
  Plus,
  RefreshCw,
  UserRoundCheck,
  UsersRound,
  Video,
} from 'lucide-react'
import { useMemo } from 'react'
import { buildSellerPortalAppointmentsPayload } from '../../../services/sellerPortalAppointmentsService'

function formatDate(value, options = {}) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-ZA', options)
}

function formatTime(value) {
  if (!value) return 'Time TBC'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time TBC'
  return date.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatEndTime(appointment = {}) {
  if (appointment.endTime) return formatTime(appointment.endTime)
  const start = new Date(appointment.startTime || '')
  if (Number.isNaN(start.getTime())) return 'Time TBC'
  return formatTime(new Date(start.getTime() + (appointment.durationMinutes || 60) * 60000).toISOString())
}

function formatNextAppointmentDetail(appointment) {
  if (!appointment?.startTime) return 'No upcoming'
  const date = new Date(appointment.startTime)
  if (Number.isNaN(date.getTime())) return 'No upcoming'
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const dayLabel = isToday
    ? 'Today'
    : date.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : formatDate(appointment.startTime, { weekday: 'short', day: '2-digit', month: 'short' })
  return `Next: ${dayLabel}, ${formatTime(appointment.startTime)}`
}

function getLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getStatusLabel(status = '') {
  if (status === 'awaiting_confirmation') return 'Awaiting Confirmation'
  if (status === 'reschedule_requested') return 'Reschedule Requested'
  if (status === 'completed') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  return 'Confirmed'
}

function getStatusClasses(status = '') {
  if (status === 'awaiting_confirmation') return 'border-[#f4d8ad] bg-[#fff7eb] text-[#a15c12]'
  if (status === 'reschedule_requested') return 'border-[#f1cfc8] bg-[#fff5f3] text-[#b5472d]'
  if (status === 'completed') return 'border-[#cfe4d8] bg-[#eef9f2] text-[#2f7a51]'
  if (status === 'cancelled') return 'border-[#e7d6d1] bg-[#f9f4f2] text-[#7a4b3a]'
  return 'border-[#cfe4d8] bg-[#eaf9f1] text-[#047857]'
}

function getAppointmentIcon(type = '') {
  const normalized = String(type || '').toLowerCase()
  if (/photo|shoot|media/.test(normalized)) return 'camera'
  if (/offer|review|buyer/.test(normalized)) return 'users'
  if (/mandate|sign/.test(normalized)) return 'pen'
  if (/transfer|consult/.test(normalized)) return 'user-check'
  return 'home'
}

function AppointmentTypeIcon({ type }) {
  const icon = getAppointmentIcon(type)
  if (icon === 'camera') return <Camera size={22} />
  if (icon === 'users') return <UsersRound size={22} />
  if (icon === 'pen') return <PenLine size={22} />
  if (icon === 'user-check') return <UserRoundCheck size={22} />
  return <Home size={22} />
}

function MethodIcon({ method }) {
  if (method === 'virtual') return <Video size={14} />
  if (method === 'phone') return <Phone size={14} />
  return <Home size={14} />
}

function AgentAvatar({ agent }) {
  const initials = String(agent?.name || 'Bridge Property Team')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'BP'

  if (agent?.avatarUrl) {
    return <img src={agent.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white" />
  }

  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf2fb] text-xs font-semibold text-[#31506a] ring-2 ring-white">
      {initials}
    </span>
  )
}

function DateBlock({ appointment }) {
  const value = appointment?.startTime
  const date = value ? new Date(value) : null
  const isValid = date && !Number.isNaN(date.getTime())
  return (
    <div className="flex min-h-[232px] w-full flex-col items-center justify-center rounded-[16px] border-r border-[#e1e9f2] bg-[#fbfdff] px-4 py-5 text-center sm:w-[118px]">
      <span className="text-[0.72rem] font-semibold uppercase text-[#10a06e]">
        {isValid ? date.toLocaleDateString('en-ZA', { weekday: 'short' }) : 'Date'}
      </span>
      <strong className="mt-2 text-[2rem] font-semibold leading-none text-[#142132]">
        {isValid ? date.toLocaleDateString('en-ZA', { day: '2-digit' }) : '--'}
      </strong>
      <span className="mt-2 text-xs font-semibold uppercase text-[#38536d]">
        {isValid ? date.toLocaleDateString('en-ZA', { month: 'short' }) : 'TBC'}
      </span>
      <span className="my-4 h-px w-4 bg-[#c8d5e3]" />
      <span className="text-sm font-semibold text-[#142132]">{formatTime(value)}</span>
      <span className="my-2 h-px w-3 bg-[#d8e2ee]" />
      <span className="text-sm font-semibold text-[#142132]">
        {appointment ? formatEndTime(appointment) : 'Time TBC'}
      </span>
    </div>
  )
}

function SellerAppointmentCard({ appointment, onConfirm, onReschedule, pendingAction = '', completed = false }) {
  const appointmentId = appointment.id
  const actionBusy = pendingAction && pendingAction.startsWith(`${appointmentId}:`)
  const canConfirm = appointment.status === 'awaiting_confirmation'
  const canReschedule = !completed && appointment.status !== 'cancelled'

  return (
    <article className="grid overflow-hidden rounded-[18px] border border-[#dbe5ef] bg-white shadow-[0_10px_26px_rgba(15,23,42,0.045)] sm:grid-cols-[118px_1fr]">
      <DateBlock appointment={appointment} />
      <div className="min-w-0 px-5 py-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#eaf8f1] text-[#10a06e]">
            <AppointmentTypeIcon type={appointment.appointmentType} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-[#142132]">{appointment.appointmentType}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52677f]">{appointment.description}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#38536d]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f5fa] px-3 py-1.5">
                <Clock3 size={13} />
                {appointment.durationMinutes} min
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f5fa] px-3 py-1.5">
                <MethodIcon method={appointment.method} />
                {appointment.methodLabel}
              </span>
              {appointment.location ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f0f5fa] px-3 py-1.5">
                  <MapPin size={13} />
                  <span className="truncate">{appointment.location}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-[#38536d]">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.68rem] font-semibold ${getStatusClasses(appointment.status)}`}>
              {getStatusLabel(appointment.status)}
            </span>
            <span>with {appointment.assignedAgent.name}</span>
            <AgentAvatar agent={appointment.assignedAgent} />
          </div>
          {!completed ? (
            <div className="flex items-center gap-2">
              {canConfirm ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => onConfirm?.(appointment.raw || appointment)}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] bg-[#10253a] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a3b5a] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {actionBusy && pendingAction.endsWith(':confirm') ? 'Saving...' : 'Confirm'}
                </button>
              ) : null}
              {canReschedule ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => onReschedule?.(appointment.raw || appointment)}
                  className="inline-flex min-h-[38px] items-center justify-center rounded-[10px] border border-[#d5e1ee] bg-white px-4 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {actionBusy && pendingAction.endsWith(':reschedule') ? 'Sending...' : 'Request new time'}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#7b8ca2] transition hover:bg-[#eef4fb] hover:text-[#31506a]"
                aria-label="Appointment actions"
                title="Appointment actions"
              >
                <MoreVertical size={17} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function SellerAppointmentKpiCards({ summary }) {
  const cards = [
    { label: 'Upcoming', count: summary.upcomingCount, detail: formatNextAppointmentDetail(summary.nextAppointment), icon: CalendarClock, tone: 'green' },
    { label: 'Completed', count: summary.completedCount, detail: 'This month', icon: CheckCircle2, tone: 'blue' },
    { label: 'Awaiting confirmation', count: summary.awaitingConfirmationCount, detail: summary.awaitingConfirmationCount ? 'Needs response' : 'No pending', icon: Clock3, tone: 'amber' },
    { label: 'Reschedule requests', count: summary.rescheduleRequestCount, detail: summary.rescheduleRequestCount ? 'In progress' : 'No requests', icon: RefreshCw, tone: 'sky' },
  ]

  const toneClasses = {
    green: 'bg-[#eaf8f1] text-[#10a06e]',
    blue: 'bg-[#eef4ff] text-[#2563eb]',
    amber: 'bg-[#fff4e6] text-[#d97706]',
    sky: 'bg-[#eef6ff] text-[#0f65b7]',
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.label} className="min-h-[118px] rounded-[18px] border border-[#dbe5ef] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.045)]">
            <div className="flex items-center gap-4">
              <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ${toneClasses[card.tone]}`}>
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <strong className="block text-[1.55rem] font-semibold leading-none text-[#142132]">{card.count}</strong>
                <span className="mt-1 block text-sm font-medium text-[#4f647b]">{card.label}</span>
                <span className="mt-1 block truncate text-xs font-semibold text-[#38536d]">{card.detail}</span>
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function SellerUpcomingAppointments({ appointments, onConfirm, onReschedule, pendingAction }) {
  return (
    <section className="rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[1.16rem] font-semibold text-[#142132]">Upcoming Appointments</h2>
          <p className="mt-1 text-sm leading-6 text-[#64748b]">Your next scheduled appointments and meetings.</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-[38px] items-center rounded-[11px] border border-[#dbe5ef] bg-white px-4 py-1.5 text-xs font-semibold text-[#21384d] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
        >
          View all appointments
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {appointments.length ? (
          appointments.map((appointment) => (
            <SellerAppointmentCard
              key={appointment.id}
              appointment={appointment}
              onConfirm={onConfirm}
              onReschedule={onReschedule}
              pendingAction={pendingAction}
            />
          ))
        ) : (
          <article className="rounded-[20px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-5 py-8 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#eef4fb] text-[#35546c]">
              <CalendarClock size={22} />
            </span>
            <h3 className="mt-3 text-base font-semibold text-[#142132]">No appointments scheduled yet.</h3>
            <p className="mx-auto mt-1 max-w-[560px] text-sm leading-6 text-[#6b7d93]">
              The team will schedule an appointment when the next step requires it.
            </p>
          </article>
        )}
      </div>
    </section>
  )
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const startDate = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, index) => new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index))
}

function SellerAppointmentCalendar({ events }) {
  const monthDate = useMemo(() => {
    const firstEvent = events.find((event) => event.date)
    const parsed = firstEvent ? new Date(firstEvent.date) : new Date()
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed
  }, [events])
  const monthLabel = monthDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
  const days = buildCalendarDays(monthDate)
  const eventMap = new Map()
  events.forEach((event) => {
    const date = new Date(event.date)
    if (Number.isNaN(date.getTime())) return
    const key = getLocalDateKey(date)
    eventMap.set(key, [...(eventMap.get(key) || []), event])
  })

  return (
    <section className="rounded-[22px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.08rem] font-semibold text-[#142132]">Calendar</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6b7d93] transition hover:bg-[#f1f5f9] hover:text-[#142132]"
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="min-w-[116px] text-center text-sm font-semibold text-[#38536d]">{monthLabel}</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6b7d93] transition hover:bg-[#f1f5f9] hover:text-[#142132]"
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="mt-7 grid grid-cols-7 gap-2 text-center text-[0.68rem] font-semibold uppercase text-[#7b8ca2]">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="mt-4 grid grid-cols-7 gap-x-2 gap-y-4 text-center text-sm">
        {days.map((day) => {
          const key = getLocalDateKey(day)
          const dayEvents = eventMap.get(key) || []
          const inMonth = day.getMonth() === monthDate.getMonth()
          const hasUpcoming = dayEvents.some((event) => event.status !== 'completed' && event.status !== 'reschedule_requested')
          const hasCompleted = dayEvents.some((event) => event.status === 'completed')
          const hasReschedule = dayEvents.some((event) => event.status === 'reschedule_requested')
          const highlighted = hasUpcoming || hasCompleted || hasReschedule
          return (
            <div
              key={key}
              className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full font-medium ${
                highlighted
                  ? hasUpcoming
                    ? 'bg-[#20b982] text-white'
                    : hasCompleted
                      ? 'bg-[#eaf2ff] text-[#2563eb]'
                      : 'bg-[#fff4e6] text-[#d97706]'
                  : inMonth
                    ? 'text-[#142132]'
                    : 'text-[#a8b7c7]'
              }`}
            >
              <span>{day.getDate()}</span>
              {dayEvents.length ? (
                <span className={`mt-0.5 h-1 w-1 rounded-full ${highlighted && hasUpcoming ? 'bg-white' : 'bg-current'}`} />
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="mt-8 grid gap-2 text-xs font-medium text-[#52677f] sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#20b982]" />Upcoming</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#5b8def]" />Completed</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#d97706]" />Reschedule requested</span>
      </div>
    </section>
  )
}

function SellerCompletedAppointments({ appointments, pendingAction }) {
  return (
    <section className="rounded-[18px] border border-[#dbe5ef] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.16rem] font-semibold text-[#142132]">Completed Appointments</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] border border-[#dbe5ef] bg-white px-4 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
          >
            View all
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#dbe5ef] bg-white text-[#38536d] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
            aria-label="Toggle completed appointments"
            title="Toggle completed appointments"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {appointments.length ? (
        <div className="mt-4 space-y-3">
          {appointments.map((appointment) => (
            <SellerAppointmentCard key={appointment.id} appointment={appointment} pendingAction={pendingAction} completed />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function SellerReschedulePrompt({ nextAppointment, onReschedule }) {
  return (
    <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#eef6ff] text-[#2563eb]">
            <RefreshCw size={21} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#142132]">Need to reschedule?</h2>
            <p className="mt-1 text-sm leading-6 text-[#52677f]">
              Send a request to find a time that works better for you.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={!nextAppointment}
          onClick={() => nextAppointment && onReschedule?.(nextAppointment.raw || nextAppointment)}
          title={!nextAppointment ? 'No appointment selected to reschedule.' : undefined}
          className="inline-flex min-h-[38px] items-center justify-center rounded-[10px] border border-[#d5e1ee] bg-white px-4 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Request new time
        </button>
      </div>
    </section>
  )
}

function SellerAppointmentsPage({
  appointments = [],
  pendingAction = '',
  feedbackMessage = '',
  calendarError = '',
  onConfirmAppointment = null,
  onRescheduleAppointment = null,
}) {
  const appointmentData = useMemo(() => buildSellerPortalAppointmentsPayload(appointments), [appointments])

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.85rem] font-semibold text-[#142132]">Appointments</h1>
          <p className="mt-1 text-sm leading-6 text-[#52677f]">View and manage appointments related to your property sale.</p>
        </div>
        <button
          type="button"
          disabled
          title="Appointment requests coming soon."
          className="inline-flex min-h-[42px] cursor-not-allowed items-center gap-2 rounded-[12px] bg-[#10253a] px-4 py-2 text-sm font-semibold text-white opacity-60"
        >
          <Plus size={16} />
          Request appointment
        </button>
      </header>

      {feedbackMessage ? (
        <p className="rounded-[14px] border border-[#cfe4d8] bg-[#eef9f2] px-4 py-3 text-sm font-medium text-[#2f7a51]">{feedbackMessage}</p>
      ) : null}
      {calendarError ? (
        <p className="rounded-[14px] border border-[#f2d0ce] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#9f3028]">{calendarError}</p>
      ) : null}

      <SellerAppointmentKpiCards summary={appointmentData.summary} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <SellerUpcomingAppointments
            appointments={appointmentData.upcomingAppointments}
            pendingAction={pendingAction}
            onConfirm={onConfirmAppointment}
            onReschedule={onRescheduleAppointment}
          />
          <SellerReschedulePrompt
            nextAppointment={appointmentData.summary.nextAppointment}
            onReschedule={onRescheduleAppointment}
          />
          <SellerCompletedAppointments appointments={appointmentData.completedAppointments} pendingAction={pendingAction} />
        </div>
        <aside>
          <SellerAppointmentCalendar events={appointmentData.calendarEvents} />
        </aside>
      </section>
    </section>
  )
}

export default SellerAppointmentsPage
