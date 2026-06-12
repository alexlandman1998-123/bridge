import { normalizeAppointmentTypeKey } from '../lib/appointmentTypeDefinitions.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function toDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfDay(value) {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

function addDays(value, amount) {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  return next
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function titleCase(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function extractParticipants(appointment = {}) {
  return Array.isArray(appointment?.participants) ? appointment.participants : []
}

function getExternalParticipant(appointment = {}) {
  const participants = extractParticipants(appointment)
  return participants.find((participant) => {
    const role = normalizeKey(participant?.participantRole || participant?.role)
    return ['buyer', 'seller', 'client', 'tenant', 'landlord', 'owner', 'other_contact'].includes(role)
  }) || participants[0] || null
}

function getAssignedParticipant(appointment = {}) {
  const participants = extractParticipants(appointment)
  return participants.find((participant) => {
    const role = normalizeKey(participant?.participantRole || participant?.role)
    return ['agent', 'principal', 'attorney', 'bond_originator', 'developer', 'developer_representative'].includes(role)
  }) || null
}

function getClientName(appointment = {}) {
  const participant = getExternalParticipant(appointment)
  return normalizeText(
    appointment?.clientName ||
      appointment?.buyerName ||
      appointment?.sellerName ||
      appointment?.contactName ||
      participant?.name,
  ) || 'Client pending'
}

function getAssignedName(appointment = {}) {
  const participant = getAssignedParticipant(appointment)
  return normalizeText(
    appointment?.assignedAgentName ||
      appointment?.agentName ||
      participant?.name,
  ) || 'Unassigned'
}

function getAssignedRole(appointment = {}, module = 'default') {
  const participant = getAssignedParticipant(appointment)
  const explicitRole = normalizeKey(participant?.participantRole || participant?.role)
  if (explicitRole === 'principal') return 'Principal'
  if (explicitRole === 'attorney') return 'Attorney'
  if (explicitRole === 'bond_originator') return 'Bond Originator'
  if (explicitRole === 'developer_representative' || explicitRole === 'developer') return 'Developer'
  if (explicitRole === 'agent') return 'Agent'
  if (module === 'attorney') return 'Attorney'
  if (module === 'bond') return 'Bond Originator'
  if (module === 'developer') return 'Developer'
  return 'Agent'
}

function getAddress(appointment = {}) {
  const locationType = normalizeKey(appointment?.locationType || appointment?.location_type)
  if (!['', 'physical_address', 'to_be_confirmed'].includes(locationType)) return ''
  return normalizeText(
    appointment?.address ||
      appointment?.propertyAddress ||
      appointment?.locationAddress ||
      appointment?.location_address ||
      appointment?.location,
  )
}

function getStatusValue(appointment = {}) {
  return normalizeKey(appointment?.status)
}

function isClosedStatus(status = '') {
  return ['cancelled', 'declined', 'completed', 'no_show'].includes(status)
}

function isPendingConfirmationStatus(status = '') {
  return ['draft', 'requested', 'accepted'].includes(status)
}

function isRescheduleStatus(status = '') {
  return ['alternative_requested', 'alternative_proposed', 'reschedule_requested'].includes(status)
}

export function getAppointmentStatusPresentation(status = '') {
  const key = normalizeKey(status)
  if (isRescheduleStatus(key)) {
    return { key: 'reschedule_requested', label: 'Reschedule Requested', tone: 'red' }
  }
  if (key === 'confirmed') {
    return { key: 'confirmed', label: 'Confirmed', tone: 'green' }
  }
  if (key === 'completed') {
    return { key: 'completed', label: 'Completed', tone: 'slate' }
  }
  if (key === 'cancelled' || key === 'declined') {
    return { key: 'cancelled', label: 'Cancelled', tone: 'slate' }
  }
  if (key === 'no_show') {
    return { key: 'no_show', label: 'No-show', tone: 'red' }
  }
  return { key: 'pending', label: 'Pending', tone: 'amber' }
}

const TYPE_LABELS = {
  viewing: 'Property Viewing',
  buyer_viewing: 'Property Viewing',
  seller_consultation: 'Seller Valuation Appointment',
  seller_meeting: 'Seller Appointment',
  seller_valuation: 'Seller Valuation Appointment',
  valuation: 'Seller Valuation Appointment',
  listing_presentation: 'Listing Presentation',
  buyer_consultation: 'Buyer Consultation',
  consultation: 'Buyer Consultation',
  finance_consultation: 'Finance Consultation',
  otp_signing: 'OTP Signing',
  site_visit: 'Site Inspection',
  snag_inspection: 'Site Inspection',
  handover: 'Handover Appointment',
  mandate_signing: 'Mandate Signing Appointment',
  attorney_consultation: 'Transfer Consultation',
  transfer_signing: 'Signing Appointment',
  bond_signing: 'Bond Signing',
  client_meeting: 'General Appointment',
  internal_meeting: 'General Appointment',
  other: 'General Appointment',
}

const MODULE_TYPE_LABELS = {
  attorney: {
    attorney_consultation: 'Matter Appointment',
    transfer_signing: 'Signing Appointment',
    bond_signing: 'Bond Signing',
  },
  bond: {
    finance_consultation: 'Finance Consultation',
    bond_signing: 'Bond Signing',
    client_meeting: 'Document Collection',
  },
  developer: {
    viewing: 'Site Viewing',
    handover: 'Handover Appointment',
    snag_inspection: 'Inspection',
  },
  commercial: {
    viewing: 'Tenant Viewing',
    seller_consultation: 'Valuation',
    client_meeting: 'Landlord Meeting',
  },
}

export function formatAppointmentType(type = '', { module = 'default', customTypeLabel = '' } = {}) {
  const normalizedCustomLabel = normalizeText(customTypeLabel)
  const normalizedType = normalizeAppointmentTypeKey(type || customTypeLabel || 'other')
  const moduleLabel = MODULE_TYPE_LABELS[module]?.[normalizedType]
  if (moduleLabel) return moduleLabel
  if (TYPE_LABELS[normalizedType]) return TYPE_LABELS[normalizedType]
  if (normalizedCustomLabel && normalizeKey(normalizedCustomLabel) !== 'other') return titleCase(normalizedCustomLabel)
  if (!normalizedType || normalizedType === 'other') return 'General Appointment'
  return titleCase(normalizedType)
}

function getTypeIconKey(type = '', module = 'default') {
  const normalizedType = normalizeAppointmentTypeKey(type || 'other')
  if (['viewing', 'buyer_viewing'].includes(normalizedType)) return module === 'developer' ? 'building' : 'home'
  if (['seller_consultation', 'seller_valuation', 'valuation'].includes(normalizedType)) return 'home'
  if (normalizedType === 'listing_presentation') return 'presentation'
  if (['buyer_consultation', 'consultation', 'client_meeting'].includes(normalizedType)) return 'user'
  if (normalizedType === 'finance_consultation') return 'landmark'
  if (['mandate_signing', 'otp_signing', 'transfer_signing', 'bond_signing'].includes(normalizedType)) return 'signature'
  if (['site_visit', 'snag_inspection'].includes(normalizedType)) return 'inspection'
  if (normalizedType === 'handover') return 'key'
  if (normalizedType === 'attorney_consultation') return 'scale'
  return 'calendar'
}

function getTimeLabel(dateTime) {
  const date = toDate(dateTime)
  if (!date) return '—'
  return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

function getDateAnchorLabel(dateTime, now = new Date()) {
  const date = toDate(dateTime)
  if (!date) return ''
  if (isSameDay(date, now)) return 'Today'
  const tomorrow = addDays(startOfDay(now), 1)
  if (isSameDay(date, tomorrow)) return 'Tomorrow'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }).toUpperCase()
}

function getCountdownLabel(dateTime, now = new Date()) {
  const date = toDate(dateTime)
  if (!date) return ''
  const diffMinutes = Math.round((date.getTime() - now.getTime()) / 60000)
  const absoluteMinutes = Math.abs(diffMinutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const minutes = absoluteMinutes % 60
  const formatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  if (diffMinutes < 0) return `Overdue by ${formatted}`
  return `Starts in ${formatted}`
}

function isUrgent(dateTime, now = new Date()) {
  const date = toDate(dateTime)
  if (!date) return false
  const diffMinutes = Math.round((date.getTime() - now.getTime()) / 60000)
  return diffMinutes >= 0 && diffMinutes <= 60
}

function isOverdueAppointment(appointment = {}, now = new Date()) {
  const status = getStatusValue(appointment)
  if (isClosedStatus(status)) return false
  const date = toDate(appointment?.dateTime)
  return Boolean(date && date.getTime() < now.getTime())
}

function appointmentMatchesAgent(appointment = {}, { userId = '', userEmail = '' } = {}) {
  const normalizedUserId = normalizeText(userId)
  const normalizedUserEmail = normalizeText(userEmail).toLowerCase()
  const appointmentAgentId = normalizeText(appointment?.assignedAgentId || appointment?.agentId)
  const appointmentAgentEmail = normalizeText(appointment?.assignedAgentEmail || appointment?.agentEmail).toLowerCase()
  const createdBy = normalizeText(appointment?.createdBy).toLowerCase()
  return (
    (normalizedUserId && appointmentAgentId === normalizedUserId) ||
    (normalizedUserEmail && (appointmentAgentEmail === normalizedUserEmail || createdBy === normalizedUserEmail))
  )
}

function appointmentMatchesLeadScope(appointment = {}, leadId = '') {
  const targetLeadId = normalizeText(leadId)
  if (!targetLeadId) return true
  return targetLeadId === normalizeText(appointment?.leadId)
    || (normalizeKey(appointment?.relatedEntityType) === 'lead' && targetLeadId === normalizeText(appointment?.relatedEntityId))
}

function appointmentMatchesTransactionScope(appointment = {}, transactionId = '', matterId = '') {
  const normalizedTransactionId = normalizeText(transactionId)
  const normalizedMatterId = normalizeText(matterId)
  const scopedId = normalizedTransactionId || normalizedMatterId
  if (!scopedId) return true
  return scopedId === normalizeText(appointment?.transactionId)
    || scopedId === normalizeText(appointment?.relatedEntityId)
}

function appointmentMatchesListingScope(appointment = {}, listingId = '') {
  const targetListingId = normalizeText(listingId)
  if (!targetListingId) return true
  return targetListingId === normalizeText(appointment?.listingId)
}

function appointmentMatchesModule(appointment = {}, module = 'default') {
  const type = normalizeAppointmentTypeKey(appointment?.appointmentType || appointment?.customTypeLabel || 'other')
  const workflow = normalizeKey(appointment?.linkedWorkflow)
  const stage = normalizeKey(appointment?.linkedWorkflowStage)
  const relatedType = normalizeKey(appointment?.relatedEntityType)
  const participantRoles = extractParticipants(appointment).map((participant) => normalizeKey(participant?.participantRole || participant?.role)).filter(Boolean)
  if (module === 'attorney') {
    return ['attorney_consultation', 'transfer_signing', 'bond_signing', 'otp_signing', 'mandate_signing'].includes(type)
      || workflow.includes('transfer')
      || workflow.includes('bond')
      || relatedType === 'matter'
      || participantRoles.includes('attorney')
  }
  if (module === 'bond') {
    return ['finance_consultation', 'bond_signing'].includes(type)
      || workflow.includes('finance')
      || workflow.includes('bond')
      || participantRoles.includes('bond_originator')
  }
  if (module === 'developer') {
    return ['handover', 'snag_inspection', 'viewing'].includes(type)
      || participantRoles.includes('developer_representative')
      || relatedType === 'development'
      || relatedType === 'unit'
      || stage.includes('handover')
  }
  if (module === 'commercial') {
    return ['viewing', 'seller_consultation', 'client_meeting'].includes(type)
      || workflow.includes('commercial')
      || stage.includes('lease')
      || stage.includes('tenant')
      || stage.includes('mandate')
  }
  return true
}

function scopeAppointmentRows(rows = [], params = {}) {
  const module = normalizeKey(params.module) || 'default'
  return (Array.isArray(rows) ? rows : []).filter((appointment) => {
    if (!appointmentMatchesLeadScope(appointment, params.leadId)) return false
    if (!appointmentMatchesTransactionScope(appointment, params.transactionId, params.matterId)) return false
    if (!appointmentMatchesListingScope(appointment, params.listingId)) return false
    if (module === 'agent' && !appointmentMatchesAgent(appointment, params)) return false
    if (!appointmentMatchesModule(appointment, module)) return false
    return true
  })
}

function sortAppointments(rows = []) {
  return [...rows].sort((left, right) => {
    const leftDate = toDate(left?.dateTime)?.getTime() || 0
    const rightDate = toDate(right?.dateTime)?.getTime() || 0
    return leftDate - rightDate
  })
}

function buildWeekDays(appointments = [], now = new Date()) {
  const weekStart = startOfDay(now)
  const dayOfWeek = weekStart.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = addDays(weekStart, mondayOffset)
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(monday, index)
    const count = appointments.filter((appointment) => {
      const appointmentDate = toDate(appointment?.dateTime)
      return Boolean(appointmentDate && isSameDay(appointmentDate, date))
    }).length
    return {
      date: date.toISOString(),
      dayLabel: date.toLocaleDateString('en-ZA', { weekday: 'short' }),
      dayNumber: date.getDate(),
      isToday: isSameDay(date, now),
      isSelected: isSameDay(date, now),
      count,
    }
  })
}

function groupAppointments(appointments = [], now = new Date()) {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const weekEnd = endOfDay(addDays(today, 6))
  const activeAppointments = appointments.filter((appointment) => !isClosedStatus(getStatusValue(appointment)))
  return [
    {
      label: 'Today',
      appointments: activeAppointments.filter((appointment) => {
        const date = toDate(appointment?.dateTime)
        return Boolean(date && isSameDay(date, today))
      }),
    },
    {
      label: 'Tomorrow',
      appointments: activeAppointments.filter((appointment) => {
        const date = toDate(appointment?.dateTime)
        return Boolean(date && isSameDay(date, tomorrow))
      }),
    },
    {
      label: 'This Week',
      appointments: activeAppointments.filter((appointment) => {
        const date = toDate(appointment?.dateTime)
        return Boolean(date && date >= addDays(today, 2) && date <= weekEnd)
      }),
    },
  ]
}

function normalizeDashboardAppointment(appointment = {}, params = {}) {
  const now = params.now instanceof Date ? params.now : new Date()
  const module = normalizeKey(params.module) || 'default'
  const typeLabel = formatAppointmentType(appointment?.appointmentType, {
    module,
    customTypeLabel: appointment?.customTypeLabel,
  })
  const status = getAppointmentStatusPresentation(appointment?.status)
  const dateTime = appointment?.dateTime || appointment?.date_time || null
  return {
    ...appointment,
    id: normalizeText(appointment?.appointmentId || appointment?.id),
    typeLabel,
    typeIconKey: getTypeIconKey(appointment?.appointmentType, module),
    statusKey: status.key,
    statusLabel: status.label,
    statusTone: status.tone,
    clientName: getClientName(appointment),
    propertyAddress: getAddress(appointment),
    assignedName: getAssignedName(appointment),
    assignedRole: getAssignedRole(appointment, module),
    timeLabel: getTimeLabel(dateTime),
    dateAnchorLabel: getDateAnchorLabel(dateTime, now),
    countdownLabel: getCountdownLabel(dateTime, now),
    isOverdue: isOverdueAppointment(appointment, now),
    isUrgent: isUrgent(dateTime, now),
  }
}

async function loadRows(params = {}) {
  if (Array.isArray(params.appointments)) return params.appointments
  const organisationId = normalizeText(params.organisationId)
  if (!organisationId) return []
  const { listAppointmentsAsync } = await import('../lib/agencyPipelineService.js')
  return listAppointmentsAsync(organisationId, {
    includeAll: params.includeAll !== false,
    agentId: normalizeText(params.userId || params.agentId),
    agentEmail: normalizeText(params.userEmail || params.agentEmail),
    agentKeys: Array.isArray(params.agentKeys) ? params.agentKeys : [],
    listingId: normalizeText(params.listingId),
    from: params.dateRange?.from || null,
    to: params.dateRange?.to || null,
  })
}

export async function getAppointmentDashboardData(params = {}) {
  const now = params.now instanceof Date ? params.now : new Date()
  const module = normalizeKey(params.module) || 'default'
  const rows = await loadRows(params)
  const scopedRows = sortAppointments(scopeAppointmentRows(rows, { ...params, module }))
  const normalizedAppointments = scopedRows.map((appointment) => normalizeDashboardAppointment(appointment, { ...params, module, now }))
  const todayAppointments = normalizedAppointments.filter((appointment) => {
    const date = toDate(appointment?.dateTime)
    return Boolean(date && isSameDay(date, now))
  })
  const pendingConfirmation = normalizedAppointments.filter((appointment) => isPendingConfirmationStatus(getStatusValue(appointment))).length
  const upcoming = normalizedAppointments.filter((appointment) => {
    const status = getStatusValue(appointment)
    const date = toDate(appointment?.dateTime)
    return Boolean(date && date >= now && !isClosedStatus(status))
  }).length
  const needsReschedule = normalizedAppointments.filter((appointment) => isRescheduleStatus(getStatusValue(appointment))).length
  const nextAppointment = normalizedAppointments.find((appointment) => !isClosedStatus(getStatusValue(appointment))) || null
  const groups = groupAppointments(normalizedAppointments, now)
    .map((group) => ({
      ...group,
      appointments: group.appointments.map((appointment) => normalizeDashboardAppointment(appointment, { ...params, module, now })),
    }))

  return {
    counts: {
      pendingConfirmation,
      upcoming,
      needsReschedule,
    },
    calendarStrip: {
      selectedDate: startOfDay(now).toISOString(),
      currentMonthLabel: now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
      weekDays: buildWeekDays(normalizedAppointments, now),
      appointmentsToday: todayAppointments.length,
    },
    nextAppointment,
    groups,
    appointments: normalizedAppointments,
    empty: normalizedAppointments.length === 0,
  }
}
