import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { checkAppointmentSchedulingIntegrityAsync } from '../lib/agencyPipelineService'
import { getSuggestedRescheduleSlots } from '../lib/appointmentAvailabilityEngine'
import {
  cancelAppointmentReminders,
  notifyAppointmentParticipants,
  scheduleAppointmentReminders,
} from './appointmentNotificationService'
import {
  buildAppointmentRescheduleProposalContract,
  buildAppointmentRescheduleResolutionContract,
} from '../core/appointments/appointmentRescheduleContract'

const RESCHEDULE_REQUEST_STATUSES = new Set(['pending', 'proposed', 'accepted', 'rejected', 'cancelled', 'completed'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeRequestStatus(value = 'pending') {
  const normalized = normalizeLower(value)
  if (RESCHEDULE_REQUEST_STATUSES.has(normalized)) return normalized
  return 'pending'
}

function normalizeAppointmentStatusForReschedule(value = '') {
  const normalized = normalizeLower(value)
  if (normalized.includes('cancel')) return 'cancelled'
  if (normalized.includes('complete')) return 'completed'
  if (normalized.includes('declin')) return 'declined'
  return normalized || 'pending confirmation'
}

function normalizeRescheduleRequestRow(row = {}) {
  return {
    id: normalizeText(row?.id),
    appointmentId: normalizeText(row?.appointment_id),
    requestedBy: normalizeText(row?.requested_by) || null,
    requestedByRole: normalizeText(row?.requested_by_role) || null,
    reason: normalizeText(row?.reason) || null,
    preferredStart: row?.preferred_start || null,
    preferredEnd: row?.preferred_end || null,
    status: normalizeRequestStatus(row?.status),
    reviewedBy: normalizeText(row?.reviewed_by) || null,
    reviewedAt: row?.reviewed_at || null,
    suggestedSlots: Array.isArray(row?.suggested_slots) ? row.suggested_slots : [],
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function deriveDateAndTimeParts(dateTimeValue) {
  if (!dateTimeValue) return { date: '', time: '' }
  const date = new Date(dateTimeValue)
  if (Number.isNaN(date.getTime())) return { date: '', time: '' }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((accumulator, part) => {
    accumulator[part.type] = part.value
    return accumulator
  }, {})
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function buildDateTimeFromAppointment(row = {}) {
  const dateTime = normalizeText(row?.date_time)
  if (dateTime) {
    const parsed = new Date(dateTime)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  const date = normalizeText(row?.appointment_date)
  const startTime = normalizeText(row?.start_time).slice(0, 5)
  if (date && startTime) {
    const parsed = new Date(`${date}T${startTime}`)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return null
}

function computeDurationMinutes(row = {}) {
  const startDateTime = buildDateTimeFromAppointment(row)
  const date = normalizeText(row?.appointment_date)
  const endTime = normalizeText(row?.end_time).slice(0, 5)
  if (!startDateTime || !date || !endTime) return 45
  const endDate = new Date(`${date}T${endTime}`)
  const startDate = new Date(startDateTime)
  if (Number.isNaN(endDate.getTime()) || Number.isNaN(startDate.getTime())) return 45
  const minutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60))
  if (!Number.isFinite(minutes) || minutes < 15) return 45
  return minutes
}

async function fetchAppointmentById(appointmentId) {
  const scopedAppointmentId = normalizeText(appointmentId)
  const query = await supabase
    .from('appointments')
    .select('appointment_id, organisation_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, status, resource_id, allow_outside_business_hours, linked_workflow_stage, linked_transaction_stage, visibility_scope, notes')
    .eq('appointment_id', scopedAppointmentId)
    .maybeSingle()

  if (query.error) throw query.error
  return query.data || null
}

async function fetchParticipantsByAppointmentIds(appointmentIds = []) {
  const ids = [...new Set((appointmentIds || []).map((value) => normalizeText(value)).filter(Boolean))]
  if (!ids.length) return {}
  const query = await supabase
    .from('appointment_participants')
    .select('appointment_id, participant_id, name, email, participant_role, rsvp_status')
    .in('appointment_id', ids)

  if (query.error) throw query.error

  return (query.data || []).reduce((accumulator, row) => {
    const appointmentId = normalizeText(row?.appointment_id)
    if (!appointmentId) return accumulator
    if (!accumulator[appointmentId]) {
      accumulator[appointmentId] = []
    }
    accumulator[appointmentId].push({
      participantId: normalizeText(row?.participant_id),
      name: normalizeText(row?.name),
      email: normalizeText(row?.email).toLowerCase(),
      participantRole: normalizeText(row?.participant_role),
      rsvpStatus: normalizeText(row?.rsvp_status) || 'Pending',
    })
    return accumulator
  }, {})
}

async function fetchAppointmentsForTransaction(transactionId) {
  const scopedTransactionId = normalizeText(transactionId)
  if (!scopedTransactionId) return []
  const query = await supabase
    .from('appointments')
    .select('appointment_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, status, resource_id, allow_outside_business_hours, linked_workflow_stage, linked_transaction_stage, visibility_scope, notes')
    .eq('transaction_id', scopedTransactionId)
    .order('date_time', { ascending: true })

  if (query.error) throw query.error
  return Array.isArray(query.data) ? query.data : []
}

function toConflictAppointments(appointments = [], participantsMap = {}) {
  return (appointments || []).map((row) => ({
    appointmentId: normalizeText(row?.appointment_id),
    transactionId: normalizeText(row?.transaction_id),
    appointmentType: normalizeText(row?.appointment_type),
    title: normalizeText(row?.title),
    date: normalizeText(row?.appointment_date),
    startTime: normalizeText(row?.start_time).slice(0, 5),
    endTime: normalizeText(row?.end_time).slice(0, 5),
    dateTime: buildDateTimeFromAppointment(row),
    status: normalizeText(row?.status) || 'Pending Confirmation',
    resourceId: normalizeText(row?.resource_id) || null,
    allowOutsideBusinessHours: row?.allow_outside_business_hours === true,
    linkedWorkflowStage: normalizeText(row?.linked_workflow_stage) || null,
    linkedTransactionStage: normalizeText(row?.linked_transaction_stage) || null,
    participants: participantsMap[normalizeText(row?.appointment_id)] || [],
  }))
}

async function getSuggestedSlotsForRequest(appointmentRow, constraints = {}) {
  const appointments = await fetchAppointmentsForTransaction(appointmentRow?.transaction_id)
  const appointmentIds = appointments.map((row) => normalizeText(row?.appointment_id)).filter(Boolean)
  const participantLookup = appointmentIds.length
    ? await fetchParticipantsByAppointmentIds(appointmentIds)
    : {}

  const normalizedAppointments = toConflictAppointments(appointments, participantLookup)
  return getSuggestedRescheduleSlots(normalizeText(appointmentRow?.appointment_id), {
    appointments: normalizedAppointments,
    maxSuggestions: Number(constraints?.maxSuggestions || 6),
    searchDays: Number(constraints?.searchDays || 14),
    allowOutsideBusinessHours: appointmentRow?.allow_outside_business_hours === true,
  })
}

function ensureServiceReady() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment reschedule service requires a database connection.')
  }
}

async function runRescheduleNotificationTask(taskName, callback) {
  try {
    return await callback()
  } catch (error) {
    console.warn(`[appointment-reschedule][notifications] ${taskName} failed`, error)
    return null
  }
}

export async function getAppointmentRescheduleRequests({ appointmentId = '', transactionId = '', statuses = [] } = {}) {
  ensureServiceReady()
  const scopedAppointmentId = normalizeText(appointmentId)
  const scopedTransactionId = normalizeText(transactionId)

  let query = supabase
    .from('appointment_reschedule_requests')
    .select('id, appointment_id, requested_by, requested_by_role, reason, preferred_start, preferred_end, status, reviewed_by, reviewed_at, suggested_slots, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (scopedAppointmentId) {
    query = query.eq('appointment_id', scopedAppointmentId)
  } else if (scopedTransactionId) {
    const appointments = await fetchAppointmentsForTransaction(scopedTransactionId)
    const appointmentIds = appointments.map((row) => normalizeText(row?.appointment_id)).filter(Boolean)
    if (!appointmentIds.length) return []
    query = query.in('appointment_id', appointmentIds)
  }

  const normalizedStatuses = Array.isArray(statuses)
    ? statuses.map((status) => normalizeRequestStatus(status)).filter(Boolean)
    : []
  if (normalizedStatuses.length) {
    query = query.in('status', normalizedStatuses)
  }

  const result = await query
  if (result.error) {
    if (String(result.error?.code || '') === '42P01') {
      return []
    }
    throw result.error
  }

  return (Array.isArray(result.data) ? result.data : []).map((row) => normalizeRescheduleRequestRow(row))
}

export async function getSuggestedRescheduleSlotsForAppointment(appointmentId, constraints = {}) {
  ensureServiceReady()
  const appointmentRow = await fetchAppointmentById(appointmentId)
  if (!appointmentRow) {
    throw new Error('Appointment not found.')
  }
  return getSuggestedSlotsForRequest(appointmentRow, constraints)
}

export async function createAppointmentRescheduleRequest(payload = {}) {
  ensureServiceReady()

  const appointmentId = normalizeText(payload?.appointmentId)
  if (!appointmentId) {
    throw new Error('Appointment is required.')
  }

  const appointmentRow = await fetchAppointmentById(appointmentId)
  if (!appointmentRow) {
    throw new Error('Appointment not found.')
  }

  const statusKey = normalizeAppointmentStatusForReschedule(appointmentRow?.status)
  if (['cancelled', 'completed', 'declined'].includes(statusKey)) {
    throw new Error('This appointment can no longer be rescheduled.')
  }

  const preferredStart = payload?.preferredStart ? new Date(payload.preferredStart) : null
  if (!preferredStart || Number.isNaN(preferredStart.getTime())) {
    throw new Error('Please select a valid preferred date and time.')
  }

  const durationMinutes = computeDurationMinutes(appointmentRow)
  const preferredEnd = new Date(preferredStart.getTime() + (durationMinutes * 60 * 1000))
  const suggestedSlots = await getSuggestedSlotsForRequest(appointmentRow, {
    maxSuggestions: Number(payload?.maxSuggestions || 6),
    searchDays: Number(payload?.searchDays || 14),
  })

  const requestedByRole = normalizeText(payload?.requestedByRole || 'participant') || 'participant'
  const nowIso = new Date().toISOString()

  const existingPending = await supabase
    .from('appointment_reschedule_requests')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('requested_by_role', requestedByRole)
    .in('status', ['pending', 'proposed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingPending.error && String(existingPending.error?.code || '') !== '42P01') {
    throw existingPending.error
  }

  const mutationPayload = {
    appointment_id: appointmentId,
    requested_by: isUuidLike(payload?.requestedBy) ? payload.requestedBy : null,
    requested_by_role: requestedByRole,
    reason: normalizeText(payload?.reason) || null,
    preferred_start: preferredStart.toISOString(),
    preferred_end: preferredEnd.toISOString(),
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    suggested_slots: suggestedSlots,
    updated_at: nowIso,
  }

  let requestMutation = null
  if (existingPending.data?.id) {
    requestMutation = await supabase
      .from('appointment_reschedule_requests')
      .update(mutationPayload)
      .eq('id', existingPending.data.id)
      .select('id, appointment_id, requested_by, requested_by_role, reason, preferred_start, preferred_end, status, reviewed_by, reviewed_at, suggested_slots, created_at, updated_at')
      .single()
  } else {
    requestMutation = await supabase
      .from('appointment_reschedule_requests')
      .insert({
        ...mutationPayload,
        created_at: nowIso,
      })
      .select('id, appointment_id, requested_by, requested_by_role, reason, preferred_start, preferred_end, status, reviewed_by, reviewed_at, suggested_slots, created_at, updated_at')
      .single()
  }

  if (requestMutation.error) {
    throw requestMutation.error
  }

  await supabase
    .from('appointments')
    .update({
      status: 'Reschedule Requested',
      updated_at: nowIso,
    })
    .eq('appointment_id', appointmentId)

  await runRescheduleNotificationTask('reschedule_requested', async () => {
    await notifyAppointmentParticipants(appointmentId, 'appointment_reschedule_requested', {
      visibility: appointmentRow?.visibility_scope || 'shared_role_players',
      metadata: {
        reason: normalizeText(payload?.reason),
        preferredStart: preferredStart.toISOString(),
        preferredEnd: preferredEnd.toISOString(),
      },
    })
  })

  return normalizeRescheduleRequestRow(requestMutation.data || {})
}

export async function proposeAppointmentReschedule(requestId, payload = {}) {
  ensureServiceReady()
  const scopedRequestId = normalizeText(requestId)
  if (!scopedRequestId) throw new Error('Reschedule request is required.')

  const requestRowQuery = await supabase
    .from('appointment_reschedule_requests')
    .select('id, appointment_id, requested_by, requested_by_role, reason, preferred_start, preferred_end, status, reviewed_by, reviewed_at, suggested_slots, created_at, updated_at')
    .eq('id', scopedRequestId)
    .single()
  if (requestRowQuery.error) throw requestRowQuery.error

  const appointmentRow = await fetchAppointmentById(requestRowQuery.data?.appointment_id)
  if (!appointmentRow) throw new Error('Linked appointment could not be loaded.')

  const durationMinutes = computeDurationMinutes(appointmentRow)
  const preferredStart = payload?.preferredStart ? new Date(payload.preferredStart) : null
  const proposedEnd = payload?.preferredEnd
    ? new Date(payload.preferredEnd)
    : preferredStart && !Number.isNaN(preferredStart.getTime())
      ? new Date(preferredStart.getTime() + (durationMinutes * 60 * 1000))
      : null
  const proposal = buildAppointmentRescheduleProposalContract({
    preferredStart,
    preferredEnd: proposedEnd,
    reason: payload?.reason,
    suggestedSlots: payload?.suggestedSlots,
  })
  if (!proposal.isValid) {
    throw new Error(proposal.errors[0]?.message || 'Please provide a valid proposed appointment time.')
  }
  const proposalStartParts = deriveDateAndTimeParts(proposal.value.preferredStart)
  const proposalEndParts = deriveDateAndTimeParts(proposal.value.preferredEnd)

  const integrity = await checkAppointmentSchedulingIntegrityAsync(
    appointmentRow.organisation_id,
    {
      appointmentId: appointmentRow.appointment_id,
      appointmentType: appointmentRow.appointment_type,
      date: proposalStartParts.date,
      startTime: proposalStartParts.time,
      endTime: proposalEndParts.time,
      dateTime: proposal.value.preferredStart,
      transactionId: appointmentRow.transaction_id,
      resourceId: appointmentRow.resource_id || null,
      allowOutsideBusinessHours: appointmentRow.allow_outside_business_hours === true,
      linkedWorkflowStage: appointmentRow.linked_workflow_stage || null,
      linkedTransactionStage: appointmentRow.linked_transaction_stage || null,
      participants: [],
    },
    {
      excludeAppointmentId: appointmentRow.appointment_id,
      allowOutsideBusinessHours: appointmentRow.allow_outside_business_hours === true,
      maxSuggestions: 5,
    },
  )

  if (integrity?.hasHardConflicts) {
    const error = new Error('Proposed slot has hard scheduling conflicts.')
    error.code = 'APPOINTMENT_HARD_CONFLICT'
    error.schedulingConflicts = integrity
    throw error
  }

  const mutation = await supabase.rpc('propose_attorney_appointment_reschedule', {
    p_request_id: scopedRequestId,
    p_preferred_start: proposal.value.preferredStart,
    p_preferred_end: proposal.value.preferredEnd,
    p_reason: proposal.value.reason,
    p_suggested_slots: proposal.value.suggestedSlots.length
      ? proposal.value.suggestedSlots
      : (integrity?.suggestedSlots || []),
  })
  if (mutation.error) throw mutation.error
  const result = Array.isArray(mutation.data) ? mutation.data[0] : null
  if (!result?.request_id) throw new Error('Reschedule proposal could not be saved.')

  await runRescheduleNotificationTask('reschedule_proposed', async () => {
    await notifyAppointmentParticipants(appointmentRow.appointment_id, 'appointment_reschedule_proposed', {
      visibility: appointmentRow?.visibility_scope || 'shared_role_players',
      metadata: {
        preferredStart: proposal.value.preferredStart,
        preferredEnd: proposal.value.preferredEnd,
        reason: proposal.value.reason || normalizeText(requestRowQuery.data?.reason),
        requestId: scopedRequestId,
        source: 'attorney_calendar_phase5',
      },
    })
  })

  return normalizeRescheduleRequestRow({
    ...requestRowQuery.data,
    id: result.request_id,
    appointment_id: result.appointment_id,
    status: result.request_status,
    preferred_start: result.preferred_start,
    preferred_end: result.preferred_end,
    reviewed_at: result.reviewed_at,
  })
}

export async function resolveAppointmentRescheduleRequest(requestId, payload = {}) {
  ensureServiceReady()
  const scopedRequestId = normalizeText(requestId)
  if (!scopedRequestId) throw new Error('Reschedule request is required.')

  const resolution = buildAppointmentRescheduleResolutionContract(payload)
  if (!resolution.isValid) {
    throw new Error(resolution.errors[0]?.message || 'Invalid reschedule resolution.')
  }
  const decision = resolution.value.decision

  const requestQuery = await supabase
    .from('appointment_reschedule_requests')
    .select('id, appointment_id, requested_by, requested_by_role, reason, preferred_start, preferred_end, status, reviewed_by, reviewed_at, suggested_slots, created_at, updated_at')
    .eq('id', scopedRequestId)
    .single()
  if (requestQuery.error) throw requestQuery.error

  const appointmentRow = await fetchAppointmentById(requestQuery.data?.appointment_id)
  if (!appointmentRow) throw new Error('Linked appointment could not be loaded.')

  let confirmedStart = resolution.value.confirmedStart
  let confirmedEnd = resolution.value.confirmedEnd
  if (decision === 'accepted' && normalizeRequestStatus(requestQuery.data?.status) !== 'accepted') {
    const preferredStartIso = confirmedStart || requestQuery.data?.preferred_start
    const preferredStartDate = preferredStartIso ? new Date(preferredStartIso) : null
    if (!preferredStartDate || Number.isNaN(preferredStartDate.getTime())) {
      throw new Error('Accepted reschedule requests require a valid appointment time.')
    }

    const durationMinutes = computeDurationMinutes(appointmentRow)
    const preferredEndDate = confirmedEnd
      ? new Date(confirmedEnd)
      : requestQuery.data?.preferred_end
        ? new Date(requestQuery.data.preferred_end)
        : new Date(preferredStartDate.getTime() + (durationMinutes * 60 * 1000))
    const confirmed = buildAppointmentRescheduleResolutionContract({
      ...resolution.value,
      confirmedStart: preferredStartDate,
      confirmedEnd: preferredEndDate,
    })
    if (!confirmed.isValid) {
      throw new Error(confirmed.errors[0]?.message || 'Accepted reschedule requires a valid future slot.')
    }
    confirmedStart = confirmed.value.confirmedStart
    confirmedEnd = confirmed.value.confirmedEnd
    const partsStart = deriveDateAndTimeParts(preferredStartDate.toISOString())
    const partsEnd = deriveDateAndTimeParts(preferredEndDate.toISOString())

    const integrity = await checkAppointmentSchedulingIntegrityAsync(
      appointmentRow.organisation_id,
      {
        appointmentId: appointmentRow.appointment_id,
        appointmentType: appointmentRow.appointment_type,
        date: partsStart.date,
        startTime: partsStart.time,
        endTime: partsEnd.time,
        dateTime: preferredStartDate.toISOString(),
        transactionId: appointmentRow.transaction_id,
        resourceId: appointmentRow.resource_id || null,
        allowOutsideBusinessHours: appointmentRow.allow_outside_business_hours === true,
        linkedWorkflowStage: appointmentRow.linked_workflow_stage || null,
        linkedTransactionStage: appointmentRow.linked_transaction_stage || null,
      },
      {
        excludeAppointmentId: appointmentRow.appointment_id,
        allowOutsideBusinessHours: appointmentRow.allow_outside_business_hours === true,
        maxSuggestions: 5,
      },
    )

    if (integrity?.hasHardConflicts) {
      const error = new Error('Confirmed reschedule slot has hard scheduling conflicts.')
      error.code = 'APPOINTMENT_HARD_CONFLICT'
      error.schedulingConflicts = integrity
      throw error
    }

  }

  const mutation = await supabase.rpc('resolve_attorney_appointment_reschedule', {
    p_request_id: scopedRequestId,
    p_decision: decision,
    p_confirmed_start: confirmedStart,
    p_confirmed_end: confirmedEnd,
    p_reason: resolution.value.reason,
  })
  if (mutation.error) throw mutation.error
  const result = Array.isArray(mutation.data) ? mutation.data[0] : null
  if (!result?.request_id) throw new Error('Reschedule resolution could not be saved.')

  await runRescheduleNotificationTask(`reschedule_${decision}`, async () => {
    const eventType = decision === 'accepted' ? 'appointment_rescheduled' : 'appointment_reschedule_rejected'
    await notifyAppointmentParticipants(appointmentRow.appointment_id, eventType, {
      visibility: appointmentRow?.visibility_scope || 'shared_role_players',
      metadata: {
        requestId: scopedRequestId,
        resolution: decision,
        confirmedStart: result.confirmed_start,
        confirmedEnd: result.confirmed_end,
        reason: resolution.value.reason || normalizeText(requestQuery.data?.reason),
        source: 'attorney_calendar_phase5',
      },
    })
    if (decision === 'accepted') {
      await cancelAppointmentReminders(appointmentRow.appointment_id)
      await scheduleAppointmentReminders(appointmentRow.appointment_id)
    }
  })

  return normalizeRescheduleRequestRow({
    ...requestQuery.data,
    id: result.request_id,
    appointment_id: result.appointment_id,
    status: result.request_status,
    reviewed_at: result.reviewed_at,
  })
}
