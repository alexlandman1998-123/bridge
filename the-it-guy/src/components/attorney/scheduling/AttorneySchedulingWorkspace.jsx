import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  LayoutGrid,
  Plus,
  RefreshCw,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react'
import {
  assignAttorneyAppointmentResource,
  createAttorneyAppointmentInvite,
  proposeAttorneyAppointmentReschedule,
  resendAttorneyAppointmentCommunication,
  resolveAttorneyAppointmentReschedule,
  updateAttorneyAppointmentOperationalStatus,
  upsertAttorneyAppointmentParticipant,
} from '../../../services/attorneyOperations'
import { getAppointmentTypeTemplate, getAppointmentRequiredPrep } from '../../../services/appointmentTemplateService'

const BUSINESS_DAY_START = 8
const BUSINESS_DAY_END = 18
const BUSINESS_DAY_MINUTES = (BUSINESS_DAY_END - BUSINESS_DAY_START) * 60

const APPOINTMENT_TONES = {
  transfer: {
    label: 'Transfer Signing',
    accent: '#2563eb',
    text: '#174ea6',
    bg: '#eff6ff',
    border: '#bfdbfe',
  },
  bond: {
    label: 'Bond Signing',
    accent: '#7c3aed',
    text: '#5b21b6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
  },
  cancellation: {
    label: 'Cancellation Signing',
    accent: '#16a34a',
    text: '#166534',
    bg: '#ecfdf3',
    border: '#bbf7d0',
  },
  reschedule: {
    label: 'Reschedule Request',
    accent: '#f97316',
    text: '#9a3412',
    bg: '#fff7ed',
    border: '#fed7aa',
  },
  internal: {
    label: 'Internal Meeting',
    accent: '#64748b',
    text: '#334155',
    bg: '#f8fafc',
    border: '#dbe3ef',
  },
}

const STATUS_TONES = {
  confirmed: { label: 'Confirmed', color: '#067647', bg: '#ecfdf3', border: '#bbf7d0' },
  awaiting_confirmation: { label: 'Pending', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  reschedule_requested: { label: 'Reschedule Requested', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  blocked: { label: 'Blocked', color: '#b42318', bg: '#fef3f2', border: '#fecaca' },
  completed: { label: 'Completed', color: '#067647', bg: '#ecfdf3', border: '#bbf7d0' },
  cancelled: { label: 'Cancelled', color: '#475569', bg: '#f8fafc', border: '#dbe3ef' },
}

const VIEW_MODES = ['Day', 'Week', 'Month', 'Agenda']

const ATTORNEY_INVITE_TYPES = [
  {
    value: 'transfer_signing',
    label: 'Transfer Signing',
    helper: 'Buyer or seller transfer document signing.',
    participantRole: 'Client',
  },
  {
    value: 'bond_signing',
    label: 'Bond Signing',
    helper: 'Buyer bond registration document signing.',
    participantRole: 'Buyer',
  },
  {
    value: 'attorney_consultation',
    label: 'Attorney Consultation',
    helper: 'Legal process questions, readiness, or next steps.',
    participantRole: 'Client',
  },
  {
    value: 'internal_meeting',
    label: 'Internal Prep',
    helper: 'Firm-only coordination before a signing.',
    participantRole: 'Attorney',
    visibility: 'internal_only',
  },
]

const DEFAULT_INVITE_DRAFT = {
  appointmentType: 'transfer_signing',
  matterId: '',
  recipientName: '',
  recipientEmail: '',
  date: '',
  startTime: '',
  locationType: 'video_call',
  location: '',
  resourceId: '',
  notes: '',
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isPast(dateTimeValue) {
  const value = new Date(dateTimeValue || '').getTime()
  if (!Number.isFinite(value)) return false
  return value < Date.now()
}

function isSameCalendarDay(leftValue, rightValue) {
  const left = new Date(leftValue || '')
  const right = new Date(rightValue || '')
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
}

function isToday(dateTimeValue) {
  return isSameCalendarDay(dateTimeValue, new Date())
}

function addDays(date, count) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfWeek(date) {
  const next = startOfDay(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  return next
}

function startOfMonth(date) {
  const next = startOfDay(date)
  next.setDate(1)
  return next
}

function formatDate(value, options = {}) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return 'Date pending'
  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: options.includeYear === false ? undefined : 'numeric',
  })
}

function formatTime(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return 'Time pending'
  return parsed.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return 'Date pending'
  return parsed.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRangeLabel(start, end) {
  if (!start || !end) return 'Date range'
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (sameMonth) {
    return `${start.toLocaleDateString('en-ZA', { day: '2-digit' })} - ${end.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`
  }
  return `${formatDate(start)} - ${formatDate(end)}`
}

function resolveOperationalStatus(row = {}) {
  const status = normalizeLower(row.status)
  if (!status) return 'awaiting_confirmation'
  if (status.includes('cancel')) return 'cancelled'
  if (status.includes('complete')) return 'completed'
  if (status.includes('block')) return 'blocked'
  if (status.includes('reschedule')) return 'reschedule_requested'
  if (status.includes('pending') || status.includes('proposed') || status.includes('requested')) return 'awaiting_confirmation'
  if (status.includes('confirm')) return 'confirmed'
  return 'awaiting_confirmation'
}

function readinessLabel(blockers = [], status = '') {
  const normalizedStatus = resolveOperationalStatus({ status })
  if (normalizedStatus === 'cancelled') return 'Cancelled'
  if (normalizedStatus === 'completed') return 'Ready'
  if (blockers.some((item) => item.toLowerCase().includes('document'))) return 'Waiting on Documents'
  if (blockers.some((item) => item.toLowerCase().includes('confirm'))) return 'Waiting on Client'
  if (blockers.some((item) => item.toLowerCase().includes('attorney'))) return 'Waiting on Attorney'
  if (blockers.length) return 'Blocked'
  return 'Ready'
}

function prettifyOperationalStatus(value = '') {
  const normalized = normalizeText(value).replaceAll('_', ' ')
  if (!normalized) return 'Awaiting Confirmation'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function hasOutstandingDocState(status = '') {
  const normalized = normalizeLower(status)
  return ['requested', 'uploaded', 'rejected', 'required', 'under_review'].includes(normalized)
}

function roleCanSeeMatterType(role = '', matterType = '') {
  const normalizedRole = normalizeLower(role)
  const normalizedMatterType = normalizeLower(matterType)
  if (['firm_admin', 'director_partner', 'conveyancing_secretary', 'reception_scheduling'].includes(normalizedRole)) return true
  if (normalizedRole === 'transfer_attorney') return normalizedMatterType.includes('transfer')
  if (normalizedRole === 'bond_attorney') return normalizedMatterType.includes('bond')
  return true
}

function createReadiness(row, documentQueueByTransaction = {}) {
  const blockers = []
  const transactionId = normalizeText(row.transactionId)
  const docs = transactionId ? (documentQueueByTransaction[transactionId] || []) : []
  const pendingDocs = docs.filter((item) => hasOutstandingDocState(item.status))
  if (pendingDocs.length) blockers.push('Required document checks are still pending.')

  const template = getAppointmentTypeTemplate(row.appointmentTypeKey || row.appointmentType)
  const prepChecklist = getAppointmentRequiredPrep(template.type, {
    requirementStatusByKey: {},
    uploadedRequirementKeys: [],
  })
  if (prepChecklist.some((item) => item.completed === false)) {
    blockers.push('Template prep requirements still need confirmation.')
  }

  const status = resolveOperationalStatus(row)
  if (status === 'awaiting_confirmation') {
    blockers.push('Client confirmation is still outstanding.')
  }
  if (!normalizeText(row.assignedAttorneyName) && normalizeLower(row.matterType).includes('transfer')) {
    blockers.push('Transfer attorney allocation missing.')
  }

  if (normalizeLower(row.appointmentTypeKey).includes('transfer')) {
    if (row.flags?.guaranteesOutstanding) blockers.push('Guarantees are still outstanding.')
    if (row.flags?.awaitingFica) blockers.push('FICA documentation is outstanding.')
  }

  if (normalizeLower(row.appointmentTypeKey).includes('bond')) {
    if (row.flags?.bankConditionsPending) blockers.push('Bank conditions are outstanding.')
    if (row.flags?.awaitingFica) blockers.push('Buyer finance/FICA documents are incomplete.')
  }

  if (!normalizeText(row.resourceId) && normalizeLower(row.appointmentTypeKey).includes('signing')) {
    blockers.push('Boardroom/resource is not allocated yet.')
  }

  const label = readinessLabel(blockers, row.status)
  return {
    label,
    blockers,
  }
}

function buildSchedulingRows({ appointmentRows = [], matterRows = [], documentRows = [], role = '' }) {
  const matterByReference = (matterRows || []).reduce((acc, row) => {
    acc[row.matterReference] = row
    return acc
  }, {})

  const documentQueueByTransaction = (documentRows || []).reduce((acc, row) => {
    const key = normalizeText(row.transactionId)
    if (!key) return acc
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  return (appointmentRows || [])
    .map((row) => {
      const matter = matterByReference[row.matterReference] || null
      const operationalStatus = resolveOperationalStatus(row)
      const readiness = createReadiness({
        ...row,
        transactionId: row.transactionId,
        matterType: matter?.matterType || row.matterType || '',
        flags: matter?.flags || row.flags || {},
        assignedAttorneyName: row.assignedAttorneyName || matter?.assignedAttorneyName || '',
      }, documentQueueByTransaction)

      const warnings = readiness.blockers
      const transferWarnings = warnings.filter((item) => item.toLowerCase().includes('guarantee') || item.toLowerCase().includes('levy') || item.toLowerCase().includes('fica') || item.toLowerCase().includes('document'))
      const bondWarnings = warnings.filter((item) => item.toLowerCase().includes('bank') || item.toLowerCase().includes('finance') || item.toLowerCase().includes('document'))

      return {
        ...row,
        matterType: matter?.matterType || row.matterType || 'Transfer',
        flags: matter?.flags || row.flags || {},
        operationalStatus,
        operationalStatusLabel: prettifyOperationalStatus(operationalStatus),
        readiness,
        transferWarnings,
        bondWarnings,
        transactionId: row.transactionId || null,
        requiredDocuments: Array.isArray(row.requiredDocuments) ? row.requiredDocuments : [],
      }
    })
    .filter((row) => roleCanSeeMatterType(role, row.matterType))
}

function sortByDateAscending(rows = []) {
  return [...rows].sort((a, b) => new Date(a.dateTime || 0).getTime() - new Date(b.dateTime || 0).getTime())
}

function filterActive(rows = []) {
  return rows.filter((row) => !['cancelled', 'completed'].includes(row.operationalStatus))
}

function buildRescheduleRows(appointmentRows = []) {
  return appointmentRows
    .flatMap((appointment) => (Array.isArray(appointment.rescheduleRequests) ? appointment.rescheduleRequests.map((request) => ({
      requestId: request.id,
      appointmentId: appointment.id,
      appointmentType: appointment.appointmentType,
      matterReference: appointment.matterReference,
      clientName: appointment.clientName,
      requestedByRole: request.requestedByRole,
      reason: request.reason,
      preferredStart: request.preferredStart,
      preferredEnd: request.preferredEnd,
      status: request.status,
      appointment,
    })) : []))
    .filter((row) => ['pending', 'proposed'].includes(normalizeLower(row.status)))
}

function normalizeStaffOptions(members = []) {
  return (members || [])
    .filter((member) => ['conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney'].includes(normalizeLower(member.role)))
    .map((member) => ({
      value: member.value,
      label: member.label,
    }))
}

function classifyAppointment(row = {}) {
  const haystack = normalizeLower(`${row.appointmentTypeKey || ''} ${row.appointmentType || ''} ${row.status || ''}`)
  if (haystack.includes('reschedule')) return 'reschedule'
  if (haystack.includes('bond')) return 'bond'
  if (haystack.includes('cancel')) return 'cancellation'
  if (haystack.includes('transfer')) return 'transfer'
  return 'internal'
}

function getAppointmentTone(row = {}) {
  return APPOINTMENT_TONES[classifyAppointment(row)] || APPOINTMENT_TONES.internal
}

function getStatusTone(row = {}) {
  if (row.readiness?.label === 'Blocked') return STATUS_TONES.blocked
  return STATUS_TONES[row.operationalStatus] || STATUS_TONES.awaiting_confirmation
}

function appointmentMatchesMatterType(row = {}, value = 'all') {
  if (value === 'all') return true
  return classifyAppointment(row) === value || normalizeLower(row.matterType).includes(value)
}

function appointmentMatchesAttorney(row = {}, value = 'all') {
  if (value === 'all') return true
  return [row.assignedAttorneyId, row.assignedSecretaryId, row.assignedAdminHandlerId].some((id) => String(id || '') === String(value))
}

function appointmentMatchesBoardroom(row = {}, value = 'all') {
  if (value === 'all') return true
  if (value === 'unassigned') return !normalizeText(row.resourceId)
  return String(row.resourceId || '') === String(value)
}

function appointmentMatchesDateRange(row = {}, value = 'all', selectedDate = new Date()) {
  const parsed = new Date(row.dateTime || '')
  if (Number.isNaN(parsed.getTime())) return value === 'all'
  const today = startOfDay(new Date())
  if (value === 'today') return isSameCalendarDay(parsed, today)
  if (value === 'week') {
    const weekStart = startOfWeek(selectedDate)
    const weekEnd = addDays(weekStart, 7)
    return parsed >= weekStart && parsed < weekEnd
  }
  if (value === 'month') {
    return parsed.getMonth() === selectedDate.getMonth() && parsed.getFullYear() === selectedDate.getFullYear()
  }
  return true
}

function resolveAppointmentDuration(row = {}) {
  const type = classifyAppointment(row)
  if (type === 'bond') return 60
  if (type === 'transfer') return 60
  if (type === 'cancellation') return 45
  if (type === 'reschedule') return 30
  return 45
}

function buildVisibleRows(rows = [], filters = {}, selectedDate = new Date()) {
  const query = normalizeLower(filters.query)
  return rows.filter((row) => {
    const searchable = normalizeLower([
      row.matterReference,
      row.clientName,
      row.appointmentType,
      row.status,
      row.resourceName,
      row.assignedAttorneyName,
      row.assignedSecretaryName,
    ].join(' '))
    if (query && !searchable.includes(query)) return false
    if (!appointmentMatchesMatterType(row, filters.matterType)) return false
    if (!appointmentMatchesAttorney(row, filters.attorney)) return false
    if (filters.status === 'blocked' && row.readiness?.label !== 'Blocked' && row.operationalStatus !== 'blocked') return false
    if (filters.status !== 'all' && filters.status !== 'blocked' && row.operationalStatus !== filters.status) return false
    if (!appointmentMatchesBoardroom(row, filters.boardroom)) return false
    if (!appointmentMatchesDateRange(row, filters.dateRange, selectedDate)) return false
    return true
  })
}

function buildBoardroomRows(resources = [], rows = []) {
  const activeRows = filterActive(rows)
  if (!resources.length) {
    const assigned = activeRows.filter((row) => normalizeText(row.resourceId)).length
    return [{
      id: 'unconfigured',
      name: 'Boardrooms',
      bookings: assigned,
      utilisation: activeRows.length ? Math.round((assigned / activeRows.length) * 100) : 0,
    }]
  }

  return resources.map((resource) => {
    const bookings = activeRows.filter((row) => String(row.resourceId || '') === String(resource.resourceId || '')).length
    const utilisation = Math.min(100, Math.round((bookings / 10) * 100))
    return {
      id: resource.resourceId,
      name: resource.resourceName,
      bookings,
      utilisation,
    }
  })
}

function buildOperationalFeed(rows = [], rescheduleRows = []) {
  const appointmentFeed = sortByDateAscending(rows)
    .slice(0, 8)
    .map((row) => ({
      id: `appointment-${row.id}`,
      tone: getAppointmentTone(row),
      title: `${row.appointmentType || 'Appointment'} ${row.operationalStatus === 'confirmed' ? 'confirmed' : 'scheduled'}`,
      description: `${row.matterReference} - ${row.clientName || 'Client pending'}`,
      timestamp: row.dateTime,
    }))

  const reschedules = rescheduleRows.slice(0, 4).map((row) => ({
    id: `reschedule-${row.requestId}`,
    tone: APPOINTMENT_TONES.reschedule,
    title: 'Client requested reschedule',
    description: `${row.matterReference} - ${row.reason || 'New time requested'}`,
    timestamp: row.preferredStart,
  }))

  return sortByDateAscending([...appointmentFeed, ...reschedules]).slice(0, 9)
}

function buildDayColumns(viewMode = 'Week', selectedDate = new Date()) {
  const normalizedView = normalizeLower(viewMode)
  if (normalizedView === 'day') return [startOfDay(selectedDate)]
  const weekStart = startOfWeek(selectedDate)
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

function buildMonthCells(selectedDate = new Date()) {
  const monthStart = startOfMonth(selectedDate)
  const gridStart = startOfWeek(monthStart)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

function metricSubtitle(key, value) {
  if (key === 'todaysAppointments') return value ? 'On today' : 'No appointments today'
  if (key === 'pendingConfirmations') return value ? 'Awaiting responses' : 'Clear'
  if (key === 'blockedSignings') return value ? 'Require attention' : 'No blockers'
  if (key === 'overdueSignings') return value ? 'Past due' : 'None overdue'
  if (key === 'rescheduleRequests') return value ? 'Waiting on response' : 'No requests'
  return 'This week'
}

function getInviteType(value = '') {
  return ATTORNEY_INVITE_TYPES.find((item) => item.value === value) || ATTORNEY_INVITE_TYPES[0]
}

function buildMatterOptions(matterRows = []) {
  return (matterRows || [])
    .map((row) => {
      const matterId = normalizeText(row.matterId || row.transactionId || row.id || row.transaction_id)
      const matterReference = normalizeText(row.matterReference || row.reference || row.transaction_reference)
      if (!matterId) return null
      return {
        matterId,
        matterReference: matterReference || `MAT-${matterId.slice(0, 8).toUpperCase()}`,
        clientName: normalizeText(row.clientName || row.buyerName || row.sellerName),
        matterType: normalizeText(row.matterType || row.assignmentType),
        organisationId: normalizeText(row.organisationId || row.organisation_id),
      }
    })
    .filter(Boolean)
}

function SchedulingPageHeader({ onCreateInvite }) {
  return (
    <section className="scheduling-page-header">
      <div>
        <span>Attorney Calendar</span>
        <h1>Scheduling</h1>
        <p>Signings, consultations, boardrooms, confirmations, and reschedules.</p>
      </div>
      <div className="scheduling-header-actions">
        <button type="button" className="scheduling-primary-action" onClick={onCreateInvite}>
          <Plus size={16} />
          Create Invite
        </button>
      </div>
    </section>
  )
}

function FilterToolbar({ filters, setFilters, resources, memberOptions }) {
  return (
    <section className="scheduling-toolbar">
      <label className="scheduling-search">
        <Search size={16} />
        <input
          value={filters.query}
          onChange={(event) => setFilters((previous) => ({ ...previous, query: event.target.value }))}
          placeholder="Search matters, clients, or appointments..."
        />
      </label>
      <select value={filters.attorney} onChange={(event) => setFilters((previous) => ({ ...previous, attorney: event.target.value }))}>
        <option value="all">All attorneys</option>
        {memberOptions.map((member) => (
          <option key={member.value} value={member.value}>{member.label}</option>
        ))}
      </select>
      <select value={filters.matterType} onChange={(event) => setFilters((previous) => ({ ...previous, matterType: event.target.value }))}>
        <option value="all">All matter types</option>
        <option value="transfer">Transfer</option>
        <option value="bond">Bond</option>
        <option value="cancellation">Cancellation</option>
      </select>
      <select value={filters.status} onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))}>
        <option value="all">All statuses</option>
        <option value="confirmed">Confirmed</option>
        <option value="awaiting_confirmation">Pending</option>
        <option value="reschedule_requested">Reschedule requested</option>
        <option value="blocked">Blocked</option>
      </select>
      <select value={filters.boardroom} onChange={(event) => setFilters((previous) => ({ ...previous, boardroom: event.target.value }))}>
        <option value="all">All boardrooms</option>
        <option value="unassigned">Unassigned</option>
        {resources.map((resource) => (
          <option key={resource.resourceId} value={resource.resourceId}>{resource.resourceName}</option>
        ))}
      </select>
      <select value={filters.dateRange} onChange={(event) => setFilters((previous) => ({ ...previous, dateRange: event.target.value }))}>
        <option value="all">All dates</option>
        <option value="today">Today</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
      </select>
    </section>
  )
}

function MetricsStrip({ metrics }) {
  const cards = [
    { key: 'todaysAppointments', label: "Today's Appointments", icon: CalendarDays, value: metrics.todaysAppointments },
    { key: 'pendingConfirmations', label: 'Pending Confirmations', icon: Clock3, value: metrics.pendingConfirmations },
    { key: 'blockedSignings', label: 'Blocked Signings', icon: AlertTriangle, value: metrics.blockedSignings },
    { key: 'overdueSignings', label: 'Overdue Signings', icon: AlertTriangle, value: metrics.overdueSignings },
    { key: 'rescheduleRequests', label: 'Reschedule Requests', icon: RefreshCw, value: metrics.rescheduleRequests },
    { key: 'boardroomUtilisation', label: 'Boardroom Utilisation', icon: Users, value: `${metrics.boardroomUtilisation}%` },
  ]

  return (
    <section className="scheduling-metrics">
      {cards.map((card) => {
        const Icon = card.icon
        const isRisk = ['blockedSignings', 'overdueSignings'].includes(card.key) && Number(card.value) > 0
        return (
          <article key={card.key} className={`scheduling-metric-card ${isRisk ? 'is-risk' : ''}`}>
            <div className="scheduling-metric-icon"><Icon size={16} /></div>
            <div>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{metricSubtitle(card.key, Number(card.value) || 0)}</span>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function StatusBadge({ row }) {
  const tone = getStatusTone(row)
  return (
    <span className="scheduling-status-badge" style={{ color: tone.color, background: tone.bg, borderColor: tone.border }}>
      {tone.label}
    </span>
  )
}

function UpcomingSigningsPanel({ rows, onSelect, onResendCommunication }) {
  return (
    <section className="scheduling-panel upcoming-signings-panel">
      <div className="scheduling-panel-header">
        <h2>Upcoming Signings</h2>
        <button type="button">View all</button>
      </div>
      {!rows.length ? (
        <div className="scheduling-empty-state">
          <CalendarDays size={18} />
          <strong>No signings match these filters</strong>
          <span>Confirmed and pending appointments will appear here.</span>
        </div>
      ) : (
        <div className="scheduling-row-list">
          {rows.slice(0, 10).map((row) => {
            const tone = getAppointmentTone(row)
            return (
              <article key={row.id} className="scheduling-queue-row">
                <span className="scheduling-row-dot" style={{ background: tone.accent }} />
                <button type="button" className="scheduling-row-main" onClick={() => onSelect(row)}>
                  <strong>{row.matterReference}</strong>
                  <span>{row.clientName || 'Client pending'} - {formatDate(row.dateTime, { includeYear: false })} - {formatTime(row.dateTime)}</span>
                </button>
                <div className="scheduling-row-meta">
                  <span style={{ color: tone.text }}>{tone.label}</span>
                  <StatusBadge row={row} />
                </div>
                <div className="scheduling-row-actions">
                  {row.operationalStatus === 'awaiting_confirmation' ? (
                    <button type="button" onClick={() => onResendCommunication(row, 'confirmation')}>Remind</button>
                  ) : null}
                  <button type="button" onClick={() => onSelect(row)}>Open</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CalendarControls({ viewMode, setViewMode, selectedDate, setSelectedDate }) {
  const weekStart = startOfWeek(selectedDate)
  const weekEnd = addDays(weekStart, 6)
  const rangeLabel = normalizeLower(viewMode) === 'month'
    ? selectedDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    : normalizeLower(viewMode) === 'day'
      ? formatDate(selectedDate)
      : formatRangeLabel(weekStart, weekEnd)

  function shiftDate(direction) {
    const normalized = normalizeLower(viewMode)
    const step = normalized === 'month' ? 31 : normalized === 'day' ? 1 : 7
    setSelectedDate((previous) => addDays(previous, direction * step))
  }

  return (
    <div className="calendar-controls">
      <div className="calendar-view-toggle">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={mode === viewMode ? 'is-active' : ''}
            onClick={() => setViewMode(mode)}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="calendar-date-controls">
        <button type="button" onClick={() => setSelectedDate(new Date())}>Today</button>
        <button type="button" aria-label="Previous" onClick={() => shiftDate(-1)}><ChevronLeft size={16} /></button>
        <button type="button" aria-label="Next" onClick={() => shiftDate(1)}><ChevronRight size={16} /></button>
        <strong>{rangeLabel}</strong>
        <button type="button" aria-label="Calendar filters"><Filter size={15} /> Filters</button>
      </div>
    </div>
  )
}

function WeekCalendar({ rows, viewMode, selectedDate, onSelect }) {
  const columns = buildDayColumns(viewMode, selectedDate)
  const timeSlots = Array.from({ length: BUSINESS_DAY_END - BUSINESS_DAY_START }, (_, index) => BUSINESS_DAY_START + index)
  const now = new Date()
  const currentTop = ((now.getHours() * 60 + now.getMinutes()) - (BUSINESS_DAY_START * 60)) / BUSINESS_DAY_MINUTES * 100

  return (
    <div className={`week-calendar ${columns.length === 1 ? 'is-day-view' : ''}`}>
      <div className="week-calendar-header" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(136px, 1fr))` }}>
        <span />
        {columns.map((day) => (
          <div key={day.toISOString()} className={isToday(day) ? 'is-today' : ''}>
            <span>{day.toLocaleDateString('en-ZA', { weekday: 'short' })}</span>
            <strong>{day.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}</strong>
          </div>
        ))}
      </div>
      <div className="week-calendar-body" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(136px, 1fr))` }}>
        <div className="calendar-time-rail">
          {timeSlots.map((hour) => (
            <span key={hour}>{String(hour).padStart(2, '0')}:00</span>
          ))}
        </div>
        {columns.map((day) => {
          const dayRows = rows.filter((row) => isSameCalendarDay(row.dateTime, day))
          return (
            <div key={day.toISOString()} className="calendar-day-column">
              {isToday(day) && currentTop >= 0 && currentTop <= 100 ? (
                <div className="calendar-now-line" style={{ top: `${currentTop}%` }}>
                  <span>{formatTime(now)}</span>
                </div>
              ) : null}
              {dayRows.map((row) => {
                const parsed = new Date(row.dateTime || '')
                if (Number.isNaN(parsed.getTime())) return null
                const minutesFromStart = (parsed.getHours() * 60 + parsed.getMinutes()) - (BUSINESS_DAY_START * 60)
                const top = Math.max(0, Math.min(93, (minutesFromStart / BUSINESS_DAY_MINUTES) * 100))
                const height = Math.max(7, Math.min(22, (resolveAppointmentDuration(row) / BUSINESS_DAY_MINUTES) * 100))
                const tone = getAppointmentTone(row)
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="calendar-event"
                    style={{
                      top: `${top}%`,
                      minHeight: `${height}%`,
                      background: tone.bg,
                      borderColor: tone.border,
                      color: tone.text,
                    }}
                    onClick={() => onSelect(row)}
                  >
                    <span>{tone.label}</span>
                    <strong>{row.matterReference}</strong>
                    <small>{formatTime(row.dateTime)} - {formatTime(new Date(parsed.getTime() + resolveAppointmentDuration(row) * 60 * 1000))}</small>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthCalendar({ rows, selectedDate, onSelect }) {
  const cells = buildMonthCells(selectedDate)
  return (
    <div className="month-calendar">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
        <strong key={day} className="month-calendar-day-label">{day}</strong>
      ))}
      {cells.map((day) => {
        const dayRows = rows.filter((row) => isSameCalendarDay(row.dateTime, day))
        const isOutside = day.getMonth() !== selectedDate.getMonth()
        return (
          <article key={day.toISOString()} className={`month-calendar-cell ${isOutside ? 'is-outside' : ''} ${isToday(day) ? 'is-today' : ''}`}>
            <span>{day.getDate()}</span>
            {dayRows.slice(0, 3).map((row) => {
              const tone = getAppointmentTone(row)
              return (
                <button key={row.id} type="button" style={{ color: tone.text, background: tone.bg }} onClick={() => onSelect(row)}>
                  {row.matterReference}
                </button>
              )
            })}
            {dayRows.length > 3 ? <small>+{dayRows.length - 3} more</small> : null}
          </article>
        )
      })}
    </div>
  )
}

function AgendaCalendar({ rows, onSelect }) {
  return (
    <div className="agenda-calendar">
      {!rows.length ? (
        <div className="scheduling-empty-state">
          <LayoutGrid size={18} />
          <strong>No agenda items</strong>
          <span>Try widening the date range or clearing filters.</span>
        </div>
      ) : sortByDateAscending(rows).map((row) => {
        const tone = getAppointmentTone(row)
        return (
          <button key={row.id} type="button" className="agenda-row" onClick={() => onSelect(row)}>
            <span className="scheduling-row-dot" style={{ background: tone.accent }} />
            <div>
              <strong>{row.appointmentType || tone.label}</strong>
              <span>{row.matterReference} - {row.clientName || 'Client pending'}</span>
            </div>
            <time>{formatDateTime(row.dateTime)}</time>
            <StatusBadge row={row} />
          </button>
        )
      })}
    </div>
  )
}

function CalendarSurface({ rows, viewMode, setViewMode, selectedDate, setSelectedDate, onSelect }) {
  return (
    <section className="scheduling-panel calendar-surface">
      <CalendarControls
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
      />
      <div className="calendar-shell">
        {normalizeLower(viewMode) === 'month' ? (
          <MonthCalendar rows={rows} selectedDate={selectedDate} onSelect={onSelect} />
        ) : normalizeLower(viewMode) === 'agenda' ? (
          <AgendaCalendar rows={rows} onSelect={onSelect} />
        ) : (
          <WeekCalendar rows={rows} viewMode={viewMode} selectedDate={selectedDate} onSelect={onSelect} />
        )}
      </div>
      <div className="calendar-legend">
        {Object.entries(APPOINTMENT_TONES).map(([key, tone]) => (
          <span key={key}><i style={{ background: tone.accent }} />{tone.label}</span>
        ))}
      </div>
    </section>
  )
}

function ReschedulePanel({ rows, onPropose, onResolve, onSelect }) {
  return (
    <section className="scheduling-panel">
      <div className="scheduling-panel-header">
        <h2>Reschedule Requests</h2>
        <button type="button">View all</button>
      </div>
      {!rows.length ? (
        <div className="scheduling-empty-state is-compact">
          <CheckCircle2 size={17} />
          <strong>No pending requests</strong>
          <span>Reschedule exceptions are clear.</span>
        </div>
      ) : (
        <div className="scheduling-row-list">
          {rows.slice(0, 5).map((row) => (
            <article key={row.requestId} className="reschedule-row">
              <span className="scheduling-row-dot" style={{ background: APPOINTMENT_TONES.reschedule.accent }} />
              <button type="button" className="scheduling-row-main" onClick={() => onSelect(row.appointment)}>
                <strong>{row.matterReference}</strong>
                <span>{row.clientName || 'Client pending'} - Preferred {formatDateTime(row.preferredStart)}</span>
                {row.reason ? <small>{row.reason}</small> : null}
              </button>
              <div className="reschedule-actions">
                <button type="button" onClick={() => onResolve(row, 'accepted')}>Approve</button>
                <button type="button" onClick={() => onResolve(row, 'rejected')}>Decline</button>
                <button type="button" onClick={() => onPropose(row)}>Reschedule</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function BoardroomUtilisationPanel({ rows, resources }) {
  const boardrooms = useMemo(() => buildBoardroomRows(resources, rows), [resources, rows])
  return (
    <section className="scheduling-panel">
      <div className="scheduling-panel-header">
        <h2>Boardroom Utilisation</h2>
        <button type="button">This week</button>
      </div>
      <div className="boardroom-list">
        {boardrooms.map((room) => (
          <article key={room.id}>
            <div>
              <strong>{room.name || 'Boardroom'}</strong>
              <span>{room.bookings} {room.bookings === 1 ? 'booking' : 'bookings'}</span>
            </div>
            <div className="boardroom-progress">
              <span style={{ width: `${room.utilisation}%` }} />
            </div>
            <strong>{room.utilisation}%</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

function OperationalFeedPanel({ rows }) {
  return (
    <section className="scheduling-panel">
      <div className="scheduling-panel-header">
        <h2>Operational Scheduling Feed</h2>
        <button type="button">Live</button>
      </div>
      {!rows.length ? (
        <div className="scheduling-empty-state is-compact">
          <Clock3 size={17} />
          <strong>No scheduling activity yet</strong>
          <span>Appointment updates will appear here.</span>
        </div>
      ) : (
        <div className="feed-list">
          {rows.map((row) => (
            <article key={row.id}>
              <span className="scheduling-row-dot" style={{ background: row.tone.accent }} />
              <div>
                <strong>{row.title}</strong>
                <span>{row.description}</span>
              </div>
              <time>{formatDateTime(row.timestamp)}</time>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function CreateInviteDrawer({
  open,
  draft,
  setDraft,
  matterOptions,
  resources,
  busyId,
  onClose,
  onSubmit,
}) {
  if (!open) return null
  const selectedInviteType = getInviteType(draft.appointmentType)
  const selectedMatter = matterOptions.find((matter) => matter.matterId === draft.matterId)
  const isBoardroomInvite = draft.locationType === 'boardroom'

  function updateDraft(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <aside className="invite-drawer" aria-label="Create attorney invite">
      <form className="invite-drawer-card" onSubmit={onSubmit}>
        <div className="appointment-drawer-header">
          <span>Create Invite</span>
          <button type="button" onClick={onClose} aria-label="Close create invite"><X size={17} /></button>
        </div>

        <div>
          <h2>Attorney invite</h2>
          <p>Send a signing, consultation, or firm coordination invite from the conveyancing calendar.</p>
        </div>

        <div className="invite-type-list" role="radiogroup" aria-label="Invite type">
          {ATTORNEY_INVITE_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              className={`invite-type-option ${draft.appointmentType === type.value ? 'is-active' : ''}`}
              onClick={() => updateDraft('appointmentType', type.value)}
            >
              <strong>{type.label}</strong>
              <span>{type.helper}</span>
            </button>
          ))}
        </div>

        <div className="invite-selected-summary">
          <Send size={15} />
          <span>{selectedInviteType.label}</span>
          {selectedMatter ? <strong>{selectedMatter.matterReference}</strong> : <strong>Matter required</strong>}
        </div>

        <div className="invite-form-grid">
          <label className="drawer-field invite-field-wide">
            <span>Matter</span>
            <select value={draft.matterId} onChange={(event) => updateDraft('matterId', event.target.value)} required>
              <option value="">Choose a matter</option>
              {matterOptions.map((matter) => (
                <option key={matter.matterId} value={matter.matterId}>
                  {matter.matterReference} {matter.clientName ? `- ${matter.clientName}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="drawer-field">
            <span>Invitee name</span>
            <input
              value={draft.recipientName}
              onChange={(event) => updateDraft('recipientName', event.target.value)}
              placeholder="Client or staff name"
            />
          </label>

          <label className="drawer-field">
            <span>Invitee email</span>
            <input
              type="email"
              value={draft.recipientEmail}
              onChange={(event) => updateDraft('recipientEmail', event.target.value)}
              placeholder="name@example.com"
              required
            />
          </label>

          <label className="drawer-field">
            <span>Date</span>
            <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} required />
          </label>

          <label className="drawer-field">
            <span>Start time</span>
            <input type="time" value={draft.startTime} onChange={(event) => updateDraft('startTime', event.target.value)} required />
          </label>

          <label className="drawer-field">
            <span>Location type</span>
            <select value={draft.locationType} onChange={(event) => updateDraft('locationType', event.target.value)}>
              <option value="video_call">Video call</option>
              <option value="boardroom">Firm boardroom</option>
              <option value="office">Office / address</option>
              <option value="phone_call">Phone call</option>
            </select>
          </label>

          {isBoardroomInvite ? (
            <label className="drawer-field">
              <span>Boardroom</span>
              <select value={draft.resourceId} onChange={(event) => updateDraft('resourceId', event.target.value)}>
                <option value="">Choose boardroom</option>
                {resources.map((resource) => (
                  <option key={resource.resourceId} value={resource.resourceId}>{resource.resourceName}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="drawer-field">
              <span>{draft.locationType === 'video_call' ? 'Meeting link' : 'Location'}</span>
              <input
                value={draft.location}
                onChange={(event) => updateDraft('location', event.target.value)}
                placeholder={draft.locationType === 'video_call' ? 'Teams or Meet link' : 'Address or phone details'}
              />
            </label>
          )}

          <label className="drawer-field invite-field-wide">
            <span>Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) => updateDraft('notes', event.target.value)}
              placeholder="Anything the invitee should know before the appointment"
              rows={4}
            />
          </label>
        </div>

        <div className="invite-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={Boolean(busyId)}>
            <Send size={15} />
            Create Invite
          </button>
        </div>
      </form>
    </aside>
  )
}

function AppointmentDrawer({
  appointment,
  resources,
  staffOptions,
  busyId,
  onClose,
  onResourceAssign,
  onStaffAssign,
  onComplete,
  onResendCommunication,
}) {
  if (!appointment) return null
  const tone = getAppointmentTone(appointment)

  return (
    <aside className="appointment-drawer" aria-label="Appointment detail">
      <div className="appointment-drawer-card">
        <div className="appointment-drawer-header">
          <span style={{ color: tone.text, background: tone.bg, borderColor: tone.border }}>{tone.label}</span>
          <button type="button" onClick={onClose} aria-label="Close appointment detail"><X size={17} /></button>
        </div>
        <h2>{appointment.matterReference}</h2>
        <p>{appointment.clientName || 'Client pending'}</p>
        <div className="drawer-facts">
          <div><span>Date</span><strong>{formatDate(appointment.dateTime)}</strong></div>
          <div><span>Time</span><strong>{formatTime(appointment.dateTime)}</strong></div>
          <div><span>Status</span><strong>{getStatusTone(appointment).label}</strong></div>
          <div><span>Boardroom</span><strong>{appointment.resourceName || 'Unassigned'}</strong></div>
          <div><span>Attorney</span><strong>{appointment.assignedAttorneyName || appointment.assignedSecretaryName || 'Unassigned'}</strong></div>
          <div><span>Calendar Sync</span><strong>{appointment.externalCalendarStatus || 'Not synced'}</strong></div>
        </div>
        {appointment.readiness?.blockers?.length ? (
          <div className="drawer-blockers">
            <strong>Readiness blockers</strong>
            {appointment.readiness.blockers.slice(0, 4).map((blocker) => <span key={blocker}>{blocker}</span>)}
          </div>
        ) : null}
        <div className="drawer-field">
          <label>Boardroom</label>
          <select value={appointment.resourceId || ''} onChange={(event) => onResourceAssign(appointment, event.target.value)}>
            <option value="">Unassigned</option>
            {resources.map((resource) => (
              <option key={resource.resourceId} value={resource.resourceId}>{resource.resourceName}</option>
            ))}
          </select>
        </div>
        <div className="drawer-field">
          <label>Scheduling owner</label>
          <select value="" onChange={(event) => onStaffAssign(appointment, { role: 'coordinator', userId: event.target.value })}>
            <option value="">Assign staff member</option>
            {staffOptions.map((member) => (
              <option key={member.value} value={member.value}>{member.label}</option>
            ))}
          </select>
        </div>
        <div className="drawer-actions">
          <button type="button" onClick={() => onComplete(appointment)} disabled={Boolean(busyId)}>
            Mark Completed
          </button>
          <button type="button" onClick={() => onResendCommunication(appointment, 'confirmation')} disabled={Boolean(busyId)}>
            Send Reminder
          </button>
          {appointment.actionHref ? <Link to={appointment.actionHref}>Open Matter</Link> : null}
        </div>
      </div>
    </aside>
  )
}

function SchedulingStyles() {
  return (
    <style>{`
      .attorney-scheduling-os {
        display: grid;
        gap: 1rem;
        color: #10233f;
      }

      .scheduling-page-header,
      .scheduling-toolbar,
      .scheduling-panel,
      .scheduling-metric-card {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #dce6f2;
        box-shadow: 0 8px 24px rgba(15, 35, 65, 0.05);
      }

      .scheduling-page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        border-radius: 14px;
        padding: 0.82rem 0.95rem;
      }

      .scheduling-page-header > div:first-child > span {
        display: block;
        color: #2563eb;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .scheduling-page-header h1 {
        margin: 0;
        font-size: 1.2rem;
        line-height: 1.05;
        letter-spacing: 0;
        color: #08172d;
      }

      .scheduling-page-header p {
        margin: 0.25rem 0 0;
        color: #5a6f89;
        font-size: 0.78rem;
      }

      .scheduling-header-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.55rem;
        flex-wrap: wrap;
      }

      .scheduling-primary-action,
      .scheduling-toolbar select,
      .calendar-date-controls button,
      .calendar-view-toggle button,
      .scheduling-row-actions button,
      .reschedule-actions button,
      .scheduling-panel-header button,
      .drawer-actions button,
      .drawer-actions a,
      .invite-actions button {
        min-height: 2.35rem;
        border-radius: 10px;
        border: 1px solid #d9e4f0;
        background: #fff;
        color: #18314d;
        font-weight: 700;
        font-size: 0.78rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        padding: 0 0.75rem;
        text-decoration: none;
        cursor: pointer;
      }

      .scheduling-primary-action {
        color: #fff;
        background: #0f3558;
        border-color: #0f3558;
        box-shadow: 0 8px 18px rgba(15, 53, 88, 0.16);
      }

      .scheduling-toolbar {
        display: grid;
        grid-template-columns: minmax(240px, 1fr) repeat(5, minmax(136px, 0.35fr));
        gap: 0.55rem;
        align-items: center;
        padding: 0.72rem;
        border-radius: 16px;
      }

      .scheduling-search {
        min-height: 2.35rem;
        border-radius: 10px;
        border: 1px solid #d9e4f0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0 0.72rem;
        color: #6b7f98;
        background: #fff;
      }

      .scheduling-search input,
      .scheduling-toolbar select,
      .drawer-field select,
      .drawer-field input,
      .drawer-field textarea {
        width: 100%;
        border: 0;
        outline: 0;
        background: transparent;
        color: #18314d;
      }

      .scheduling-toolbar select,
      .drawer-field select,
      .drawer-field input,
      .drawer-field textarea {
        border: 1px solid #d9e4f0;
        background: #fff;
      }

      .scheduling-metrics {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 0.75rem;
      }

      .scheduling-metric-card {
        min-height: 4.85rem;
        border-radius: 12px;
        padding: 0.68rem;
        display: flex;
        gap: 0.58rem;
        align-items: flex-start;
      }

      .scheduling-metric-card.is-risk .scheduling-metric-icon {
        color: #b42318;
        background: #fef3f2;
      }

      .scheduling-metric-icon {
        width: 1.8rem;
        height: 1.8rem;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: #eff6ff;
        color: #2563eb;
        flex: 0 0 auto;
      }

      .scheduling-metric-card p,
      .scheduling-metric-card span {
        margin: 0;
        color: #5a6f89;
        font-size: 0.74rem;
      }

      .scheduling-metric-card strong {
        display: block;
        margin: 0.2rem 0 0.12rem;
        color: #07172d;
        font-size: 1.3rem;
        line-height: 1;
      }

      .scheduling-main-grid {
        display: grid;
        grid-template-columns: minmax(280px, 0.34fr) minmax(0, 1fr);
        gap: 1rem;
        align-items: start;
      }

      .scheduling-secondary-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(260px, 0.78fr) minmax(300px, 1fr);
        gap: 1rem;
      }

      .scheduling-panel {
        border-radius: 12px;
        overflow: hidden;
      }

      .scheduling-panel-header {
        min-height: 2.8rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0.8rem;
        border-bottom: 1px solid #e4ecf5;
      }

      .scheduling-panel-header h2 {
        margin: 0;
        font-size: 1rem;
        color: #0c1b34;
      }

      .scheduling-panel-header button {
        min-height: 1.95rem;
        color: #1459b8;
        padding: 0 0.6rem;
      }

      .scheduling-row-list,
      .feed-list,
      .boardroom-list,
      .agenda-calendar {
        display: grid;
      }

      .scheduling-queue-row,
      .reschedule-row,
      .feed-list article,
      .boardroom-list article,
      .agenda-row {
        display: grid;
        align-items: center;
        gap: 0.58rem;
        border-bottom: 1px solid #edf2f7;
        padding: 0.58rem 0.75rem;
      }

      .scheduling-queue-row {
        grid-template-columns: auto minmax(0, 1fr) auto auto;
      }

      .scheduling-queue-row:hover,
      .reschedule-row:hover,
      .agenda-row:hover {
        background: #f8fbff;
      }

      .scheduling-row-dot {
        width: 0.45rem;
        height: 0.45rem;
        border-radius: 999px;
        flex: 0 0 auto;
      }

      .scheduling-row-main,
      .agenda-row {
        border: 0;
        background: transparent;
        text-align: left;
        padding: 0;
        cursor: pointer;
        min-width: 0;
      }

      .scheduling-row-main strong,
      .feed-list strong,
      .agenda-row strong,
      .boardroom-list strong {
        display: block;
        color: #10233f;
        font-size: 0.82rem;
      }

      .scheduling-row-main span,
      .scheduling-row-main small,
      .feed-list span,
      .agenda-row span,
      .boardroom-list span {
        display: block;
        margin-top: 0.16rem;
        color: #62768e;
        font-size: 0.74rem;
        line-height: 1.35;
      }

      .scheduling-row-meta {
        display: grid;
        justify-items: end;
        gap: 0.28rem;
        font-size: 0.73rem;
        font-weight: 800;
      }

      .scheduling-status-badge {
        width: max-content;
        border: 1px solid;
        border-radius: 999px;
        padding: 0.2rem 0.48rem;
        font-size: 0.68rem;
        font-weight: 800;
      }

      .scheduling-row-actions {
        display: flex;
        gap: 0.38rem;
      }

      .scheduling-row-actions button {
        min-height: 1.72rem;
        padding: 0 0.55rem;
      }

      .calendar-surface {
        min-width: 0;
      }

      .calendar-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        padding: 0.7rem 0.8rem;
        border-bottom: 1px solid #e4ecf5;
      }

      .calendar-view-toggle,
      .calendar-date-controls {
        display: flex;
        align-items: center;
        gap: 0.38rem;
        flex-wrap: wrap;
      }

      .calendar-view-toggle {
        border: 1px solid #d9e4f0;
        border-radius: 11px;
        padding: 0.18rem;
        background: #f8fbff;
      }

      .calendar-view-toggle button {
        min-height: 1.95rem;
        border: 0;
        background: transparent;
        box-shadow: none;
      }

      .calendar-view-toggle button.is-active {
        background: #0f3558;
        color: #fff;
      }

      .calendar-date-controls strong {
        min-width: 10.5rem;
        text-align: center;
        font-size: 0.86rem;
        color: #10233f;
      }

      .calendar-date-controls button {
        min-height: 2rem;
        padding: 0 0.58rem;
      }

      .calendar-shell {
        overflow-x: auto;
      }

      .week-calendar {
        min-width: 760px;
      }

      .week-calendar.is-day-view {
        min-width: 430px;
      }

      .week-calendar-header,
      .week-calendar-body {
        display: grid;
      }

      .week-calendar-header {
        border-bottom: 1px solid #e4ecf5;
      }

      .week-calendar-header > div {
        padding: 0.74rem 0.62rem;
        border-left: 1px solid #edf2f7;
      }

      .week-calendar-header span {
        display: block;
        color: #60748c;
        font-size: 0.72rem;
      }

      .week-calendar-header strong {
        display: block;
        margin-top: 0.2rem;
        color: #10233f;
        font-size: 0.78rem;
      }

      .week-calendar-header .is-today strong {
        color: #1459b8;
      }

      .week-calendar-body {
        min-height: 540px;
      }

      .calendar-time-rail {
        display: grid;
        grid-template-rows: repeat(10, 1fr);
        border-right: 1px solid #e4ecf5;
        background: #fbfdff;
      }

      .calendar-time-rail span {
        color: #60748c;
        font-size: 0.72rem;
        padding: 0.75rem 0.55rem 0 0;
        text-align: right;
        border-bottom: 1px solid #edf2f7;
      }

      .calendar-day-column {
        position: relative;
        min-height: 540px;
        border-left: 1px solid #edf2f7;
        background-image: linear-gradient(to bottom, transparent calc(10% - 1px), #edf2f7 calc(10% - 1px), #edf2f7 10%, transparent 10%);
        background-size: 100% 10%;
      }

      .calendar-event {
        position: absolute;
        left: 0.34rem;
        right: 0.34rem;
        border: 1px solid;
        border-left-width: 3px;
        border-radius: 7px;
        padding: 0.28rem 0.38rem;
        display: grid;
        gap: 0.08rem;
        text-align: left;
        cursor: pointer;
        overflow: hidden;
        box-shadow: none;
      }

      .calendar-event span {
        font-size: 0.6rem;
        font-weight: 800;
      }

      .calendar-event strong {
        font-size: 0.68rem;
        color: inherit;
      }

      .calendar-event small {
        font-size: 0.6rem;
        color: inherit;
      }

      .calendar-now-line {
        position: absolute;
        left: 0;
        right: 0;
        height: 1px;
        background: #ef4444;
        z-index: 3;
      }

      .calendar-now-line span {
        position: absolute;
        left: -3.2rem;
        top: -0.68rem;
        border-radius: 999px;
        background: #ef4444;
        color: #fff;
        padding: 0.16rem 0.42rem;
        font-size: 0.66rem;
        font-weight: 800;
      }

      .calendar-legend {
        display: flex;
        gap: 0.8rem;
        flex-wrap: wrap;
        padding: 0.75rem 1rem;
        border-top: 1px solid #e4ecf5;
        color: #60748c;
        font-size: 0.72rem;
      }

      .calendar-legend span {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }

      .calendar-legend i {
        width: 0.42rem;
        height: 0.42rem;
        border-radius: 999px;
      }

      .month-calendar {
        min-width: 820px;
        display: grid;
        grid-template-columns: repeat(7, minmax(112px, 1fr));
      }

      .month-calendar-day-label,
      .month-calendar-cell {
        border-bottom: 1px solid #edf2f7;
        border-left: 1px solid #edf2f7;
      }

      .month-calendar-day-label {
        padding: 0.62rem;
        color: #60748c;
        font-size: 0.72rem;
      }

      .month-calendar-cell {
        min-height: 104px;
        padding: 0.5rem;
        display: grid;
        align-content: start;
        gap: 0.28rem;
      }

      .month-calendar-cell > span {
        color: #10233f;
        font-size: 0.76rem;
        font-weight: 800;
      }

      .month-calendar-cell.is-outside {
        background: #fbfdff;
        opacity: 0.64;
      }

      .month-calendar-cell.is-today > span {
        color: #1459b8;
      }

      .month-calendar-cell button {
        border: 0;
        border-radius: 7px;
        padding: 0.22rem 0.35rem;
        text-align: left;
        font-size: 0.68rem;
        font-weight: 800;
        cursor: pointer;
      }

      .agenda-calendar {
        padding: 0.4rem 0;
      }

      .agenda-row {
        width: 100%;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        background: transparent;
        border: 0;
        border-bottom: 1px solid #edf2f7;
      }

      .agenda-row time,
      .feed-list time {
        color: #60748c;
        font-size: 0.72rem;
        white-space: nowrap;
      }

      .reschedule-row {
        grid-template-columns: auto minmax(0, 1fr) auto;
      }

      .reschedule-actions {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .reschedule-actions button {
        min-height: 1.92rem;
        padding: 0 0.55rem;
      }

      .boardroom-list article {
        grid-template-columns: minmax(0, 1fr) minmax(88px, 0.5fr) auto;
      }

      .boardroom-progress {
        height: 0.38rem;
        border-radius: 999px;
        background: #edf2f7;
        overflow: hidden;
      }

      .boardroom-progress span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: #10b981;
      }

      .feed-list article {
        grid-template-columns: auto minmax(0, 1fr) auto;
      }

      .scheduling-empty-state {
        min-height: 9rem;
        display: grid;
        place-items: center;
        align-content: center;
        gap: 0.35rem;
        color: #60748c;
        padding: 1rem;
        text-align: center;
      }

      .scheduling-empty-state.is-compact {
        min-height: 8rem;
      }

      .scheduling-empty-state strong {
        color: #10233f;
        font-size: 0.86rem;
      }

      .scheduling-empty-state span {
        font-size: 0.76rem;
      }

      .scheduling-alert {
        border-radius: 14px;
        border: 1px solid #dce6f2;
        background: #fff;
        padding: 0.7rem 0.85rem;
        font-size: 0.83rem;
      }

      .scheduling-alert.is-error {
        border-color: #fecaca;
        background: #fff7f7;
        color: #b42318;
      }

      .scheduling-alert.is-success {
        border-color: #bbf7d0;
        background: #f0fdf4;
        color: #067647;
      }

      .appointment-drawer,
      .invite-drawer {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: flex;
        justify-content: flex-end;
        background: rgba(6, 22, 49, 0.16);
        backdrop-filter: blur(3px);
      }

      .appointment-drawer-card,
      .invite-drawer-card {
        width: min(440px, calc(100vw - 1rem));
        height: calc(100vh - 1rem);
        margin: 0.5rem;
        overflow: auto;
        background: #fff;
        border: 1px solid #dce6f2;
        border-radius: 18px;
        box-shadow: 0 24px 72px rgba(15, 35, 65, 0.2);
        padding: 1rem;
        display: grid;
        align-content: start;
        gap: 0.85rem;
      }

      .invite-drawer-card {
        width: min(520px, calc(100vw - 1rem));
      }

      .appointment-drawer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.8rem;
      }

      .appointment-drawer-header span {
        border: 1px solid;
        border-radius: 999px;
        padding: 0.26rem 0.58rem;
        font-size: 0.72rem;
        font-weight: 800;
      }

      .appointment-drawer-header button {
        width: 2rem;
        height: 2rem;
        border-radius: 9px;
        border: 1px solid #d9e4f0;
        background: #fff;
        display: grid;
        place-items: center;
      }

      .appointment-drawer h2,
      .appointment-drawer p,
      .invite-drawer h2,
      .invite-drawer p {
        margin: 0;
      }

      .appointment-drawer h2,
      .invite-drawer h2 {
        font-size: 1.25rem;
        color: #08172d;
      }

      .appointment-drawer p,
      .invite-drawer p {
        color: #60748c;
        font-size: 0.86rem;
      }

      .invite-type-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.55rem;
      }

      .invite-type-option {
        border: 1px solid #e4ecf5;
        border-radius: 10px;
        background: #fbfdff;
        padding: 0.65rem;
        text-align: left;
        cursor: pointer;
      }

      .invite-type-option.is-active {
        border-color: #9ec5fe;
        background: #eff6ff;
        box-shadow: inset 0 0 0 1px #bfdbfe;
      }

      .invite-type-option strong,
      .invite-type-option span {
        display: block;
      }

      .invite-type-option strong {
        color: #10233f;
        font-size: 0.82rem;
      }

      .invite-type-option span {
        margin-top: 0.16rem;
        color: #60748c;
        font-size: 0.72rem;
        line-height: 1.35;
      }

      .invite-selected-summary {
        min-height: 2.35rem;
        border: 1px solid #d9e4f0;
        border-radius: 10px;
        background: #f8fbff;
        display: flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0 0.7rem;
        color: #60748c;
        font-size: 0.78rem;
      }

      .invite-selected-summary strong {
        margin-left: auto;
        color: #10233f;
      }

      .invite-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.6rem;
      }

      .invite-field-wide {
        grid-column: 1 / -1;
      }

      .drawer-facts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.55rem;
      }

      .drawer-facts div,
      .drawer-blockers,
      .drawer-field {
        border: 1px solid #e4ecf5;
        border-radius: 12px;
        padding: 0.65rem;
        background: #fbfdff;
      }

      .drawer-facts span,
      .drawer-field label,
      .drawer-field > span {
        display: block;
        color: #60748c;
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .drawer-facts strong {
        display: block;
        margin-top: 0.18rem;
        color: #10233f;
        font-size: 0.8rem;
      }

      .drawer-blockers {
        display: grid;
        gap: 0.35rem;
      }

      .drawer-blockers strong {
        color: #b42318;
        font-size: 0.82rem;
      }

      .drawer-blockers span {
        color: #5a6f89;
        font-size: 0.75rem;
      }

      .drawer-field {
        display: grid;
        gap: 0.4rem;
      }

      .drawer-field select,
      .drawer-field input,
      .drawer-field textarea {
        min-height: 2.25rem;
        border-radius: 9px;
        padding: 0 0.6rem;
      }

      .drawer-field textarea {
        min-height: 5rem;
        padding: 0.55rem 0.6rem;
        resize: vertical;
      }

      .drawer-actions,
      .invite-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .drawer-actions button:first-child,
      .invite-actions button:last-child {
        background: #0f3558;
        border-color: #0f3558;
        color: #fff;
      }

      .invite-actions {
        justify-content: flex-end;
      }

      @media (max-width: 1280px) {
        .scheduling-metrics {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .scheduling-toolbar {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .scheduling-search {
          grid-column: span 3;
        }

        .scheduling-secondary-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 980px) {
        .scheduling-page-header,
        .scheduling-main-grid {
          grid-template-columns: 1fr;
        }

        .scheduling-page-header {
          display: grid;
        }

        .scheduling-header-actions {
          justify-content: flex-start;
        }

        .scheduling-main-grid,
        .scheduling-secondary-grid {
          display: grid;
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .attorney-scheduling-os {
          gap: 0.8rem;
        }

        .scheduling-page-header,
        .scheduling-toolbar,
        .scheduling-panel-header {
          border-radius: 14px;
        }

        .scheduling-toolbar,
        .scheduling-metrics,
        .invite-type-list,
        .invite-form-grid {
          grid-template-columns: 1fr;
        }

        .invite-field-wide {
          grid-column: auto;
        }

        .scheduling-search {
          grid-column: auto;
        }

        .scheduling-queue-row,
        .reschedule-row,
        .agenda-row,
        .feed-list article,
        .boardroom-list article {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .scheduling-row-meta,
        .scheduling-row-actions,
        .reschedule-actions,
        .agenda-row time,
        .agenda-row .scheduling-status-badge,
        .feed-list time {
          grid-column: 2;
          justify-self: start;
        }

        .calendar-date-controls strong {
          min-width: 100%;
          text-align: left;
          order: 10;
        }
      }
    `}</style>
  )
}

function AttorneySchedulingWorkspace({
  appointmentRows = [],
  matterRows = [],
  documentRows = [],
  resources = [],
  memberOptions = [],
  organisationId = '',
  currentRole = '',
  currentUser = null,
  onWorkspaceChanged = null,
}) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [viewMode, setViewMode] = useState('Week')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteDraft, setInviteDraft] = useState(DEFAULT_INVITE_DRAFT)
  const [filters, setFilters] = useState({
    query: '',
    attorney: 'all',
    matterType: 'all',
    status: 'all',
    boardroom: 'all',
    dateRange: 'week',
  })

  const normalizedRows = useMemo(() => {
    const resourceNameById = (resources || []).reduce((acc, resource) => {
      acc[String(resource.resourceId || '')] = resource.resourceName
      return acc
    }, {})
    return buildSchedulingRows({ appointmentRows, matterRows, documentRows, role: currentRole })
      .map((row) => ({
        ...row,
        resourceName: row.resourceName || resourceNameById[String(row.resourceId || '')] || '',
      }))
  }, [appointmentRows, matterRows, documentRows, currentRole, resources])

  const activeRows = useMemo(() => filterActive(normalizedRows), [normalizedRows])
  const visibleRows = useMemo(() => sortByDateAscending(buildVisibleRows(activeRows, filters, selectedDate)), [activeRows, filters, selectedDate])
  const rescheduleRows = useMemo(() => buildRescheduleRows(normalizedRows), [normalizedRows])
  const visibleRescheduleRows = useMemo(() => buildRescheduleRows(visibleRows), [visibleRows])
  const staffOptions = useMemo(() => normalizeStaffOptions(memberOptions), [memberOptions])
  const feedRows = useMemo(() => buildOperationalFeed(visibleRows, visibleRescheduleRows), [visibleRows, visibleRescheduleRows])
  const matterOptions = useMemo(() => buildMatterOptions(matterRows), [matterRows])

  const metrics = useMemo(() => {
    const boardroomAssigned = activeRows.filter((row) => normalizeText(row.resourceId)).length
    return {
      todaysAppointments: activeRows.filter((row) => isToday(row.dateTime)).length,
      pendingConfirmations: activeRows.filter((row) => row.operationalStatus === 'awaiting_confirmation').length,
      blockedSignings: activeRows.filter((row) => row.readiness?.label === 'Blocked' || row.operationalStatus === 'blocked').length,
      overdueSignings: activeRows.filter((row) => row.operationalStatus === 'awaiting_confirmation' && isPast(row.dateTime)).length,
      rescheduleRequests: rescheduleRows.length,
      boardroomUtilisation: activeRows.length ? Math.round((boardroomAssigned / activeRows.length) * 100) : 0,
    }
  }, [activeRows, rescheduleRows.length])

  const upcomingRows = useMemo(() => sortByDateAscending(visibleRows).slice(0, 14), [visibleRows])

  async function withBusy(id, callback, successMessage = 'Scheduling workspace updated.') {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      await callback()
      setMessage(successMessage)
      await onWorkspaceChanged?.()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update scheduling workspace.')
    } finally {
      setBusyId('')
    }
  }

  const handleResourceAssign = (row, resourceId) => withBusy(`resource-${row.id}`, async () => {
    await assignAttorneyAppointmentResource(row.id, resourceId || null)
  })

  const handleStaffAssign = (row, payload) => withBusy(`staff-${row.id}-${payload?.role || ''}`, async () => {
    const selected = (memberOptions || []).find((item) => String(item.value) === String(payload?.userId || ''))
    await upsertAttorneyAppointmentParticipant(row.id, {
      participantRole: payload.role,
      name: selected?.label || 'Assigned Staff',
      email: '',
    })
  })

  const handleComplete = (row) => withBusy(`complete-${row.id}`, async () => {
    await updateAttorneyAppointmentOperationalStatus(row.id, 'completed', { actorRole: currentRole })
  })

  const handleResendCommunication = (row, kind) => withBusy(`notify-${row.id}-${kind}`, async () => {
    await resendAttorneyAppointmentCommunication(row.id, kind)
  })

  const handleProposeReschedule = (row) => withBusy(`propose-${row.requestId}`, async () => {
    await proposeAttorneyAppointmentReschedule(row.requestId, {
      preferredStart: row.preferredStart || row.appointment?.dateTime,
      reason: 'Attorney scheduling coordination proposal.',
    })
  })

  const handleResolveReschedule = (row, decision) => withBusy(`resolve-${row.requestId}-${decision}`, async () => {
    await resolveAttorneyAppointmentReschedule(row.requestId, {
      decision,
      reason: decision === 'rejected' ? 'Unable to accommodate requested slot.' : 'Reschedule approved.',
    })
  })

  const handleCreateInvite = (event) => {
    event.preventDefault()
    const selectedMatter = matterOptions.find((matter) => matter.matterId === inviteDraft.matterId)
    const selectedInviteType = getInviteType(inviteDraft.appointmentType)
    if (!selectedMatter) {
      setError('Choose a matter before creating the invite.')
      return
    }

    const selectedResource = resources.find((resource) => String(resource.resourceId || '') === String(inviteDraft.resourceId || ''))
    const boardroomLocation = selectedResource?.resourceName || ''
    const isVideoInvite = inviteDraft.locationType === 'video_call'
    const inviteLocation = inviteDraft.locationType === 'boardroom' ? boardroomLocation : inviteDraft.location

    void withBusy('create-invite', async () => {
      await createAttorneyAppointmentInvite({
        organisationId: organisationId || selectedMatter.organisationId,
        transactionId: selectedMatter.matterId,
        appointmentType: selectedInviteType.value,
        recipientName: inviteDraft.recipientName || selectedMatter.clientName,
        recipientEmail: inviteDraft.recipientEmail,
        participantRole: selectedInviteType.participantRole,
        date: inviteDraft.date,
        startTime: inviteDraft.startTime,
        locationType: inviteDraft.locationType,
        location: inviteLocation,
        meetingUrl: isVideoInvite ? inviteDraft.location : '',
        resourceId: inviteDraft.locationType === 'boardroom' ? inviteDraft.resourceId : '',
        notes: inviteDraft.notes,
        visibility: selectedInviteType.visibility,
        attorneyName: currentUser?.name || currentUser?.email || '',
        attorneyEmail: currentUser?.email || '',
      })
      setInviteOpen(false)
      setInviteDraft(DEFAULT_INVITE_DRAFT)
    }, 'Attorney invite created and sent.')
  }

  return (
    <section className="attorney-scheduling-os">
      <SchedulingStyles />
      <SchedulingPageHeader onCreateInvite={() => setInviteOpen(true)} />
      {error ? <div className="scheduling-alert is-error">{error}</div> : null}
      {message ? <div className="scheduling-alert is-success">{message}</div> : null}
      {busyId ? <div className="scheduling-alert">Processing scheduling action...</div> : null}
      <FilterToolbar filters={filters} setFilters={setFilters} resources={resources} memberOptions={memberOptions} />
      <MetricsStrip metrics={metrics} />
      <section className="scheduling-main-grid">
        <UpcomingSigningsPanel
          rows={upcomingRows}
          onSelect={setSelectedAppointment}
          onResendCommunication={handleResendCommunication}
        />
        <CalendarSurface
          rows={visibleRows}
          viewMode={viewMode}
          setViewMode={setViewMode}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          onSelect={setSelectedAppointment}
        />
      </section>
      <section className="scheduling-secondary-grid">
        <ReschedulePanel
          rows={visibleRescheduleRows.length ? visibleRescheduleRows : rescheduleRows}
          onPropose={handleProposeReschedule}
          onResolve={handleResolveReschedule}
          onSelect={setSelectedAppointment}
        />
        <BoardroomUtilisationPanel rows={visibleRows} resources={resources} />
        <OperationalFeedPanel rows={feedRows} />
      </section>
      <AppointmentDrawer
        appointment={selectedAppointment}
        resources={resources}
        staffOptions={staffOptions}
        busyId={busyId}
        onClose={() => setSelectedAppointment(null)}
        onResourceAssign={handleResourceAssign}
        onStaffAssign={handleStaffAssign}
        onComplete={handleComplete}
        onResendCommunication={handleResendCommunication}
      />
      <CreateInviteDrawer
        open={inviteOpen}
        draft={inviteDraft}
        setDraft={setInviteDraft}
        matterOptions={matterOptions}
        resources={resources}
        busyId={busyId}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleCreateInvite}
      />
    </section>
  )
}

export default AttorneySchedulingWorkspace
