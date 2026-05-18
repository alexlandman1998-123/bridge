import { getClientPortalWorkspaceData } from './clientPortalWorkspaceService'

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (['confirmed', 'awaiting_confirmation', 'reschedule_requested', 'completed', 'cancelled'].includes(normalized)) {
    return normalized
  }
  if (['pending', 'proposed', 'pending_confirmation'].includes(normalized)) return 'awaiting_confirmation'
  if (['declined', 'cancelled_by_client', 'cancelled_by_agent'].includes(normalized)) return 'cancelled'
  if (['done', 'complete'].includes(normalized)) return 'completed'
  if (['needs_reschedule', 'proposed_new_time'].includes(normalized)) return 'reschedule_requested'
  return 'confirmed'
}

function normalizeMethod(appointment = {}) {
  const raw = toText(
    appointment.method ||
      appointment.appointmentMethod ||
      appointment.appointment_method ||
      appointment.meetingType ||
      appointment.meeting_type ||
      appointment.locationType ||
      appointment.location_type,
  ).toLowerCase()
  const location = toText(appointment.location || appointment.address || appointment.venue)
  const virtualUrl = toText(appointment.virtualUrl || appointment.virtual_url || appointment.meetingUrl || appointment.meeting_url)

  if (/virtual|online|zoom|teams|meet/.test(raw) || virtualUrl) return 'virtual'
  if (/phone|call|telephonic/.test(raw)) return 'phone'
  if (/site|office|property|in_person|in-person/.test(raw) || location) return 'on_site'
  return 'on_site'
}

function getMethodLabel(method = '') {
  if (method === 'virtual') return 'Virtual'
  if (method === 'phone') return 'Phone'
  return 'On-site'
}

function resolveAgent(appointment = {}) {
  const participants = toArray(appointment.participants)
  const participant = participants.find((item) => {
    const role = toText(item?.participantRole || item?.participant_role || item?.role).toLowerCase()
    return role.includes('agent') || role.includes('principal') || role.includes('sales')
  }) || null

  const name = toText(
    appointment.assignedAgent?.name ||
      appointment.assigned_agent?.name ||
      appointment.agentName ||
      appointment.agent_name ||
      participant?.name ||
      participant?.participantName ||
      participant?.participant_name,
    'Bridge Property Team',
  )

  return {
    id: toText(appointment.assignedAgent?.id || appointment.assigned_agent_id || participant?.id),
    name,
    avatarUrl: toText(appointment.assignedAgent?.avatarUrl || appointment.assigned_agent?.avatar_url || participant?.avatarUrl || participant?.avatar_url),
    phone: toText(appointment.assignedAgent?.phone || appointment.agentPhone || appointment.agent_phone || participant?.phone),
    email: toText(appointment.assignedAgent?.email || appointment.agentEmail || appointment.agent_email || participant?.email),
  }
}

function resolveAppointmentType(appointment = {}) {
  const raw = toText(
    appointment.appointmentType ||
      appointment.appointment_type ||
      appointment.appointmentTypeLabel ||
      appointment.appointment_type_label ||
      appointment.type ||
      appointment.title,
    'Appointment',
  )
  return raw
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function resolveStartTime(appointment = {}) {
  return toText(
    appointment.startTime ||
      appointment.start_time ||
      appointment.dateTime ||
      appointment.date_time ||
      appointment.scheduledAt ||
      appointment.scheduled_at,
  )
}

function resolveDurationMinutes(appointment = {}, startTime = '') {
  const explicit = Number(appointment.durationMinutes || appointment.duration_minutes || appointment.duration || 0)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const endTime = toText(appointment.endTime || appointment.end_time)
  const start = Date.parse(startTime)
  const end = Date.parse(endTime)
  if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
    return Math.round((end - start) / 60000)
  }
  return 60
}

function isSellerSafeAppointment(appointment = {}) {
  const visibility = toText(appointment.visibility || appointment.visibility_scope).toLowerCase()
  if (visibility === 'internal' || visibility === 'internal_only' || visibility === 'staff_only') return false
  if (appointment.clientVisible === false || appointment.sellerVisible === false) return false
  const status = toText(appointment.status).toLowerCase().replace(/\s+/g, '_')
  if (['draft', 'internal_draft', 'incomplete', 'private_note'].includes(status)) return false
  const type = `${appointment.type || ''} ${appointment.appointmentType || ''} ${appointment.title || ''}`.toLowerCase()
  return !/(internal task|private follow|staff reminder|admin reminder)/.test(type)
}

export function normalizeSellerPortalAppointment(appointment = {}, index = 0) {
  const startTime = resolveStartTime(appointment)
  const endTime = toText(appointment.endTime || appointment.end_time)
  const method = normalizeMethod(appointment)
  const appointmentType = resolveAppointmentType(appointment)

  return {
    id: toText(appointment.appointmentId || appointment.appointment_id || appointment.id, `seller_appointment_${index}`),
    transactionId: toText(appointment.transactionId || appointment.transaction_id),
    sellerId: toText(appointment.sellerId || appointment.seller_id || appointment.clientId || appointment.client_id),
    title: toText(appointment.title, appointmentType),
    description: toText(
      appointment.description ||
        appointment.summary ||
        appointment.notes ||
        appointment.instructions,
      'Your agent will share the details for this appointment.',
    ),
    appointmentType,
    startTime,
    endTime,
    durationMinutes: resolveDurationMinutes(appointment, startTime),
    method,
    methodLabel: getMethodLabel(method),
    location: toText(appointment.location || appointment.address || appointment.venue || appointment.virtualUrl || appointment.meetingUrl),
    status: normalizeStatus(appointment.status),
    assignedAgent: resolveAgent(appointment),
    raw: appointment,
  }
}

function sortByStartTime(items = [], direction = 'asc') {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.startTime || '')
    const rightTime = Date.parse(right.startTime || '')
    const safeLeft = Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime
    const safeRight = Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime
    return direction === 'desc' ? safeRight - safeLeft : safeLeft - safeRight
  })
}

export function buildSellerPortalAppointmentsPayload(appointments = []) {
  const normalized = toArray(appointments)
    .filter((appointment) => isSellerSafeAppointment(appointment))
    .map((appointment, index) => normalizeSellerPortalAppointment(appointment, index))

  const now = Date.now()
  const upcomingAppointments = sortByStartTime(
    normalized.filter((appointment) => {
      if (appointment.status === 'completed' || appointment.status === 'cancelled') return false
      const time = Date.parse(appointment.startTime || '')
      return Number.isNaN(time) || time >= now - (1000 * 60 * 60 * 2)
    }),
  )
  const completedAppointments = sortByStartTime(
    normalized.filter((appointment) => appointment.status === 'completed'),
    'desc',
  )
  const awaitingConfirmationCount = normalized.filter((appointment) => appointment.status === 'awaiting_confirmation').length
  const rescheduleRequestCount = normalized.filter((appointment) => appointment.status === 'reschedule_requested').length

  return {
    summary: {
      upcomingCount: upcomingAppointments.length,
      completedCount: completedAppointments.length,
      awaitingConfirmationCount,
      rescheduleRequestCount,
      nextAppointment: upcomingAppointments[0] || null,
    },
    upcomingAppointments,
    completedAppointments,
    calendarEvents: normalized
      .filter((appointment) => appointment.startTime)
      .map((appointment) => ({
        id: appointment.id,
        date: appointment.startTime,
        status: appointment.status,
        title: appointment.title,
      })),
  }
}

export async function getSellerPortalAppointments({ token } = {}) {
  const workspaceData = await getClientPortalWorkspaceData(token, 'seller')
  return buildSellerPortalAppointmentsPayload(workspaceData?.appointments || [])
}
