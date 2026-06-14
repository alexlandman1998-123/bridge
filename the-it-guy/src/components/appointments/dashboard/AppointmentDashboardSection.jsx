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

function toDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function cloneDate(value = new Date()) {
  return new Date(value.getTime())
}

function startOfDay(value = new Date()) {
  const date = cloneDate(toDate(value) || new Date())
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(value = new Date(), amount = 0) {
  const date = cloneDate(toDate(value) || new Date())
  date.setDate(date.getDate() + amount)
  return date
}

function isSameDay(left = null, right = null) {
  const leftDate = toDate(left)
  const rightDate = toDate(right)
  if (!leftDate || !rightDate) return false
  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
    && leftDate.getDate() === rightDate.getDate()
}

function isSameMonth(left = null, right = null) {
  const leftDate = toDate(left)
  const rightDate = toDate(right)
  if (!leftDate || !rightDate) return false
  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
}

function startOfMonth(value = new Date()) {
  const date = cloneDate(toDate(value) || new Date())
  date.setDate(1)
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfMonth(value = new Date()) {
  const date = startOfMonth(value)
  date.setMonth(date.getMonth() + 1)
  date.setDate(0)
  date.setHours(23, 59, 59, 999)
  return date
}

function startOfWeekMonday(value = new Date()) {
  const date = startOfDay(value)
  const dayOfWeek = date.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  return addDays(date, mondayOffset)
}

function formatCompactDate(value) {
  const date = toDate(value)
  if (!date) return 'Date pending'
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function dateKey(value = new Date()) {
  const date = toDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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

function compactToneClass(tone = '') {
  if (tone === 'green') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (tone === 'red') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (tone === 'rose') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (tone === 'blue') return 'border-blue-200 bg-blue-50 text-blue-600'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

function compactAccentClass(tone = '') {
  if (tone === 'green') return 'bg-emerald-500/75'
  if (tone === 'amber') return 'bg-amber-500/75'
  if (tone === 'red') return 'bg-rose-500/75'
  if (tone === 'rose') return 'bg-rose-500/75'
  if (tone === 'blue') return 'bg-blue-500/75'
  return 'bg-slate-400/75'
}

function CompactStatusPill({ status = '', tone = '' }) {
  const presentation = getAppointmentStatusPresentation(status)
  const resolvedTone = tone || presentation.tone
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${compactToneClass(resolvedTone)}`}>
      {presentation.label}
    </span>
  )
}

function AppointmentMetric({ label, value, tone = 'slate' }) {
  const displayValue = typeof value === 'number' ? new Intl.NumberFormat('en-ZA').format(value) : value
  return (
    <article className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${compactAccentClass(tone)}`} />
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-[1.25rem] font-semibold leading-none tracking-[-0.04em] text-slate-950 tabular-nums sm:text-[1.45rem]">
        {displayValue}
      </p>
    </article>
  )
}

function buildCompactCalendarDays(appointments = [], selectedDate = null, now = new Date()) {
  const referenceDate = toDate(now) || new Date()
  const monthStart = startOfMonth(referenceDate)
  const monthEnd = endOfMonth(referenceDate)
  const gridStart = startOfWeekMonday(monthStart)
  const visibleAppointments = []
  const dayCounts = new Map()

  for (const appointment of Array.isArray(appointments) ? appointments : []) {
    const statusKey = normalizeText(appointment?.statusKey || appointment?.status).toLowerCase()
    if (['completed', 'cancelled', 'canceled', 'no_show'].includes(statusKey)) continue
    const date = toDate(appointment?.dateTime)
    if (!date || !isSameMonth(date, referenceDate)) continue
    const key = dateKey(date)
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1)
    visibleAppointments.push(date)
  }

  let focusDate = toDate(selectedDate)
  if (!focusDate || !isSameMonth(focusDate, referenceDate)) {
    const futureAppointment = visibleAppointments
      .filter((date) => date.getTime() >= startOfDay(referenceDate).getTime())
      .sort((left, right) => left.getTime() - right.getTime())[0]
    focusDate = futureAppointment
      || visibleAppointments.slice().sort((left, right) => left.getTime() - right.getTime())[0]
      || referenceDate
  }

  const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  const days = Array.from({ length: 42 }).map((_, index) => {
    const date = addDays(gridStart, index)
    const key = dateKey(date)
    return {
      key,
      date,
      dayNumber: date.getDate(),
      inMonth: date >= monthStart && date <= monthEnd,
      isToday: isSameDay(date, referenceDate),
      isSelected: isSameDay(date, focusDate),
      count: dayCounts.get(key) || 0,
    }
  })

  return {
    monthLabel: referenceDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
    weekdays,
    days,
  }
}

function MiniMonthCalendar({ appointments = [], selectedDate = null, currentMonthLabel = '' }) {
  const calendar = useMemo(
    () => buildCompactCalendarDays(appointments, selectedDate),
    [appointments, selectedDate],
  )

  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Mini Calendar</p>
          <h3 className="mt-1 text-sm font-semibold tracking-[-0.03em] text-slate-950">
            {currentMonthLabel || calendar.monthLabel}
          </h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-[0.68rem] font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500/80" />
            With appointments
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[0.55rem] font-semibold text-slate-500">
              T
            </span>
            Today
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {calendar.weekdays.map((day) => (
          <span key={day} className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {day}
          </span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {calendar.days.map((day) => {
          const baseClass = day.inMonth
            ? 'border-slate-200/70 bg-white text-slate-700'
            : 'border-transparent bg-transparent text-slate-300'
          const stateClass = day.isSelected
            ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
            : day.isToday
              ? 'border-slate-300 bg-slate-100 text-slate-950 shadow-sm'
              : baseClass

          return (
            <div
              key={day.key}
              className={`flex min-h-[4.4rem] flex-col rounded-2xl border px-2 py-2 text-left transition ${stateClass}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[0.76rem] font-semibold leading-none tabular-nums">{day.dayNumber}</span>
                {day.count > 0 ? (
                  <span className="inline-flex items-center gap-0.5 pt-0.5">
                    {Array.from({ length: Math.min(day.count, 3) }).map((_, index) => (
                      <span key={`${day.key}-${index}`} className="h-1.5 w-1.5 rounded-full bg-blue-500/75" />
                    ))}
                    {day.count > 3 ? (
                      <span className="text-[0.58rem] font-semibold tracking-tight text-blue-600">+{day.count - 3}</span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <div className="mt-auto flex justify-center">
                {day.count > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-blue-500/80" /> : <span className="h-1.5 w-1.5 rounded-full bg-transparent" />}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CompactNextAppointmentCard({
  appointment = null,
  canManage = true,
  onOpenCalendar,
  onManageAppointment,
}) {
  if (!appointment) {
    return (
      <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Next Appointment</p>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-dashed border-slate-200/80 bg-slate-50/70 px-4 py-5">
            <p className="text-sm font-semibold text-slate-950">No upcoming appointments</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Your upcoming viewings, consultations, and meetings will appear here.
            </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenCalendar?.(appointment)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <CalendarDays className="h-4 w-4" />
            Open Calendar
          </button>
          <button
            type="button"
            onClick={() => onManageAppointment?.(appointment)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <CalendarRange className="h-4 w-4" />
            {canManage ? 'Manage Appointments' : 'View Appointments'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Clock3 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Next Appointment</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">Your next scheduled client touchpoint.</p>
          </div>
        </div>
        <CompactStatusPill status={appointment.statusLabel} tone={appointment.statusTone} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Clock3 className="h-4 w-4 text-blue-600" />
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em]">Time</span>
          </div>
          <p className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.05em] text-slate-950 tabular-nums">
            {appointment.timeLabel || '—'}
          </p>
          <p className="mt-2 text-sm font-medium text-slate-500">
            {formatCompactDate(appointment.dateTime)}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[1.02rem] font-semibold tracking-[-0.03em] text-slate-950">
                {appointment.typeLabel || 'Appointment'}
              </h3>
              <p className="mt-1 text-sm font-medium text-slate-600">{appointment.clientName || 'Client pending'}</p>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200/70 bg-slate-50 px-2.5 py-1 text-[0.72rem] font-semibold text-slate-600">
              {appointment.dateAnchorLabel || 'Upcoming'}
            </span>
          </div>

          {appointment.propertyAddress ? (
            <div className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="line-clamp-2">{appointment.propertyAddress}</span>
            </div>
          ) : null}

          {appointment.countdownLabel ? (
            <div className="mt-3 inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {appointment.countdownLabel}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpenCalendar?.(appointment)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <CalendarDays className="h-4 w-4" />
          Open Calendar
        </button>
        <button
          type="button"
          onClick={() => onManageAppointment?.(appointment)}
          disabled={!canManage && !onManageAppointment}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CalendarRange className="h-4 w-4" />
          {canManage ? 'Manage Appointments' : 'View Appointments'}
        </button>
      </div>
    </section>
  )
}

function AppointmentsOverviewCard({
  data = null,
  canManage = true,
  onViewCalendar,
  onOpenCalendar,
  onManageAppointment,
  onOpenAppointment,
}) {
  const appointments = Array.isArray(data?.appointments) ? data.appointments : []
  const counts = data?.counts || {}
  const nextAppointment = data?.nextAppointment || null
  const selectedDate = nextAppointment?.dateTime || data?.calendarStrip?.selectedDate || null
  const manageHandler = onManageAppointment || onOpenAppointment || onViewCalendar
  const openHandler = onOpenCalendar || onViewCalendar || manageHandler
  const viewCalendarHandler = onViewCalendar || openHandler

  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 border-b border-slate-200/70 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-slate-950">Appointments</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Track upcoming appointments, confirmations, and reschedules.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => viewCalendarHandler?.()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
        >
          <CalendarDays className="h-4 w-4" />
          View Calendar
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <AppointmentMetric label="Upcoming" value={counts.upcoming || 0} tone="blue" />
        <AppointmentMetric label="Pending Confirmation" value={counts.pendingConfirmation || 0} tone="amber" />
        <AppointmentMetric label="Needs Reschedule" value={counts.needsReschedule || 0} tone="rose" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CompactNextAppointmentCard
          appointment={nextAppointment}
          canManage={canManage}
          onOpenCalendar={openHandler}
          onManageAppointment={manageHandler}
        />
        <MiniMonthCalendar
          appointments={appointments}
          selectedDate={selectedDate}
          currentMonthLabel={data?.calendarStrip?.currentMonthLabel || ''}
        />
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

function CompactLoadingCard() {
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="animate-pulse space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-slate-100" />
            <div className="space-y-2">
              <div className="h-4 w-36 rounded-full bg-slate-100" />
              <div className="h-3 w-64 rounded-full bg-slate-100" />
            </div>
          </div>
          <div className="h-9 w-28 rounded-full bg-slate-100" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-[260px] rounded-3xl bg-slate-100" />
          <div className="h-[260px] rounded-3xl bg-slate-100" />
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
  variant = 'legacy',
}) {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const isCompact = variant === 'compact'

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

  if (state.loading) return isCompact ? <CompactLoadingCard /> : <LoadingCard />

  if (isCompact) {
    return (
      <div className="space-y-3">
        {state.error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm">
            {state.error}
          </div>
        ) : null}
        <AppointmentsOverviewCard
          data={data}
          canManage={canManage}
          onViewCalendar={onViewCalendar}
          onOpenCalendar={onOpenCalendar}
          onManageAppointment={onManageAppointment}
          onOpenAppointment={onOpenAppointment}
        />
      </div>
    )
  }

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
