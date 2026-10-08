import { appointmentReservesTime } from '../core/appointments/appointmentReservation.js'
import { getAppointmentTypeDefinition, normalizeAppointmentTypeKey } from './appointmentTypeDefinitions'
import {
  addAppointmentDateDays,
  appointmentLocalParts,
  appointmentLocalToIso,
  resolveAppointmentSchedule,
} from '../core/appointments/appointmentTime.js'

const DEFAULT_BUSINESS_HOURS = {
  timezone: 'Africa/Johannesburg',
  days: [1, 2, 3, 4, 5],
  start: '08:00',
  end: '17:00',
}

const CRITICAL_PARTICIPANT_ROLES = new Set([
  'attorney',
  'bond attorney',
  'conveyancing secretary',
  'signing secretary',
  'bond originator',
  'agent',
  'developer representative',
  'developer',
])

const WORKFLOW_STAGE_ORDER = {
  otp_signing: 1,
  transfer_documents_signature: 2,
  transfer_signing: 2,
  registration: 3,
  handover: 4,
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLowerText(value = '') {
  return normalizeText(value).toLowerCase()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function parseTimeToMinutes(value = '') {
  const normalized = normalizeText(value)
  const match = normalized.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return (hours * 60) + minutes
}

function resolveBufferMinutes(payload = {}) {
  const definition = getAppointmentTypeDefinition(payload?.appointmentType)
  const fromPayload = Number(payload?.bufferMinutes)
  if (Number.isFinite(fromPayload) && fromPayload >= 0) return fromPayload
  const fromDefinition = Number(definition?.defaultBufferMinutes)
  if (Number.isFinite(fromDefinition) && fromDefinition >= 0) return fromDefinition
  return 15
}

function normalizeParticipantRole(value = '') {
  return normalizeLowerText(value).replace(/_/g, ' ')
}

function participantIdentityKey(participant = {}) {
  const userId = normalizeText(participant.userId || participant.user_id)
  if (userId) return `user_id:${userId}`
  const email = normalizeLowerText(participant.email)
  if (email) return `email:${email}`
  const contactId = normalizeText(participant.contactId || participant.contact_id)
  return contactId ? `contact_id:${contactId}` : ''
}

function normalizeAppointmentForConflict(row = {}) {
  const schedule = resolveAppointmentSchedule(row, {
    defaultDurationMinutes: getAppointmentTypeDefinition(row.appointmentType || row.appointment_type)?.defaultDuration || 45,
    strict: false,
  })
  if (!schedule.dateTime || !schedule.endDateTime || schedule.schedulingTimeIssue) return null
  const startDate = new Date(schedule.dateTime)
  const endDate = new Date(schedule.endDateTime)
  return {
    ...row,
    appointmentId: normalizeText(row?.appointmentId || row?.appointment_id || row?.id),
    appointmentType: normalizeAppointmentTypeKey(row?.appointmentType || row?.appointment_type),
    title: normalizeText(row?.title),
    status: normalizeText(row?.status),
    startDate,
    endDate,
    timezone: schedule.timezone,
    allDay: schedule.allDay,
    bufferMinutes: resolveBufferMinutes({
      appointmentType: row?.appointmentType || row?.appointment_type,
      bufferMinutes: row?.bufferMinutes,
    }),
    assignedAgentId: normalizeText(row?.assignedAgentId || row?.agent_id),
    assignedAgentEmail: normalizeLowerText(row?.assignedAgentEmail || row?.agent_email),
    participants: toArray(row?.participants).filter(participant => !participant.rsvpRevokedAt && !participant.rsvp_revoked_at
      && normalizeLowerText(participant.rsvpStatus || participant.rsvp_status) !== 'declined').map((participant) => ({
      ...participant,
      identityKey: participantIdentityKey(participant),
      normalizedRole: normalizeParticipantRole(participant?.participantRole || participant?.participant_role),
    })),
    resourceId: normalizeText(row?.resourceId || row?.resource_id),
    linkedWorkflowStage: normalizeLowerText(row?.linkedWorkflowStage || row?.linked_workflow_stage || row?.linkedTransactionStage || row?.linked_transaction_stage),
    linkedTransactionStage: normalizeLowerText(row?.linkedTransactionStage || row?.linked_transaction_stage),
  }
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA
}

function resolveBusinessHours(options = {}) {
  const source = options?.businessHours && typeof options.businessHours === 'object'
    ? options.businessHours
    : DEFAULT_BUSINESS_HOURS
  const days = Array.isArray(source.days) && source.days.length ? source.days : DEFAULT_BUSINESS_HOURS.days
  const start = parseTimeToMinutes(source.start || DEFAULT_BUSINESS_HOURS.start)
  const end = parseTimeToMinutes(source.end || DEFAULT_BUSINESS_HOURS.end)
  return {
    timezone: normalizeText(source.timezone) || DEFAULT_BUSINESS_HOURS.timezone,
    days,
    start: Number.isFinite(start) ? start : parseTimeToMinutes(DEFAULT_BUSINESS_HOURS.start),
    end: Number.isFinite(end) ? end : parseTimeToMinutes(DEFAULT_BUSINESS_HOURS.end),
  }
}

function collectIdentities(appointment = {}, requiredOnly = false) {
  const identities = new Set()
  const agentId = normalizeText(appointment?.assignedAgentId || appointment?.agent_id)
  const agentEmail = normalizeLowerText(appointment?.assignedAgentEmail || appointment?.agent_email)
  if (agentId) identities.add(`user_id:${agentId}`)
  if (agentEmail) identities.add(`email:${agentEmail}`)
  const ownerId = normalizeText(appointment.schedulingOwnerUserId || appointment.scheduling_owner_user_id)
  if (ownerId) identities.add(`user_id:${ownerId}`)
  for (const participant of toArray(appointment?.participants)) {
    if (participant.rsvpRevokedAt || participant.rsvp_revoked_at || normalizeLowerText(participant.rsvpStatus || participant.rsvp_status) === 'declined') continue
    if (requiredOnly && (participant.isRequired === false || participant.is_required === false)) continue
    const key = participantIdentityKey(participant)
    if (key) identities.add(key)
    const email = normalizeLowerText(participant.email)
    if (email) identities.add(`email:${email}`)
    const contactId = normalizeText(participant.contactId || participant.contact_id)
    if (contactId) identities.add(`contact_id:${contactId}`)
  }
  return identities
}

function appointmentWindow(appointment = {}) {
  const buffer = Math.max(0, Number(appointment?.bufferMinutes || 0))
  const startMs = appointment?.startDate?.getTime?.() || 0
  const endMs = appointment?.endDate?.getTime?.() || 0
  return {
    startMs,
    endMs,
    bufferedStartMs: startMs - (buffer * 60 * 1000),
    bufferedEndMs: endMs + (buffer * 60 * 1000),
  }
}

function buildConflictEntry({
  level = 'hard_conflict',
  type = 'overlap',
  message = '',
  appointment = null,
  metadata = {},
} = {}) {
  return {
    level,
    type,
    message,
    appointmentId: appointment?.appointmentId || null,
    appointmentType: appointment?.appointmentType || null,
    appointmentTitle: appointment?.title || null,
    startsAt: appointment?.startDate?.toISOString?.() || null,
    endsAt: appointment?.endDate?.toISOString?.() || null,
    metadata,
  }
}

function evaluateBusinessHoursConflict() {
  // Property appointments often happen after hours or over weekends. Keep business hours
  // for preferred-slot suggestions only; they should never restrict appointment creation.
  return []
}

function evaluateWorkflowOrderConflict(candidate = {}, appointments = []) {
  const conflicts = []
  const candidateStage = normalizeLowerText(candidate?.linkedWorkflowStage || candidate?.linkedTransactionStage)
  if (!candidateStage) return conflicts
  const candidateOrder = Number(WORKFLOW_STAGE_ORDER[candidateStage] || 0)
  if (!candidateOrder) return conflicts

  for (const existing of appointments) {
    if (!appointmentReservesTime(existing)) continue
    const stage = normalizeLowerText(existing?.linkedWorkflowStage || existing?.linkedTransactionStage)
    if (!stage || !WORKFLOW_STAGE_ORDER[stage]) continue
    const order = Number(WORKFLOW_STAGE_ORDER[stage] || 0)
    if (!order) continue
    if (candidateOrder < order && candidate?.startDate?.getTime?.() > existing?.startDate?.getTime?.()) {
      continue
    }
    if (candidateOrder > order && candidate?.startDate?.getTime?.() < existing?.startDate?.getTime?.()) {
      conflicts.push(
        buildConflictEntry({
          level: 'soft_conflict',
          type: 'workflow_sequence',
          message: `This appointment may be out of sequence with ${existing.title || existing.appointmentType}.`,
          appointment: existing,
          metadata: {
            candidateStage,
            existingStage: stage,
          },
        }),
      )
    }
  }
  return conflicts
}

function dedupeConflicts(conflicts = []) {
  const map = new Map()
  for (const conflict of conflicts) {
    const key = [
      normalizeText(conflict?.level),
      normalizeText(conflict?.type),
      normalizeText(conflict?.appointmentId),
      normalizeText(conflict?.message),
    ].join('|')
    if (!map.has(key)) {
      map.set(key, conflict)
    }
  }
  return [...map.values()]
}

export function checkUserConflict(userId, start, end, options = {}) {
  const normalizedUserId = normalizeText(userId)
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (!normalizedUserId || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { hasConflict: false, hardConflicts: [], softConflicts: [] }
  }

  const appointments = toArray(options?.appointments)
    .map((row) => normalizeAppointmentForConflict(row))
    .filter(Boolean)
  const candidateWindow = appointmentWindow({
    startDate,
    endDate,
    bufferMinutes: Math.max(0, Number(options?.bufferMinutes || 0)),
  })

  const hardConflicts = []
  const softConflicts = []
  for (const appointment of appointments) {
    if (!appointmentReservesTime(appointment)) continue
    if (normalizeText(appointment.appointmentId) === normalizeText(options?.excludeAppointmentId)) continue
    const identities = collectIdentities(appointment)
    if (!identities.has(`user_id:${normalizedUserId}`)) continue
    const existingWindow = appointmentWindow(appointment)
    if (overlaps(candidateWindow.startMs, candidateWindow.endMs, existingWindow.startMs, existingWindow.endMs)) {
      hardConflicts.push(
        buildConflictEntry({
          level: 'hard_conflict',
          type: 'user_overlap',
          message: 'This user is already booked at the selected time.',
          appointment,
        }),
      )
      continue
    }
    if (overlaps(candidateWindow.bufferedStartMs, candidateWindow.bufferedEndMs, existingWindow.bufferedStartMs, existingWindow.bufferedEndMs)) {
      softConflicts.push(
        buildConflictEntry({
          level: 'soft_conflict',
          type: 'user_buffer_overlap',
          message: 'This user has limited travel/buffer time between appointments.',
          appointment,
        }),
      )
    }
  }

  return {
    hasConflict: hardConflicts.length > 0 || softConflicts.length > 0,
    hardConflicts: dedupeConflicts(hardConflicts),
    softConflicts: dedupeConflicts(softConflicts),
  }
}

export function checkRoomConflict(roomId, start, end, options = {}) {
  const normalizedRoomId = normalizeText(roomId)
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (!normalizedRoomId || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { hasConflict: false, hardConflicts: [], softConflicts: [] }
  }

  const appointments = toArray(options?.appointments)
    .map((row) => normalizeAppointmentForConflict(row))
    .filter(Boolean)
  const candidateWindow = appointmentWindow({
    startDate,
    endDate,
    bufferMinutes: Math.max(0, Number(options?.bufferMinutes || 0)),
  })
  const hardConflicts = []
  const softConflicts = []

  for (const appointment of appointments) {
    if (!appointmentReservesTime(appointment)) continue
    if (normalizeText(appointment.appointmentId) === normalizeText(options?.excludeAppointmentId)) continue
    if (normalizeText(appointment.resourceId) !== normalizedRoomId) continue
    const existingWindow = appointmentWindow(appointment)
    if (overlaps(candidateWindow.startMs, candidateWindow.endMs, existingWindow.startMs, existingWindow.endMs)) {
      hardConflicts.push(
        buildConflictEntry({
          level: 'hard_conflict',
          type: 'resource_overlap',
          message: 'The selected room/resource is already booked at this time.',
          appointment,
        }),
      )
      continue
    }
    if (overlaps(candidateWindow.bufferedStartMs, candidateWindow.bufferedEndMs, existingWindow.bufferedStartMs, existingWindow.bufferedEndMs)) {
      softConflicts.push(
        buildConflictEntry({
          level: 'soft_conflict',
          type: 'resource_buffer_overlap',
          message: 'The selected room/resource has limited buffer between meetings.',
          appointment,
        }),
      )
    }
  }

  return {
    hasConflict: hardConflicts.length > 0 || softConflicts.length > 0,
    hardConflicts: dedupeConflicts(hardConflicts),
    softConflicts: dedupeConflicts(softConflicts),
  }
}

export async function getUserAvailability(userId, range = {}, options = {}) {
  const loadAppointments = options?.loadAppointments
  const appointments = Array.isArray(options?.appointments)
    ? options.appointments
    : (typeof loadAppointments === 'function'
      ? await loadAppointments(range, options)
      : [])
  const normalized = toArray(appointments)
    .map((row) => normalizeAppointmentForConflict(row))
    .filter(Boolean)
    .filter((row) => appointmentReservesTime(row))
    .filter((row) => {
      const identities = collectIdentities(row)
      return identities.has(`user_id:${normalizeText(userId)}`) || identities.has(`email:${normalizeLowerText(userId)}`)
    })
  return {
    userId: normalizeText(userId),
    busySlots: normalized.map((row) => ({
      appointmentId: row.appointmentId,
      title: row.title || row.appointmentType,
      startsAt: row.startDate.toISOString(),
      endsAt: row.endDate.toISOString(),
      status: row.status,
      resourceId: row.resourceId || null,
    })),
  }
}

export async function getParticipantAvailability(participants = [], range = {}, options = {}) {
  const loadAppointments = options?.loadAppointments
  const appointments = Array.isArray(options?.appointments)
    ? options.appointments
    : (typeof loadAppointments === 'function'
      ? await loadAppointments(range, options)
      : [])

  const normalizedAppointments = toArray(appointments)
    .map((row) => normalizeAppointmentForConflict(row))
    .filter(Boolean)
    .filter((row) => appointmentReservesTime(row))

  const participantRows = toArray(participants).map((participant) => ({
    ...participant,
    identityKey: participantIdentityKey(participant),
  }))

  const availability = participantRows.map((participant) => {
    const identity = participant.identityKey
    const busySlots = normalizedAppointments
      .filter((appointment) => {
        const identities = collectIdentities(appointment)
        return identity && identities.has(identity)
      })
      .map((appointment) => ({
        appointmentId: appointment.appointmentId,
        title: appointment.title || appointment.appointmentType,
        startsAt: appointment.startDate.toISOString(),
        endsAt: appointment.endDate.toISOString(),
        status: appointment.status,
      }))

    return {
      participant: {
        name: normalizeText(participant?.name),
        email: normalizeLowerText(participant?.email),
        role: normalizeParticipantRole(participant?.participantRole || participant?.participant_role),
      },
      busySlots,
      isAvailable: busySlots.length === 0,
    }
  })

  return availability
}

export function checkAppointmentConflicts(payload = {}, options = {}) {
  const status = normalizeLowerText(payload.status).replace(/[\s-]+/g, '_')
  if (['draft', 'cancelled', 'canceled', 'declined', 'completed', 'no_show'].includes(status)) {
    return {
      hardConflicts: [], softConflicts: [], hasHardConflicts: false, hasSoftConflicts: false,
      participantAvailability: [], suggestedSlots: [], businessHours: resolveBusinessHours(options),
    }
  }
  const candidate = normalizeAppointmentForConflict(payload)
  if (!candidate) {
    return {
      hardConflicts: [
        buildConflictEntry({
          level: 'hard_conflict',
          type: 'invalid_datetime',
          message: 'Appointment date/time is invalid.',
          metadata: { payload },
        }),
      ],
      softConflicts: [],
      hasHardConflicts: true,
      hasSoftConflicts: false,
      participantAvailability: [],
      suggestedSlots: [],
      businessHours: resolveBusinessHours(options),
    }
  }

  const existingAppointments = toArray(options?.appointments)
    .map((row) => normalizeAppointmentForConflict(row))
    .filter(Boolean)
    .filter((row) => normalizeText(row?.appointmentId) !== normalizeText(options?.excludeAppointmentId))

  const hardConflicts = []
  const softConflicts = []
  const candidateWindow = appointmentWindow(candidate)
  const candidateIdentities = collectIdentities(candidate, true)

  // Contradictory historical times need review; do not silently discard a
  // related booking and advertise its time as free for that same local day.
  const candidateDay = appointmentLocalParts(candidate.startDate, candidate.timezone).date
  for (const row of toArray(options.appointments)) {
    const id = normalizeText(row.appointmentId || row.appointment_id || row.id)
    if (id === normalizeText(options.excludeAppointmentId) || !appointmentReservesTime(row)
      || normalizeAppointmentForConflict(row)) continue
    const day = normalizeText(row.date || row.appointment_date)
    const identities = collectIdentities(row)
    const sharesPerson = [...candidateIdentities].some(identity => identities.has(identity))
    const sharesRoom = candidate.resourceId && candidate.resourceId === normalizeText(row.resourceId || row.resource_id)
    if ((!day || day === candidateDay) && (sharesPerson || sharesRoom)) {
      hardConflicts.push(buildConflictEntry({
        level: 'hard_conflict', type: 'unverified_existing_datetime',
        message: 'A related appointment has inconsistent scheduling times. Review it before booking this slot.',
      }))
    }
  }

  for (const existing of existingAppointments) {
    if (!appointmentReservesTime(existing)) continue
    const existingWindow = appointmentWindow(existing)
    const directOverlap = overlaps(candidateWindow.startMs, candidateWindow.endMs, existingWindow.startMs, existingWindow.endMs)
    const bufferedOverlap = overlaps(
      candidateWindow.bufferedStartMs,
      candidateWindow.bufferedEndMs,
      existingWindow.bufferedStartMs,
      existingWindow.bufferedEndMs,
    )

    const existingIdentities = collectIdentities(existing, true)
    const participantOverlap = [...candidateIdentities].some((identity) => existingIdentities.has(identity))
    const roleOverlap = candidate.participants.some((participant) => {
      if (participant.isRequired === false || participant.is_required === false || !participant?.normalizedRole || !CRITICAL_PARTICIPANT_ROLES.has(participant.normalizedRole)) return false
      return existing.participants.some((existingParticipant) => {
        if (existingParticipant.isRequired === false || existingParticipant.is_required === false || !existingParticipant?.normalizedRole) return false
        if (existingParticipant.normalizedRole !== participant.normalizedRole) return false
        if (participant.identityKey && existingParticipant.identityKey) {
          return participant.identityKey === existingParticipant.identityKey
        }
        return false
      })
    })

    if ((participantOverlap || roleOverlap) && directOverlap) {
      hardConflicts.push(
        buildConflictEntry({
          level: 'hard_conflict',
          type: roleOverlap ? 'critical_role_overlap' : 'participant_overlap',
          message: roleOverlap
            ? 'A critical role player is already booked at this time.'
            : 'One or more participants are already booked at this time.',
          appointment: existing,
        }),
      )
      continue
    }

    if (directOverlap && [...collectIdentities(candidate)].some(identity => collectIdentities(existing).has(identity))) {
      softConflicts.push(buildConflictEntry({ level: 'soft_conflict', type: 'optional_participant_overlap',
        message: 'An optional attendee is already booked at this time.', appointment: existing }))
    }

    if ((participantOverlap || roleOverlap) && bufferedOverlap) {
      softConflicts.push(
        buildConflictEntry({
          level: 'soft_conflict',
          type: 'participant_buffer_overlap',
          message: 'This schedule leaves limited travel/buffer time for a participant.',
          appointment: existing,
        }),
      )
    }
  }

  if (normalizeText(candidate.resourceId)) {
    const roomConflicts = checkRoomConflict(candidate.resourceId, candidate.startDate, candidate.endDate, {
      appointments: existingAppointments,
      bufferMinutes: candidate.bufferMinutes,
      excludeAppointmentId: options?.excludeAppointmentId,
    })
    hardConflicts.push(...roomConflicts.hardConflicts)
    softConflicts.push(...roomConflicts.softConflicts)
  }

  const businessHourConflicts = evaluateBusinessHoursConflict(candidate, options)
  for (const conflict of businessHourConflicts) {
    if (conflict.level === 'hard_conflict') {
      hardConflicts.push(conflict)
    } else {
      softConflicts.push(conflict)
    }
  }

  const workflowSequenceConflicts = evaluateWorkflowOrderConflict(candidate, existingAppointments)
  softConflicts.push(...workflowSequenceConflicts)

  const dedupedHard = dedupeConflicts(hardConflicts)
  const dedupedSoft = dedupeConflicts(softConflicts)
  const participantAvailability = toArray(candidate.participants).map((participant) => {
    const key = participantIdentityKey(participant)
    const isBusy = [...dedupedHard, ...dedupedSoft].some((conflict) => {
      const conflictAppointment = existingAppointments.find((item) => item.appointmentId === conflict.appointmentId)
      if (!conflictAppointment || !key) return false
      const identities = collectIdentities(conflictAppointment)
      return identities.has(key)
    })
    return {
      name: normalizeText(participant?.name),
      email: normalizeLowerText(participant?.email),
      role: normalizeParticipantRole(participant?.participantRole || participant?.participant_role),
      identityKey: key,
      isAvailable: !isBusy,
    }
  })

  const shouldSuggestSlots = options?.includeSuggestedSlots !== false && Number(options?.maxSuggestions ?? 6) > 0
  const suggestedSlots = shouldSuggestSlots
    ? getSuggestedAvailabilitySlots(payload, {
        ...options,
        appointments: existingAppointments,
        maxSuggestions: Number(options?.maxSuggestions ?? 6),
      })
    : []

  return {
    hardConflicts: dedupedHard,
    softConflicts: dedupedSoft,
    hasHardConflicts: dedupedHard.length > 0,
    hasSoftConflicts: dedupedSoft.length > 0,
    participantAvailability,
    suggestedSlots,
    businessHours: resolveBusinessHours(options),
    bufferMinutes: candidate.bufferMinutes,
  }
}

export function getSuggestedAvailabilitySlots(payload = {}, options = {}) {
  const candidate = normalizeAppointmentForConflict(payload)
  if (!candidate) return []
  const requestedMax = Number(options?.maxSuggestions ?? 6)
  if (!Number.isFinite(requestedMax) || requestedMax <= 0) return []
  const maxSuggestions = Math.max(1, requestedMax)
  const slotMinutes = Math.max(15, Number(options?.slotMinutes || getAppointmentTypeDefinition(payload?.appointmentType)?.defaultDuration || 30))
  const searchDays = Math.max(1, Number(options?.searchDays || 10))
  const businessHours = resolveBusinessHours(options)
  const existingAppointments = toArray(options?.appointments)

  const suggestions = []
  const timezone = candidate.timezone
  const startDateKey = appointmentLocalParts(candidate.startDate, timezone).date

  for (let dayOffset = 0; dayOffset < searchDays && suggestions.length < maxSuggestions; dayOffset += 1) {
    const dayKey = addAppointmentDateDays(startDateKey, dayOffset)
    if (!businessHours.days.includes(new Date(`${dayKey}T12:00:00Z`).getUTCDay())) continue

    for (let minute = businessHours.start; minute + slotMinutes <= businessHours.end && suggestions.length < maxSuggestions; minute += 15) {
      const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
      let slotStart
      try { slotStart = new Date(appointmentLocalToIso(dayKey, clock, timezone)) }
      catch { continue } // Skip missing or ambiguous civil times during clock changes.
      if (slotStart.getTime() <= Date.now() + (5 * 60 * 1000)) continue
      const slotEnd = new Date(slotStart.getTime() + (slotMinutes * 60 * 1000))

      const result = checkAppointmentConflicts(
        {
          ...payload,
          dateTime: slotStart.toISOString(),
          endDateTime: slotEnd.toISOString(),
          date: dayKey,
          startTime: appointmentLocalParts(slotStart, timezone).time,
          endTime: appointmentLocalParts(slotEnd, timezone).time,
        },
        {
          ...options,
          appointments: existingAppointments,
          includeSuggestedSlots: false,
          maxSuggestions: 0,
        },
      )

      if (!result.hasHardConflicts) {
        suggestions.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          hasSoftConflicts: result.hasSoftConflicts,
          softConflictCount: result.softConflicts.length,
          label: slotStart.toLocaleString('en-ZA', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
          }),
        })
      }
    }
  }

  return suggestions
}

export function getSuggestedRescheduleSlots(appointmentId, constraints = {}) {
  const targetAppointmentId = normalizeText(appointmentId)
  const appointments = toArray(constraints?.appointments)
  const normalizedAppointments = appointments
    .map((row) => normalizeAppointmentForConflict(row))
    .filter(Boolean)

  const currentFromList = normalizedAppointments.find(
    (row) => normalizeText(row?.appointmentId) === targetAppointmentId,
  )
  const currentCandidate = currentFromList || normalizeAppointmentForConflict(constraints?.currentAppointment || {})
  if (!currentCandidate) return []

  const payload = {
    appointmentId: currentCandidate.appointmentId,
    appointmentType: constraints?.appointmentType || currentCandidate.appointmentType,
    dateTime: currentCandidate.startDate.toISOString(),
    endDateTime: currentCandidate.endDate.toISOString(),
    timezone: currentCandidate.timezone,
    date: appointmentLocalParts(currentCandidate.startDate, currentCandidate.timezone).date,
    startTime: appointmentLocalParts(currentCandidate.startDate, currentCandidate.timezone).time,
    endTime: appointmentLocalParts(currentCandidate.endDate, currentCandidate.timezone).time,
    participants: Array.isArray(constraints?.participants)
      ? constraints.participants
      : currentCandidate.participants,
    resourceId: normalizeText(constraints?.resourceId || currentCandidate.resourceId) || null,
    linkedWorkflowStage: constraints?.linkedWorkflowStage || currentCandidate.linkedWorkflowStage || null,
    linkedTransactionStage: constraints?.linkedTransactionStage || currentCandidate.linkedTransactionStage || null,
    allowOutsideBusinessHours: constraints?.allowOutsideBusinessHours === true,
  }

  const candidateAppointments = appointments.filter(
    (row) => normalizeText(row?.appointmentId || row?.appointment_id || row?.id) !== normalizeText(currentCandidate.appointmentId),
  )

  return getSuggestedAvailabilitySlots(payload, {
    appointments: candidateAppointments,
    includeSuggestedSlots: true,
    allowOutsideBusinessHours: constraints?.allowOutsideBusinessHours === true,
    maxSuggestions: Number(constraints?.maxSuggestions ?? 6),
    slotMinutes: Number(constraints?.slotMinutes || (currentCandidate.endDate.getTime() - currentCandidate.startDate.getTime()) / (1000 * 60) || 30),
    searchDays: Number(constraints?.searchDays || 10),
    businessHours: constraints?.businessHours,
  })
}
