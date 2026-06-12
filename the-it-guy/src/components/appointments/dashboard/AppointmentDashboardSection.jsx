import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Clock3,
  FileSignature,
  Home,
  KeyRound,
  Landmark,
  MapPin,
  MonitorPlay,
  RefreshCw,
  Scale,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getAppointmentDashboardData,
  getAppointmentStatusPresentation,
} from '../../../services/appointmentDashboardService'

function normalizeText(value) {
  return String(value || '').trim()
}

function initials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function buildUserDirectoryIndex(users = []) {
  const byId = new Map()
  const byEmail = new Map()
  const byName = new Map()
  for (const user of Array.isArray(users) ? users : []) {
    const id = normalizeText(user?.id || user?.userId)
    const email = normalizeText(user?.email).toLowerCase()
    const name = normalizeText(user?.fullName || user?.name)
    if (id) byId.set(id, user)
    if (email) byEmail.set(email, user)
    if (name) byName.set(name.toLowerCase(), user)
  }
  return { byId, byEmail, byName }
}

function resolveUserMatch(appointment = {}, directoryIndex = { byId: new Map(), byEmail: new Map(), byName: new Map() }) {
  const id = normalizeText(appointment?.assignedAgentId || appointment?.agentId)
  const email = normalizeText(appointment?.assignedAgentEmail || appointment?.agentEmail).toLowerCase()
  const name = normalizeText(appointment?.assignedName || appointment?.assignedAgentName || appointment?.agentName).toLowerCase()
  return directoryIndex.byId.get(id) || directoryIndex.byEmail.get(email) || directoryIndex.byName.get(name) || null
}

function statusToneClass(tone = '') {
  if (tone === 'green') return 'border-[#cae8d5] bg-[#eefaf2] text-[#1d7c49]'
  if (tone === 'amber') return 'border-[#f2dfb8] bg-[#fff8e8] text-[#a86b12]'
  if (tone === 'red') return 'border-[#efc9c9] bg-[#fff1f1] text-[#be3b34]'
  return 'border-[#d9e5f1] bg-[#f5f8fb] text-[#60758b]'
}

function summaryToneClass(tone = '') {
  if (tone === 'amber') return 'bg-[#fff6e8] text-[#bb7808]'
  if (tone === 'blue') return 'bg-[#eef5ff] text-[#2a63d3]'
  if (tone === 'red') return 'bg-[#fff1f1] text-[#d24c44]'
  return 'bg-[#f3f7fb] text-[#60758b]'
}

function AppointmentStatusBadge({ status = '', tone = '' }) {
  const presentation = getAppointmentStatusPresentation(status)
  const resolvedTone = tone || presentation.tone
  return (
    <span className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusToneClass(resolvedTone)}`}>
      {presentation.label}
    </span>
  )
}

function AppointmentTypeIcon({ iconKey = 'calendar', className = '' }) {
  const Icon = iconKey === 'home'
    ? Home
    : iconKey === 'user'
      ? UserRound
      : iconKey === 'landmark'
        ? Landmark
        : iconKey === 'signature'
          ? FileSignature
          : iconKey === 'inspection'
            ? Building2
            : iconKey === 'key'
              ? KeyRound
              : iconKey === 'scale'
                ? Scale
                : iconKey === 'presentation'
                  ? MonitorPlay
                  : CalendarDays
  return (
    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#f3f7fb] text-[#2a63d3] ${className}`}>
      <Icon className="h-5 w-5" />
    </span>
  )
}

function AppointmentSummaryCounters({ counts = {} }) {
  const items = [
    { key: 'pendingConfirmation', label: 'Pending Confirmation', icon: Clock3, tone: 'amber', value: counts.pendingConfirmation || 0 },
    { key: 'upcoming', label: 'Upcoming Appointments', icon: CalendarDays, tone: 'blue', value: counts.upcoming || 0 },
    { key: 'needsReschedule', label: 'Needs Reschedule', icon: RefreshCw, tone: 'red', value: counts.needsReschedule || 0 },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div key={item.key} className="flex min-h-[104px] items-center gap-4 rounded-[18px] border border-[#dce6f2] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
            <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${summaryToneClass(item.tone)}`}>
              <Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[2rem] font-semibold leading-none tracking-[-0.05em] text-[#102033]">{item.value}</p>
              <p className="mt-2 text-sm font-medium leading-5 text-[#5f7690]">{item.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AppointmentCalendarStrip({ calendarStrip = {}, onViewCalendar }) {
  const weekDays = Array.isArray(calendarStrip?.weekDays) ? calendarStrip.weekDays : []
  return (
    <section className="rounded-[20px] border border-[#dce6f2] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-[-0.03em] text-[#102033]">{calendarStrip?.currentMonthLabel || 'Appointments'}</p>
        </div>
        <button
          type="button"
          onClick={onViewCalendar}
          className="inline-flex h-9 items-center justify-center rounded-full border border-[#dce6f2] bg-white px-3 text-xs font-semibold text-[#60758b] transition hover:border-[#c5d6e7] hover:text-[#18324b]"
        >
          View
        </button>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2">
        {weekDays.map((day) => (
          <div key={day.date} className="text-center">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7d91a8]">{day.dayLabel}</p>
            <div className={`mx-auto mt-2 flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${day.isSelected ? 'bg-[#2a63d3] text-white' : 'text-[#102033]'}`}>
              {day.dayNumber}
            </div>
            <p className="mt-1 text-[0.68rem] text-[#8aa0b7]">{day.count || ''}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 inline-flex items-center gap-2 text-sm text-[#5f7690]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#2a63d3]" />
        {calendarStrip?.appointmentsToday || 0} appointment{calendarStrip?.appointmentsToday === 1 ? '' : 's'} today
      </div>
    </section>
  )
}

function AvatarChip({ appointment = {}, user = null }) {
  const avatarUrl = normalizeText(user?.avatarUrl || user?.profilePhotoUrl || user?.photoUrl || appointment?.assignedAvatarUrl)
  const label = normalizeText(appointment?.assignedName) || 'Unassigned'
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#d7e2ef] bg-[#f5f8fb] text-sm font-semibold text-[#245076]">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(label)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#102033]">{label || 'Unassigned'}</p>
        <p className="text-sm text-[#60758b]">{appointment?.assignedRole || 'Agent'}</p>
      </div>
    </div>
  )
}

function NextAppointmentCard({
  appointment = null,
  user = null,
  canManage = true,
  onOpenCalendar,
  onManageAppointment,
}) {
  if (!appointment) {
    return (
      <section className="rounded-[24px] border border-[#dce6f2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <p className="text-[0.84rem] font-semibold uppercase tracking-[0.12em] text-[#2a63d3]">Next Appointment</p>
        <div className="mt-8 rounded-[20px] border border-dashed border-[#dbe5ef] bg-[#fbfdff] px-5 py-10 text-center">
          <p className="text-lg font-semibold text-[#102033]">No upcoming appointment</p>
        </div>
      </section>
    )
  }

  const stateTone = appointment.isOverdue
    ? 'border-[#efc9c9] bg-[#fff2f2] text-[#bf3c35]'
    : appointment.isUrgent
      ? 'border-[#f2dfb8] bg-[#fff8e8] text-[#a86b12]'
      : appointment.statusTone === 'green'
        ? 'border-[#cae8d5] bg-[#eefaf2] text-[#1d7c49]'
        : appointment.statusTone === 'red'
          ? 'border-[#efc9c9] bg-[#fff2f2] text-[#bf3c35]'
          : 'border-[#d9e5f1] bg-[#f5f8fb] text-[#60758b]'

  return (
    <section className="rounded-[24px] border border-[#dce6f2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.84rem] font-semibold uppercase tracking-[0.12em] text-[#2a63d3]">Next Appointment</p>
        <AppointmentStatusBadge status={appointment.statusLabel} tone={appointment.statusTone} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[160px_minmax(0,1fr)]">
        <div className="rounded-[20px] bg-[#f6f9fc] px-4 py-6 text-center">
          <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#60758b] shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
            <Clock3 className="h-5 w-5" />
          </span>
          <p className="mt-5 text-[2.3rem] font-semibold leading-none tracking-[-0.05em] text-[#102033]">{appointment.timeLabel}</p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#2a63d3]">{appointment.dateAnchorLabel}</p>
        </div>
        <div className="min-w-0 rounded-[20px] border border-[#e4ecf4] bg-[#fbfdff] p-5">
          <div className="flex items-start gap-4">
            <AppointmentTypeIcon iconKey={appointment.typeIconKey} />
            <div className="min-w-0">
              <h3 className="text-[1.4rem] font-semibold tracking-[-0.04em] text-[#102033]">{appointment.typeLabel}</h3>
              <p className="mt-1 text-[1.02rem] text-[#4f657d]">{appointment.clientName}</p>
              {appointment.propertyAddress ? (
                <div className="mt-3 inline-flex items-center gap-2 text-sm text-[#60758b]">
                  <MapPin className="h-4 w-4 text-[#8aa0b7]" />
                  <span>{appointment.propertyAddress}</span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-5 border-t border-[#e6edf5] pt-4">
            <p className="text-sm text-[#60758b]">Assigned to:</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <AvatarChip appointment={appointment} user={user} />
              <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${stateTone}`}>
                {appointment.isOverdue ? 'Overdue' : appointment.statusLabel}
              </span>
            </div>
          </div>
          <div className={`mt-5 flex items-center gap-2 rounded-[16px] px-4 py-3 text-sm font-semibold ${appointment.isOverdue ? 'bg-[#fff3f3] text-[#bf3c35]' : appointment.isUrgent ? 'bg-[#fff8e8] text-[#a86b12]' : 'bg-[#f5f8ff] text-[#2a63d3]'}`}>
            {appointment.isOverdue ? <AlertTriangle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
            {appointment.countdownLabel}
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onOpenCalendar?.(appointment)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-[#2a63d3] px-4 text-sm font-semibold text-white transition hover:bg-[#204fb0]"
        >
          <CalendarDays className="h-4 w-4" />
          Open Calendar
        </button>
        <button
          type="button"
          onClick={() => onManageAppointment?.(appointment)}
          disabled={!canManage && !onManageAppointment}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-[#cfdceb] bg-white px-4 text-sm font-semibold text-[#1f4f78] transition hover:border-[#b7cadf] hover:bg-[#fbfdff] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CalendarRange className="h-4 w-4" />
          {canManage ? 'Manage Appointment' : 'View Appointment'}
        </button>
      </div>
    </section>
  )
}

function AppointmentTimelineRow({ appointment = {}, onOpenAppointment }) {
  return (
    <button
      type="button"
      onClick={() => onOpenAppointment?.(appointment)}
      className="flex min-h-[76px] w-full items-center gap-4 border-t border-[#edf2f7] px-2 py-3 text-left first:border-t-0 hover:bg-[#fbfdff]"
    >
      <div className="w-16 shrink-0 text-[1.65rem] font-semibold leading-none tracking-[-0.05em] text-[#2a63d3]">{appointment.timeLabel}</div>
      <div className="h-10 w-1 shrink-0 rounded-full bg-[#2a63d3]" />
      <AppointmentTypeIcon iconKey={appointment.typeIconKey} className="h-11 w-11 rounded-[14px] text-[#6f56d9]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-[#102033]">{appointment.typeLabel}</p>
        <p className="truncate text-sm text-[#60758b]">{appointment.clientName}</p>
      </div>
      <div className="hidden shrink-0 md:block">
        <AppointmentStatusBadge status={appointment.statusLabel} tone={appointment.statusTone} />
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#8aa0b7]" />
    </button>
  )
}

function AppointmentTimelineGroup({ group = {}, maxRows = 4, onOpenAppointment, onViewAll }) {
  const rows = Array.isArray(group?.appointments) ? group.appointments : []
  const visibleRows = rows.slice(0, maxRows)
  return (
    <section className="rounded-[24px] border border-[#dce6f2] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#102033]">{group.label}</h3>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#eef4ff] px-2 text-xs font-semibold text-[#2a63d3]">{rows.length}</span>
        </div>
        {rows.length > maxRows ? (
          <button type="button" onClick={() => onViewAll?.(group)} className="text-sm font-semibold text-[#2a63d3]">
            View all
          </button>
        ) : null}
      </div>
      <div className="mt-4">
        {visibleRows.length ? (
          visibleRows.map((appointment) => (
            <AppointmentTimelineRow key={appointment.id || `${appointment.typeLabel}-${appointment.dateTime}`} appointment={appointment} onOpenAppointment={onOpenAppointment} />
          ))
        ) : (
          <div className="rounded-[18px] border border-dashed border-[#dbe5ef] bg-[#fbfdff] px-4 py-8 text-sm text-[#6a8098]">
            No appointments in this period.
          </div>
        )}
      </div>
    </section>
  )
}

function LoadingCard() {
  return (
    <section className="rounded-[24px] border border-[#dce6f2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded-xl bg-[#eef4fb]" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[120px] rounded-[20px] bg-[#f5f8fb]" />
          <div className="h-[120px] rounded-[20px] bg-[#f5f8fb]" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="h-[360px] rounded-[20px] bg-[#f5f8fb]" />
          <div className="space-y-4">
            <div className="h-[170px] rounded-[20px] bg-[#f5f8fb]" />
            <div className="h-[170px] rounded-[20px] bg-[#f5f8fb]" />
          </div>
        </div>
      </div>
    </section>
  )
}

export default function AppointmentDashboardSection({
  module = 'default',
  organisationId = '',
  appointmentRows = null,
  users = [],
  userId = '',
  userEmail = '',
  leadId = '',
  transactionId = '',
  matterId = '',
  listingId = '',
  includeAll = true,
  canManage = true,
  onViewCalendar,
  onOpenCalendar,
  onManageAppointment,
  onScheduleAppointment,
  onOpenAppointment,
  emptyActionLabel = 'Schedule Appointment',
  maxRowsPerGroup = 4,
  refreshKey = '',
  heading = 'Appointments',
  subheading = 'Manage upcoming appointments and requests across your pipeline.',
}) {
  const [state, setState] = useState({ loading: true, error: '', data: null })

  useEffect(() => {
    let active = true
    async function load() {
      setState((previous) => ({ ...previous, loading: true, error: '' }))
      try {
        const data = await getAppointmentDashboardData({
          module,
          organisationId,
          appointments: Array.isArray(appointmentRows) ? appointmentRows : undefined,
          userId,
          userEmail,
          leadId,
          transactionId,
          matterId,
          listingId,
          includeAll,
        })
        if (!active) return
        setState({ loading: false, error: '', data })
      } catch (error) {
        if (!active) return
        setState({
          loading: false,
          error: error?.message || 'Unable to load appointments right now.',
          data: null,
        })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [appointmentRows, includeAll, leadId, listingId, matterId, module, organisationId, refreshKey, transactionId, userEmail, userId])

  const directoryIndex = useMemo(() => buildUserDirectoryIndex(users), [users])

  const data = state.data
  const nextAppointmentUser = data?.nextAppointment
    ? resolveUserMatch(data.nextAppointment, directoryIndex)
    : null

  if (state.loading) return <LoadingCard />

  return (
    <section className="rounded-[24px] border border-[#dce6f2] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)] sm:p-7">
      <div className="flex flex-col gap-4 border-b border-[#e7eef5] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[#edf4ff] text-[#2a63d3]">
            <CalendarDays className="h-8 w-8" />
          </span>
          <div>
            <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-[#102033]">{heading}</h2>
            <p className="mt-2 text-[1.02rem] text-[#5f7690]">{subheading}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onViewCalendar?.()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-[#d6e2ef] bg-white px-4 text-sm font-semibold text-[#2a63d3] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-[#bed0e3] hover:bg-[#fbfdff]"
        >
          <CalendarDays className="h-4 w-4" />
          View Calendar
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {state.error ? (
        <div className="mt-5 rounded-[18px] border border-[#f3c9c9] bg-[#fff5f5] px-4 py-3 text-sm font-medium text-[#b42318]">
          {state.error}
        </div>
      ) : null}

      {!data || data.empty ? (
        <div className="mt-6 rounded-[20px] border border-dashed border-[#dbe5ef] bg-[#fbfdff] px-6 py-12 text-center">
          <p className="text-xl font-semibold tracking-[-0.03em] text-[#102033]">No appointments scheduled</p>
          <p className="mt-2 text-sm text-[#60758b]">Your upcoming appointments and client meetings will appear here.</p>
          {onScheduleAppointment ? (
            <button
              type="button"
              onClick={() => onScheduleAppointment()}
              className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-[#2a63d3] px-4 text-sm font-semibold text-white transition hover:bg-[#204fb0]"
            >
              <CalendarDays className="h-4 w-4" />
              {emptyActionLabel}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <AppointmentSummaryCounters counts={data.counts} />
            <AppointmentCalendarStrip calendarStrip={data.calendarStrip} onViewCalendar={onViewCalendar} />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
            <NextAppointmentCard
              appointment={data.nextAppointment}
              user={nextAppointmentUser}
              canManage={canManage}
              onOpenCalendar={onOpenCalendar || onViewCalendar}
              onManageAppointment={onManageAppointment || onOpenAppointment}
            />
            <div className="grid gap-4">
              {data.groups.map((group) => (
                <AppointmentTimelineGroup
                  key={group.label}
                  group={group}
                  maxRows={maxRowsPerGroup}
                  onOpenAppointment={onOpenAppointment || onManageAppointment}
                  onViewAll={() => onViewCalendar?.()}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

export {
  AppointmentSummaryCounters,
  AppointmentCalendarStrip,
  NextAppointmentCard,
  AppointmentTimelineGroup,
  AppointmentTimelineRow,
  AppointmentStatusBadge,
  AppointmentTypeIcon,
}
