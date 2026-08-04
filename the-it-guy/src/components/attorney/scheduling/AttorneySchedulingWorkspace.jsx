import { useEffect, useMemo, useState } from 'react'
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
import {
  ATTORNEY_INVITE_LOCATION_MODES,
  ATTORNEY_INVITE_LOCATION_OPTIONS,
  ATTORNEY_INVITE_TYPES,
  DEFAULT_ATTORNEY_INVITE_DRAFT,
  buildAttorneyInviteContract,
  getAttorneyInviteTypeDefinition,
} from '../../../core/appointments/attorneyInviteContract'
import { buildAttorneyInviteOutcome } from '../../../core/appointments/attorneyInviteDelivery'
import {
  getAttorneyCalendarRolloutStatus,
  resolveAttorneyCalendarEnvironment,
} from '../../../services/attorneyCalendarRolloutService'
import {
  APPOINTMENT_RESCHEDULE_TIMEZONE,
  buildAppointmentRescheduleProposalContract,
} from '../../../core/appointments/appointmentRescheduleContract'

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
  buyer: {
    label: 'Buyer',
    accent: '#2563eb',
    text: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
  },
  seller: {
    label: 'Seller',
    accent: '#16a34a',
    text: '#166534',
    bg: '#ecfdf3',
    border: '#bbf7d0',
  },
  both: {
    label: 'Both Parties',
    accent: '#8b5cf6',
    text: '#6d28d9',
    bg: '#f5f3ff',
    border: '#ddd6fe',
  },
  deadline: {
    label: 'Deadline',
    accent: '#ef4444',
    text: '#b42318',
    bg: '#fef2f2',
    border: '#fecaca',
  },
  task: {
    label: 'Task',
    accent: '#0f766e',
    text: '#0f766e',
    bg: '#f0fdfa',
    border: '#99f6e4',
  },
  external: {
    label: 'External',
    accent: '#d97706',
    text: '#92400e',
    bg: '#fffbeb',
    border: '#fde68a',
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
const STAFF_COLORS = ['#2563eb', '#16a34a', '#7c3aed', '#f97316', '#db2777', '#0891b2', '#65a30d', '#dc2626']
const EVENT_TYPE_CARDS = [
  { value: 'signing', appointmentType: 'transfer_signing', label: 'Signing', icon: Send },
  { value: 'meeting', appointmentType: 'attorney_consultation', label: 'Meeting', icon: Users },
  { value: 'deadline', appointmentType: 'internal_meeting', label: 'Deadline', icon: Clock3 },
  { value: 'task', appointmentType: 'internal_meeting', label: 'Task', icon: CheckCircle2 },
  { value: 'other', appointmentType: 'internal_meeting', label: 'Other', icon: LayoutGrid },
]
const RELATED_TO_OPTIONS = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'both', label: 'Both' },
]

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

function toDateInputValue(value) {
  const parsed = value instanceof Date ? value : new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'YL'
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function formatRoleLabel(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return 'Team Member'
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatJohannesburgDateTimeInput(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APPOINTMENT_RESCHEDULE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed).reduce((accumulator, part) => {
    accumulator[part.type] = part.value
    return accumulator
  }, {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function johannesburgDateTimeInputToIso(value = '') {
  const normalized = normalizeText(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return ''
  const parsed = new Date(`${normalized}:00+02:00`)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
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
        propertyLabel: matter?.propertyLabel || row.propertyLabel || '',
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
    .filter((member) => [
      'attorney_conveyancer',
      'transfer_attorney',
      'bond_attorney',
      'conveyancing_secretary',
      'admin_staff',
      'reception_scheduling',
      'candidate_attorney',
      'firm_admin',
      'director_partner',
    ].includes(normalizeLower(member.role)))
    .map((member) => ({
      value: member.value,
      label: member.label,
      role: member.role,
    }))
}

function classifyAppointment(row = {}) {
  const haystack = normalizeLower(`${row.appointmentTypeKey || ''} ${row.appointmentType || ''} ${row.status || ''} ${row.linkedWorkflow || ''} ${row.linkedWorkflowStage || ''}`)
  if (haystack.includes('deadline')) return 'deadline'
  if (haystack.includes('task')) return 'task'
  if (haystack.includes('court') || haystack.includes('external')) return 'external'
  if (haystack.includes('buyer') && haystack.includes('seller')) return 'both'
  if (haystack.includes('buyer')) return 'buyer'
  if (haystack.includes('seller')) return 'seller'
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
      row.propertyLabel,
      row.clientName,
      row.appointmentType,
      row.status,
      row.resourceName,
      row.assignedAttorneyName,
      row.assignedSecretaryName,
      row.assignedAdminHandlerName,
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

function getInviteType(value = '') {
  return getAttorneyInviteTypeDefinition(value) || ATTORNEY_INVITE_TYPES[0]
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
        propertyLabel: normalizeText(row.propertyLabel || row.property || row.address),
        clientName: normalizeText(row.clientName || row.buyerName || row.sellerName),
        matterType: normalizeText(row.matterType || row.assignmentType),
        organisationId: normalizeText(row.organisationId || row.organisation_id),
      }
    })
    .filter(Boolean)
}

function buildStaffRows(members = [], rows = []) {
  const seen = new Set()
  const baseRows = normalizeStaffOptions(members).map((member, index) => {
    seen.add(String(member.value || ''))
    const color = STAFF_COLORS[index % STAFF_COLORS.length]
    const appointments = rows.filter((row) => [
      row.assignedAttorneyId,
      row.assignedSecretaryId,
      row.assignedAdminHandlerId,
    ].some((id) => String(id || '') === String(member.value || ''))).length
    return {
      ...member,
      roleLabel: formatRoleLabel(member.role),
      initials: getInitials(member.label),
      color,
      appointments,
    }
  })

  const syntheticRows = []
  rows.forEach((row) => {
    [
      { id: row.assignedAttorneyId, name: row.assignedAttorneyName, role: 'Attorney' },
      { id: row.assignedSecretaryId, name: row.assignedSecretaryName, role: 'Secretary' },
      { id: row.assignedAdminHandlerId, name: row.assignedAdminHandlerName, role: 'Support Staff' },
    ].forEach((staff) => {
      const id = normalizeText(staff.id)
      if (!id || seen.has(id)) return
      seen.add(id)
      const color = STAFF_COLORS[(baseRows.length + syntheticRows.length) % STAFF_COLORS.length]
      syntheticRows.push({
        value: id,
        label: staff.name || 'Team Member',
        role: staff.role,
        roleLabel: staff.role,
        initials: getInitials(staff.name),
        color,
        appointments: rows.filter((item) => [item.assignedAttorneyId, item.assignedSecretaryId, item.assignedAdminHandlerId].some((staffId) => String(staffId || '') === id)).length,
      })
    })
  })

  return [...baseRows, ...syntheticRows].filter((member) => normalizeText(member.value))
}

function appointmentMatchesStaffSelection(row = {}, selectedStaffIds = []) {
  if (!selectedStaffIds.length) return true
  return [
    row.assignedAttorneyId,
    row.assignedSecretaryId,
    row.assignedAdminHandlerId,
  ].some((id) => selectedStaffIds.includes(String(id || '')))
}

function getStaffForAppointment(row = {}, staffRows = []) {
  return staffRows.find((staff) => [
    row.assignedAttorneyId,
    row.assignedSecretaryId,
    row.assignedAdminHandlerId,
  ].some((id) => String(id || '') === String(staff.value || ''))) || null
}

function createInviteDraftDefaults(selectedDate = new Date()) {
  const start = new Date(selectedDate)
  if (Number.isNaN(start.getTime())) {
    return { ...DEFAULT_ATTORNEY_INVITE_DRAFT }
  }
  if (!start.getHours()) start.setHours(9, 0, 0, 0)
  return {
    ...DEFAULT_ATTORNEY_INVITE_DRAFT,
    title: '',
    eventType: 'signing',
    date: toDateInputValue(start),
    startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    endTime: `${String(Math.min(start.getHours() + 1, 23)).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    allDay: false,
    repeat: 'none',
    relatedTo: 'buyer',
    visibility: 'shared_role_players',
    reminder: '15',
    sendNotifications: true,
  }
}

function SchedulingPageHeader({ onCreateInvite, rolloutStatus }) {
  const inviteEnabled = rolloutStatus?.enabled === true
  return (
    <section className="scheduling-page-header">
      <div>
        <h1>Calendar</h1>
        <p>Manage appointments, deadlines and important dates.</p>
      </div>
      <div className="scheduling-header-actions">
        <button
          type="button"
          className="scheduling-primary-action"
          onClick={onCreateInvite}
          disabled={!inviteEnabled}
          title={inviteEnabled ? 'Create a new event' : 'New Event is outside the active rollout cohort'}
        >
          <Plus size={16} />
          New Event
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
          placeholder="Search matters, clients or appointments..."
        />
      </label>
      <select value={filters.attorney} onChange={(event) => setFilters((previous) => ({ ...previous, attorney: event.target.value }))}>
        <option value="all">All Attorneys</option>
        {memberOptions.map((member) => (
          <option key={member.value} value={member.value}>{member.label}</option>
        ))}
      </select>
      <select value={filters.matterType} onChange={(event) => setFilters((previous) => ({ ...previous, matterType: event.target.value }))}>
        <option value="all">All Matter Types</option>
        <option value="transfer">Transfer</option>
        <option value="bond">Bond</option>
        <option value="cancellation">Cancellation</option>
      </select>
      <select value={filters.status} onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))}>
        <option value="all">All Statuses</option>
        <option value="confirmed">Confirmed</option>
        <option value="awaiting_confirmation">Pending</option>
        <option value="reschedule_requested">Reschedule requested</option>
        <option value="blocked">Blocked</option>
      </select>
      <select value={filters.boardroom} onChange={(event) => setFilters((previous) => ({ ...previous, boardroom: event.target.value }))}>
        <option value="all">All Boardrooms</option>
        <option value="unassigned">Unassigned</option>
        {resources.map((resource) => (
          <option key={resource.resourceId} value={resource.resourceId}>{resource.resourceName}</option>
        ))}
      </select>
      <select value={filters.dateRange} onChange={(event) => setFilters((previous) => ({ ...previous, dateRange: event.target.value }))}>
        <option value="all">All Dates</option>
        <option value="today">Today</option>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
      </select>
      <button type="button" className="scheduling-filter-icon" aria-label="Advanced calendar filters">
        <Filter size={16} />
      </button>
    </section>
  )
}

function MiniMonthPicker({ selectedDate, setSelectedDate }) {
  const monthStart = startOfMonth(selectedDate)
  const cells = buildMonthCells(selectedDate).slice(0, 35)

  function shiftMonth(direction) {
    setSelectedDate((previous) => {
      const next = new Date(previous)
      next.setMonth(next.getMonth() + direction)
      return next
    })
  }

  return (
    <aside className="mini-month-picker" aria-label="Monthly date picker">
      <div className="mini-month-header">
        <strong>{selectedDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</strong>
        <span>
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={14} /></button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={14} /></button>
        </span>
      </div>
      <div className="mini-month-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        {cells.map((day) => (
          <button
            key={day.toISOString()}
            type="button"
            className={`${day.getMonth() !== monthStart.getMonth() ? 'is-muted' : ''} ${isSameCalendarDay(day, selectedDate) ? 'is-selected' : ''}`}
            onClick={() => setSelectedDate(day)}
          >
            {day.getDate()}
          </button>
        ))}
      </div>
    </aside>
  )
}

function MetricsStrip({ metrics, selectedDate, setSelectedDate }) {
  const cards = [
    { key: 'today', title: 'Today', label: 'Appointments', icon: CalendarDays, value: metrics.todaysAppointments, tone: 'blue' },
    { key: 'week', title: 'This Week', label: 'Appointments', icon: CalendarDays, value: metrics.thisWeekAppointments, tone: 'green' },
    { key: 'pending', title: 'Pending', label: 'Confirmations', icon: Clock3, value: metrics.pendingConfirmations, tone: 'amber' },
    { key: 'overdue', title: 'Overdue', label: 'Items', icon: AlertTriangle, value: metrics.overdueItems, tone: 'red' },
  ]

  return (
    <section className="scheduling-summary-row">
      <div className="scheduling-metrics">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <article key={card.key} className={`scheduling-metric-card tone-${card.tone}`}>
              <div className="scheduling-metric-icon"><Icon size={18} /></div>
              <div>
                <p>{card.title}</p>
                <strong>{card.value}</strong>
                <span>{card.label}</span>
              </div>
            </article>
          )
        })}
      </div>
      <MiniMonthPicker selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
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

function StaffVisibilityPanel({ staffRows, selectedStaffIds, setSelectedStaffIds }) {
  const allSelected = selectedStaffIds.length === 0

  function toggleStaff(id) {
    const value = String(id || '')
    setSelectedStaffIds((previous) => {
      if (previous.includes(value)) return previous.filter((item) => item !== value)
      return [...previous, value]
    })
  }

  return (
    <section className="scheduling-panel staff-visibility-panel">
      <div className="scheduling-panel-header">
        <h2>Attorneys</h2>
        <button type="button" onClick={() => setSelectedStaffIds([])}>View everyone</button>
      </div>
      {!staffRows.length ? (
        <div className="scheduling-empty-state">
          <Users size={18} />
          <strong>No staff calendars yet</strong>
          <span>Assigned appointment owners will appear here.</span>
        </div>
      ) : (
        <div className="staff-list">
          <button
            type="button"
            className={`staff-row ${allSelected ? 'is-active' : ''}`}
            onClick={() => setSelectedStaffIds([])}
          >
            <span className="staff-avatar is-all"><Users size={15} /></span>
            <span>
              <strong>Everyone</strong>
              <small>Firm calendar</small>
            </span>
            <i style={{ background: '#0f3558' }} />
          </button>
          {staffRows.map((staff) => {
            const active = allSelected || selectedStaffIds.includes(String(staff.value))
            return (
              <button
                key={staff.value}
                type="button"
                className={`staff-row ${active ? 'is-active' : 'is-muted'}`}
                onClick={() => toggleStaff(staff.value)}
              >
                <span className="staff-avatar" style={{ borderColor: staff.color }}>{staff.initials}</span>
                <span>
                  <strong>{staff.label}</strong>
                  <small>{staff.roleLabel}</small>
                </span>
                <i style={{ background: staff.color }} />
              </button>
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
      <div className="calendar-date-controls">
        <button type="button" aria-label="Previous" onClick={() => shiftDate(-1)}><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => setSelectedDate(new Date())}>Today</button>
        <button type="button" aria-label="Next" onClick={() => shiftDate(1)}><ChevronRight size={16} /></button>
        <strong>{rangeLabel}</strong>
      </div>
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
    </div>
  )
}

function WeekCalendar({ rows, viewMode, selectedDate, onSelect, staffRows }) {
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
                const staff = getStaffForAppointment(row, staffRows)
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
                      borderLeftColor: staff?.color || tone.accent,
                      color: tone.text,
                    }}
                    onClick={() => onSelect(row)}
                  >
                    <span>{row.matterReference}</span>
                    <strong>{row.appointmentType || tone.label}</strong>
                    <small>{formatTime(row.dateTime)} - {formatTime(new Date(parsed.getTime() + resolveAppointmentDuration(row) * 60 * 1000))}</small>
                    <small>{staff?.label || row.assignedAttorneyName || row.assignedSecretaryName || tone.label}</small>
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

function CalendarSurface({ rows, viewMode, setViewMode, selectedDate, setSelectedDate, onSelect, staffRows }) {
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
          <WeekCalendar rows={rows} viewMode={viewMode} selectedDate={selectedDate} onSelect={onSelect} staffRows={staffRows} />
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
                <button type="button" onClick={() => onPropose(row)}>Counter time</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function RescheduleProposalDrawer({ request, draft, setDraft, busyId, onClose, onSubmit }) {
  if (!request) return null

  function updateDraft(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <aside className="invite-drawer" aria-label="Propose appointment reschedule">
      <form className="invite-drawer-card" onSubmit={onSubmit}>
        <div className="appointment-drawer-header">
          <span>Counter proposal</span>
          <button type="button" onClick={onClose} aria-label="Close reschedule proposal"><X size={17} /></button>
        </div>
        <div>
          <h2>Propose another time</h2>
          <p>{request.matterReference} · {request.clientName || 'Client'} · Times use {APPOINTMENT_RESCHEDULE_TIMEZONE}.</p>
        </div>
        <div className="invite-form-grid">
          <label className="drawer-field invite-field-wide">
            <span>Proposed start</span>
            <input
              type="datetime-local"
              value={draft.preferredStart}
              onChange={(event) => updateDraft('preferredStart', event.target.value)}
              required
            />
          </label>
          <label className="drawer-field invite-field-wide">
            <span>Proposed end</span>
            <input
              type="datetime-local"
              value={draft.preferredEnd}
              onChange={(event) => updateDraft('preferredEnd', event.target.value)}
              required
            />
          </label>
          <label className="drawer-field invite-field-wide">
            <span>Coordination note</span>
            <textarea
              value={draft.reason}
              onChange={(event) => updateDraft('reason', event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Explain the proposed alternative."
            />
          </label>
        </div>
        <div className="invite-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={Boolean(busyId)}>
            <RefreshCw size={15} />
            Send counter proposal
          </button>
        </div>
      </form>
    </aside>
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

export function CreateInviteDrawer({
  open,
  draft,
  setDraft,
  matterOptions,
  resources,
  staffOptions = [],
  busyId,
  onClose,
  onSubmit,
}) {
  if (!open) return null
  const selectedInviteType = getInviteType(draft.appointmentType)
  const selectedMatter = matterOptions.find((matter) => matter.matterId === draft.matterId)
  const isBoardroomInvite = draft.locationMode === ATTORNEY_INVITE_LOCATION_MODES.boardroom
  const selectedEventType = draft.eventType || 'signing'
  const matterRequired = draft.appointmentType !== 'internal_meeting'
  const searchableMatterOptions = matterOptions.filter((matter) => {
    const query = normalizeLower(draft.matterSearch || '')
    if (!query) return true
    return normalizeLower(`${matter.matterReference} ${matter.propertyLabel} ${matter.clientName}`).includes(query)
  }).slice(0, 8)

  function updateDraft(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <aside className="invite-drawer event-modal-backdrop" aria-label="Create new calendar event">
      <form className="invite-drawer-card event-modal-card" onSubmit={onSubmit}>
        <div className="event-modal-header">
          <div className="event-modal-title">
            <span><CalendarDays size={18} /></span>
            <div>
              <h2>New Event</h2>
              <p>Schedule an appointment, deadline or important action.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close create invite"><X size={17} /></button>
        </div>

        <div className="event-modal-body">
          <div className="event-modal-column">
            <label className="drawer-field invite-field-wide">
              <span>Event Title *</span>
              <input
                value={draft.title || ''}
                onChange={(event) => updateDraft('title', event.target.value)}
                placeholder="e.g. OTP Signing with Buyer"
                required
              />
            </label>

            <div className="drawer-field invite-field-wide">
              <span>Event Type *</span>
              <div className="event-type-card-list" role="radiogroup" aria-label="Event type">
                {EVENT_TYPE_CARDS.map((type) => {
                  const Icon = type.icon
                  return (
                    <button
                      key={type.value}
                      type="button"
                      className={`event-type-card ${selectedEventType === type.value ? 'is-active' : ''}`}
                      aria-pressed={selectedEventType === type.value}
                      onClick={() => {
                        setDraft((previous) => ({
                          ...previous,
                          eventType: type.value,
                          appointmentType: type.appointmentType,
                        }))
                      }}
                    >
                      <Icon size={17} />
                      <strong>{type.label}</strong>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="drawer-field invite-field-wide">
              <span>Date &amp; Time *</span>
              <div className="event-date-grid">
                <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} required />
                <input type="time" value={draft.startTime} onChange={(event) => updateDraft('startTime', event.target.value)} required />
                <input type="time" value={draft.endTime || ''} onChange={(event) => updateDraft('endTime', event.target.value)} />
                <label className="event-check-row">
                  <input type="checkbox" checked={Boolean(draft.allDay)} onChange={(event) => updateDraft('allDay', event.target.checked)} />
                  <span>All day</span>
                </label>
              </div>
              <select value={draft.timezone || APPOINTMENT_RESCHEDULE_TIMEZONE} onChange={(event) => updateDraft('timezone', event.target.value)}>
                <option value={APPOINTMENT_RESCHEDULE_TIMEZONE}>(GMT+02:00) South Africa Standard Time</option>
              </select>
            </div>

            <label className="drawer-field invite-field-wide">
              <span>Repeat</span>
              <select value={draft.repeat || 'none'} onChange={(event) => updateDraft('repeat', event.target.value)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            <div className="drawer-field invite-field-wide">
              <span>Location</span>
              <select value={draft.locationMode} onChange={(event) => updateDraft('locationMode', event.target.value)} required>
                {ATTORNEY_INVITE_LOCATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {isBoardroomInvite ? null : (
                <input
                  value={draft.location}
                  onChange={(event) => updateDraft('location', event.target.value)}
                  placeholder={draft.locationMode === ATTORNEY_INVITE_LOCATION_MODES.videoCall ? 'Microsoft Teams, Zoom or meeting link' : 'Office, external address or phone details'}
                  required
                />
              )}
            </div>

            <label className="drawer-field invite-field-wide">
              <span>Description / Notes</span>
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft('notes', event.target.value)}
                placeholder="Add any additional details, agenda or notes..."
                rows={5}
                maxLength={500}
              />
              <small>{normalizeText(draft.notes).length}/500</small>
            </label>

            <div className="drawer-field invite-field-wide">
              <span>Invitees</span>
              <input
                value={draft.recipientEmail}
                onChange={(event) => updateDraft('recipientEmail', event.target.value)}
                placeholder="Search to add attorneys, staff or external contacts..."
                type="email"
                required
              />
              <input
                value={draft.recipientName}
                onChange={(event) => updateDraft('recipientName', event.target.value)}
                placeholder="Invitee name"
              />
            </div>
          </div>

          <div className="event-modal-column event-modal-side">
            <div className="drawer-field invite-field-wide">
              <span>Link to Matter</span>
              <input
                value={draft.matterSearch || ''}
                onChange={(event) => updateDraft('matterSearch', event.target.value)}
                placeholder="Search matter number or address..."
              />
              <select value={draft.matterId} onChange={(event) => updateDraft('matterId', event.target.value)} required={matterRequired}>
                <option value="">Choose a matter</option>
                {searchableMatterOptions.map((matter) => (
                  <option key={matter.matterId} value={matter.matterId}>
                    {matter.matterReference} {matter.propertyLabel ? `- ${matter.propertyLabel}` : matter.clientName ? `- ${matter.clientName}` : ''}
                  </option>
                ))}
              </select>
              {selectedMatter ? (
                <div className="linked-matter-card">
                  <div>
                    <strong>{selectedMatter.matterReference}</strong>
                    <span>{selectedMatter.propertyLabel || selectedMatter.clientName || 'Property pending'}</span>
                  </div>
                  <small>{selectedMatter.matterType || selectedInviteType.label}</small>
                  <button type="button" onClick={() => updateDraft('matterId', '')} aria-label="Remove linked matter"><X size={14} /></button>
                </div>
              ) : null}
            </div>

            {selectedMatter ? (
              <div className="drawer-field invite-field-wide">
                <span>Related To</span>
                <div className="related-toggle">
                  {RELATED_TO_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={draft.relatedTo === option.value ? 'is-active' : ''}
                      onClick={() => updateDraft('relatedTo', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="drawer-field invite-field-wide">
              <span>Boardroom</span>
              <select value={draft.resourceId} onChange={(event) => {
                updateDraft('resourceId', event.target.value)
                if (event.target.value) updateDraft('locationMode', ATTORNEY_INVITE_LOCATION_MODES.boardroom)
              }}>
                <option value="">No boardroom</option>
                {resources.map((resource) => (
                  <option key={resource.resourceId} value={resource.resourceId}>{resource.resourceName}</option>
                ))}
              </select>
            </label>

            <label className="drawer-field invite-field-wide">
              <span>Attorneys / Staff</span>
              <select value="" onChange={(event) => updateDraft('assignedStaffId', event.target.value)}>
                <option value="">Choose staff member</option>
                {staffOptions.map((member) => (
                  <option key={member.value} value={member.value}>{member.label}</option>
                ))}
              </select>
            </label>

            <label className="drawer-field invite-field-wide">
              <span>Visibility</span>
              <select value={draft.visibility || 'shared_role_players'} onChange={(event) => updateDraft('visibility', event.target.value)}>
                <option value="shared_role_players">All Firm</option>
                <option value="internal_only">Internal Only</option>
                <option value="client_visible">Client Visible</option>
              </select>
            </label>

            <label className="drawer-field invite-field-wide">
              <span>Reminder</span>
              <select value={draft.reminder || '15'} onChange={(event) => updateDraft('reminder', event.target.value)}>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </select>
            </label>
          </div>
        </div>

        <div className="invite-actions">
          <label className="event-check-row event-notify-row">
            <input
              type="checkbox"
              checked={draft.sendNotifications !== false}
              onChange={(event) => updateDraft('sendNotifications', event.target.checked)}
            />
            <span>Send notifications</span>
          </label>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={Boolean(busyId)}>
            <Send size={15} />
            Create Event
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
        grid-template-columns: minmax(260px, 1fr) repeat(5, minmax(132px, 0.35fr)) 2.35rem;
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

      .scheduling-summary-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 228px;
        gap: 1rem;
        align-items: stretch;
      }

      .scheduling-metrics {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .scheduling-metric-card {
        min-height: 7.25rem;
        border-radius: 14px;
        padding: 1rem;
        align-items: center;
      }

      .scheduling-metric-icon {
        width: 2.35rem;
        height: 2.35rem;
        border-radius: 13px;
      }

      .scheduling-metric-card.tone-green .scheduling-metric-icon {
        background: #ecfdf3;
        color: #087443;
      }

      .scheduling-metric-card.tone-amber .scheduling-metric-icon {
        background: #fff7ed;
        color: #c2410c;
      }

      .scheduling-metric-card.tone-red .scheduling-metric-icon {
        background: #fef3f2;
        color: #b42318;
      }

      .scheduling-metric-card p {
        color: #60748c;
        font-weight: 700;
      }

      .scheduling-metric-card strong {
        font-size: 2rem;
      }

      .mini-month-picker {
        border: 1px solid #dce6f2;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 8px 24px rgba(15, 35, 65, 0.05);
        padding: 0.8rem;
      }

      .mini-month-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        margin-bottom: 0.55rem;
      }

      .mini-month-header strong {
        color: #10233f;
        font-size: 0.82rem;
      }

      .mini-month-header span {
        display: inline-flex;
        gap: 0.25rem;
      }

      .mini-month-header button,
      .scheduling-filter-icon {
        width: 2rem;
        height: 2rem;
        border-radius: 9px;
        border: 1px solid #d9e4f0;
        background: #fff;
        color: #18314d;
        display: inline-grid;
        place-items: center;
        cursor: pointer;
      }

      .mini-month-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 0.16rem;
      }

      .mini-month-grid span,
      .mini-month-grid button {
        min-height: 1.34rem;
        border: 0;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: transparent;
        color: #60748c;
        font-size: 0.68rem;
        font-weight: 700;
      }

      .mini-month-grid button {
        cursor: pointer;
      }

      .mini-month-grid button.is-muted {
        color: #a7b3c2;
      }

      .mini-month-grid button.is-selected {
        background: #0f3558;
        color: #fff;
      }

      .staff-list {
        display: grid;
      }

      .staff-row {
        width: 100%;
        min-height: 4rem;
        border: 0;
        border-bottom: 1px solid #edf2f7;
        background: #fff;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.7rem;
        padding: 0.65rem 0.8rem;
        text-align: left;
        cursor: pointer;
      }

      .staff-row.is-active {
        background: #f7fbfa;
      }

      .staff-row.is-muted {
        opacity: 0.48;
      }

      .staff-avatar {
        width: 2.15rem;
        height: 2.15rem;
        border: 2px solid #d9e4f0;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #fff;
        color: #10233f;
        font-size: 0.72rem;
        font-weight: 800;
      }

      .staff-avatar.is-all {
        border-color: #d9e4f0;
        background: #eff6ff;
        color: #1459b8;
      }

      .staff-row strong,
      .staff-row small {
        display: block;
      }

      .staff-row strong {
        color: #10233f;
        font-size: 0.82rem;
      }

      .staff-row small {
        margin-top: 0.12rem;
        color: #60748c;
        font-size: 0.72rem;
      }

      .staff-row i {
        width: 0.44rem;
        height: 0.44rem;
        border-radius: 999px;
      }

      .calendar-controls {
        flex-wrap: nowrap;
      }

      .calendar-date-controls strong {
        text-align: left;
        min-width: 13rem;
      }

      .event-modal-backdrop {
        justify-content: center;
        align-items: center;
        background: rgba(7, 18, 36, 0.42);
      }

      .event-modal-card {
        width: min(980px, calc(100vw - 2rem));
        max-height: calc(100vh - 2rem);
        height: auto;
        margin: 1rem;
        padding: 0;
        overflow: hidden;
      }

      .event-modal-header {
        min-height: 5.7rem;
        border-bottom: 1px solid #e4ecf5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.35rem;
      }

      .event-modal-title {
        display: flex;
        align-items: center;
        gap: 0.85rem;
      }

      .event-modal-title > span {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: #eff6ff;
        color: #2563eb;
      }

      .event-modal-title h2 {
        margin: 0;
      }

      .event-modal-header > button {
        width: 2.15rem;
        height: 2.15rem;
        border-radius: 10px;
        border: 1px solid #d9e4f0;
        background: #fff;
        display: grid;
        place-items: center;
        cursor: pointer;
      }

      .event-modal-body {
        max-height: calc(100vh - 9.8rem);
        overflow: auto;
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.72fr);
      }

      .event-modal-column {
        display: grid;
        align-content: start;
        gap: 0.85rem;
        padding: 1.25rem;
      }

      .event-modal-side {
        border-left: 1px solid #e4ecf5;
        background: #fbfdff;
      }

      .event-type-card-list {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 0.55rem;
      }

      .event-type-card {
        min-height: 4.7rem;
        border: 1px solid #d9e4f0;
        border-radius: 10px;
        background: #fff;
        color: #60748c;
        display: grid;
        place-items: center;
        gap: 0.35rem;
        cursor: pointer;
      }

      .event-type-card strong {
        color: #10233f;
        font-size: 0.78rem;
      }

      .event-type-card.is-active {
        border-color: #93c5fd;
        background: #eff6ff;
        color: #2563eb;
        box-shadow: inset 0 0 0 1px #bfdbfe;
      }

      .event-date-grid {
        display: grid;
        grid-template-columns: minmax(145px, 1fr) minmax(96px, 0.55fr) minmax(96px, 0.55fr) auto;
        gap: 0.55rem;
        align-items: center;
      }

      .event-check-row {
        min-height: 2.25rem;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        color: #334155;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .event-check-row input {
        width: 1rem;
        height: 1rem;
      }

      .linked-matter-card {
        border: 1px solid #d9e4f0;
        border-radius: 12px;
        background: #fff;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 0.65rem;
        padding: 0.7rem;
      }

      .linked-matter-card strong,
      .linked-matter-card span,
      .linked-matter-card small {
        display: block;
      }

      .linked-matter-card strong {
        color: #10233f;
        font-size: 0.86rem;
      }

      .linked-matter-card span {
        margin-top: 0.18rem;
        color: #60748c;
        font-size: 0.74rem;
      }

      .linked-matter-card small {
        border-radius: 999px;
        background: #ecfdf3;
        color: #067647;
        padding: 0.22rem 0.48rem;
        font-size: 0.68rem;
        font-weight: 800;
      }

      .linked-matter-card button {
        width: 1.8rem;
        height: 1.8rem;
        border: 0;
        background: transparent;
        color: #60748c;
        display: grid;
        place-items: center;
        cursor: pointer;
      }

      .related-toggle {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.45rem;
      }

      .related-toggle button {
        min-height: 2.35rem;
        border: 1px solid #d9e4f0;
        border-radius: 10px;
        background: #fff;
        color: #334155;
        font-weight: 800;
        cursor: pointer;
      }

      .related-toggle button.is-active {
        border-color: #93c5fd;
        background: #eff6ff;
        color: #2563eb;
      }

      .event-notify-row {
        margin-right: auto;
      }

      @media (max-width: 1280px) {
        .scheduling-summary-row {
          grid-template-columns: 1fr;
        }

        .mini-month-picker {
          display: none;
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

        .event-modal-body {
          grid-template-columns: 1fr;
        }

        .event-modal-side {
          border-left: 0;
          border-top: 1px solid #e4ecf5;
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
        .event-type-card-list,
        .event-date-grid,
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

        .event-modal-card {
          width: calc(100vw - 1rem);
          max-height: calc(100vh - 1rem);
        }

        .event-modal-header,
        .event-modal-column {
          padding: 1rem;
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
  const [rescheduleProposal, setRescheduleProposal] = useState(null)
  const [rescheduleDraft, setRescheduleDraft] = useState({ preferredStart: '', preferredEnd: '', reason: '' })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteDraft, setInviteDraft] = useState(() => createInviteDraftDefaults(new Date()))
  const [selectedStaffIds, setSelectedStaffIds] = useState([])
  const [rolloutStatus, setRolloutStatus] = useState(() => ({
    enabled: resolveAttorneyCalendarEnvironment() !== 'production',
    environment: resolveAttorneyCalendarEnvironment(),
    reason: 'loading',
  }))
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
  const staffRows = useMemo(() => buildStaffRows(memberOptions, activeRows), [memberOptions, activeRows])
  const staffFilteredRows = useMemo(
    () => activeRows.filter((row) => appointmentMatchesStaffSelection(row, selectedStaffIds)),
    [activeRows, selectedStaffIds],
  )
  const visibleRows = useMemo(() => sortByDateAscending(buildVisibleRows(staffFilteredRows, filters, selectedDate)), [staffFilteredRows, filters, selectedDate])
  const rescheduleRows = useMemo(() => buildRescheduleRows(normalizedRows), [normalizedRows])
  const visibleRescheduleRows = useMemo(() => buildRescheduleRows(visibleRows), [visibleRows])
  const staffOptions = useMemo(() => normalizeStaffOptions(memberOptions), [memberOptions])
  const feedRows = useMemo(() => buildOperationalFeed(visibleRows, visibleRescheduleRows), [visibleRows, visibleRescheduleRows])
  const matterOptions = useMemo(() => buildMatterOptions(matterRows), [matterRows])

  useEffect(() => {
    let active = true
    const scopedOrganisationId = organisationId || matterOptions.find((matter) => matter.organisationId)?.organisationId
    if (!scopedOrganisationId) {
      setRolloutStatus((current) => ({ ...current, enabled: false, reason: 'organisation_required' }))
      return () => { active = false }
    }

    getAttorneyCalendarRolloutStatus(scopedOrganisationId)
      .then((status) => {
        if (active) setRolloutStatus(status)
      })
      .catch(() => {
        if (active) {
          setRolloutStatus((current) => ({ ...current, enabled: false, reason: 'decision_unavailable' }))
        }
      })
    return () => { active = false }
  }, [organisationId, matterOptions])

  const metrics = useMemo(() => {
    const boardroomAssigned = activeRows.filter((row) => normalizeText(row.resourceId)).length
    const weekStart = startOfWeek(selectedDate)
    const weekEnd = addDays(weekStart, 7)
    return {
      todaysAppointments: activeRows.filter((row) => isToday(row.dateTime)).length,
      thisWeekAppointments: activeRows.filter((row) => {
        const parsed = new Date(row.dateTime || '')
        return !Number.isNaN(parsed.getTime()) && parsed >= weekStart && parsed < weekEnd
      }).length,
      pendingConfirmations: activeRows.filter((row) => row.operationalStatus === 'awaiting_confirmation').length,
      blockedSignings: activeRows.filter((row) => row.readiness?.label === 'Blocked' || row.operationalStatus === 'blocked').length,
      overdueSignings: activeRows.filter((row) => row.operationalStatus === 'awaiting_confirmation' && isPast(row.dateTime)).length,
      overdueItems: activeRows.filter((row) => (row.operationalStatus === 'awaiting_confirmation' || row.readiness?.label === 'Blocked') && isPast(row.dateTime)).length,
      rescheduleRequests: rescheduleRows.length,
      boardroomUtilisation: activeRows.length ? Math.round((boardroomAssigned / activeRows.length) * 100) : 0,
    }
  }, [activeRows, rescheduleRows.length, selectedDate])

  async function withBusy(id, callback, successMessage = 'Scheduling workspace updated.') {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      const outcome = await callback()
      const outcomeMessage = normalizeText(outcome?.message)
      if (outcomeMessage && outcome?.tone === 'error') {
        setError(outcomeMessage)
      } else {
        setMessage(outcomeMessage || successMessage)
      }
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
    const result = await resendAttorneyAppointmentCommunication(row.id, kind)
    if (result.failedCount > 0) {
      return { tone: 'error', message: 'The appointment remains saved, but the communication could not be delivered.' }
    }
    if (result.deliveredCount > 0) {
      return { tone: 'success', message: 'Appointment communication sent.' }
    }
    return { tone: 'error', message: 'No eligible external recipient was available for this communication.' }
  })

  const handleOpenRescheduleProposal = (row) => {
    const fallbackStart = row.preferredStart || row.appointment?.dateTime
    const fallbackEnd = row.preferredEnd || (fallbackStart ? new Date(new Date(fallbackStart).getTime() + (45 * 60 * 1000)).toISOString() : '')
    setRescheduleProposal(row)
    setRescheduleDraft({
      preferredStart: formatJohannesburgDateTimeInput(fallbackStart),
      preferredEnd: formatJohannesburgDateTimeInput(fallbackEnd),
      reason: row.reason || '',
    })
  }

  const handleSubmitRescheduleProposal = (event) => {
    event.preventDefault()
    if (!rescheduleProposal?.requestId) return
    const proposal = buildAppointmentRescheduleProposalContract({
      preferredStart: johannesburgDateTimeInputToIso(rescheduleDraft.preferredStart),
      preferredEnd: johannesburgDateTimeInputToIso(rescheduleDraft.preferredEnd),
      reason: rescheduleDraft.reason,
    })
    if (!proposal.isValid) {
      setError(proposal.errors[0]?.message || 'Choose a valid counter-proposal time.')
      return
    }
    void withBusy(`propose-${rescheduleProposal.requestId}`, async () => {
      await proposeAttorneyAppointmentReschedule(rescheduleProposal.requestId, proposal.value)
      setRescheduleProposal(null)
      return { tone: 'success', message: 'Counter proposal recorded and queued for delivery.' }
    })
  }

  const handleResolveReschedule = (row, decision) => withBusy(`resolve-${row.requestId}-${decision}`, async () => {
    await resolveAttorneyAppointmentReschedule(row.requestId, {
      decision,
      reason: decision === 'rejected' ? 'Unable to accommodate requested slot.' : 'Reschedule approved.',
    })
  })

  const handleCreateInvite = (event) => {
    event.preventDefault()
    if (!rolloutStatus.enabled) {
      setError('New Event is temporarily unavailable for this firm.')
      return
    }
    const selectedMatter = matterOptions.find((matter) => matter.matterId === inviteDraft.matterId)
    const isFirmLevelEvent = inviteDraft.appointmentType === 'internal_meeting'
    if (!selectedMatter && !isFirmLevelEvent) {
      setError('Choose a matter before creating the invite.')
      return
    }

    const selectedResource = resources.find((resource) => String(resource.resourceId || '') === String(inviteDraft.resourceId || ''))
    const boardroomLocation = selectedResource?.resourceName || ''
    const inviteContract = buildAttorneyInviteContract({
      ...inviteDraft,
      title: inviteDraft.title,
      visibility: inviteDraft.visibility,
      attachCalendarInvite: inviteDraft.sendNotifications !== false,
      recipientName: inviteDraft.recipientName || selectedMatter?.clientName || currentUser?.name || currentUser?.email || 'Team Member',
      organisationId: organisationId || selectedMatter?.organisationId,
      transactionId: selectedMatter?.matterId || '',
      resourceName: boardroomLocation,
      attorneyName: currentUser?.name || currentUser?.email || '',
      attorneyEmail: currentUser?.email || '',
    })

    if (!inviteContract.isValid) {
      setError(inviteContract.errors[0]?.message || 'Attorney invite details are invalid.')
      return
    }

    void withBusy('create-invite', async () => {
      const created = await createAttorneyAppointmentInvite(inviteContract.value)
      setInviteOpen(false)
      setInviteDraft(createInviteDraftDefaults(selectedDate))
      return buildAttorneyInviteOutcome(created.delivery)
    })
  }

  function openCreateEventModal() {
    setInviteDraft(createInviteDraftDefaults(selectedDate))
    setInviteOpen(true)
  }

  return (
    <section className="attorney-scheduling-os">
      <SchedulingStyles />
      <SchedulingPageHeader onCreateInvite={openCreateEventModal} rolloutStatus={rolloutStatus} />
      {error ? <div className="scheduling-alert is-error">{error}</div> : null}
      {message ? <div className="scheduling-alert is-success">{message}</div> : null}
      {busyId ? <div className="scheduling-alert">Processing scheduling action...</div> : null}
      <MetricsStrip metrics={metrics} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
      <FilterToolbar filters={filters} setFilters={setFilters} resources={resources} memberOptions={staffRows} />
      <section className="scheduling-main-grid">
        <StaffVisibilityPanel
          staffRows={staffRows}
          selectedStaffIds={selectedStaffIds}
          setSelectedStaffIds={setSelectedStaffIds}
        />
        <CalendarSurface
          rows={visibleRows}
          viewMode={viewMode}
          setViewMode={setViewMode}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          onSelect={setSelectedAppointment}
          staffRows={staffRows}
        />
      </section>
      <section className="scheduling-secondary-grid">
        <ReschedulePanel
          rows={visibleRescheduleRows.length ? visibleRescheduleRows : rescheduleRows}
          onPropose={handleOpenRescheduleProposal}
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
        staffOptions={staffOptions}
        busyId={busyId}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleCreateInvite}
      />
      <RescheduleProposalDrawer
        request={rescheduleProposal}
        draft={rescheduleDraft}
        setDraft={setRescheduleDraft}
        busyId={busyId}
        onClose={() => setRescheduleProposal(null)}
        onSubmit={handleSubmitRescheduleProposal}
      />
    </section>
  )
}

export default AttorneySchedulingWorkspace
