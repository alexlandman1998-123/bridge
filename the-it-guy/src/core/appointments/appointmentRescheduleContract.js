export const APPOINTMENT_RESCHEDULE_TIMEZONE = 'Africa/Johannesburg'

export const APPOINTMENT_RESCHEDULE_DECISIONS = Object.freeze({
  accept: 'accepted',
  reject: 'rejected',
  cancel: 'cancelled',
})

const FINAL_DECISIONS = new Set(Object.values(APPOINTMENT_RESCHEDULE_DECISIONS))

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeDateTime(value) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function getJohannesburgDateKey(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APPOINTMENT_RESCHEDULE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export function normalizeAppointmentRescheduleDecision(input = {}) {
  const value = typeof input === 'string' ? input : (input?.decision || input?.status)
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'approve' || normalized === 'accepted' || normalized === 'accept') return 'accepted'
  if (normalized === 'decline' || normalized === 'declined' || normalized === 'reject' || normalized === 'rejected') return 'rejected'
  if (normalized === 'cancel' || normalized === 'cancelled' || normalized === 'canceled') return 'cancelled'
  return ''
}

export function buildAppointmentRescheduleProposalContract(input = {}, options = {}) {
  const errors = []
  const preferredStart = normalizeDateTime(input?.preferredStart)
  const preferredEnd = normalizeDateTime(input?.preferredEnd)
  const reason = normalizeText(input?.reason)
  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now()

  if (!preferredStart) {
    errors.push({ field: 'preferredStart', code: 'invalid_start', message: 'Choose a valid proposed start time.' })
  } else if (new Date(preferredStart).getTime() <= nowMs) {
    errors.push({ field: 'preferredStart', code: 'start_in_past', message: 'Choose a proposed time in the future.' })
  }
  if (input?.preferredEnd && !preferredEnd) {
    errors.push({ field: 'preferredEnd', code: 'invalid_end', message: 'Choose a valid proposed end time.' })
  } else if (preferredStart && preferredEnd && new Date(preferredEnd).getTime() <= new Date(preferredStart).getTime()) {
    errors.push({ field: 'preferredEnd', code: 'end_before_start', message: 'Proposed end time must be after the start time.' })
  } else if (preferredStart && preferredEnd && getJohannesburgDateKey(preferredStart) !== getJohannesburgDateKey(preferredEnd)) {
    errors.push({ field: 'preferredEnd', code: 'different_day', message: 'Proposed start and end times must be on the same Johannesburg day.' })
  }
  if (reason.length > 1000) {
    errors.push({ field: 'reason', code: 'reason_too_long', message: 'Keep the coordination note under 1,000 characters.' })
  }

  return {
    isValid: errors.length === 0,
    errors,
    value: {
      preferredStart,
      preferredEnd,
      reason: reason || null,
      suggestedSlots: Array.isArray(input?.suggestedSlots) ? input.suggestedSlots : [],
      timezone: APPOINTMENT_RESCHEDULE_TIMEZONE,
    },
  }
}

export function buildAppointmentRescheduleResolutionContract(input = {}, options = {}) {
  const decision = normalizeAppointmentRescheduleDecision(input)
  const errors = []
  const reason = normalizeText(input?.reason)
  const confirmedStart = normalizeDateTime(input?.confirmedStart)
  const confirmedEnd = normalizeDateTime(input?.confirmedEnd)
  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now()

  if (!FINAL_DECISIONS.has(decision)) {
    errors.push({ field: 'decision', code: 'invalid_decision', message: 'Choose whether to approve, decline, or cancel the request.' })
  }
  if (decision === 'accepted' && input?.confirmedStart && !confirmedStart) {
    errors.push({ field: 'confirmedStart', code: 'invalid_start', message: 'Choose a valid confirmed start time.' })
  } else if (decision === 'accepted' && confirmedStart && new Date(confirmedStart).getTime() <= nowMs) {
    errors.push({ field: 'confirmedStart', code: 'start_in_past', message: 'The confirmed time must be in the future.' })
  }
  if (decision === 'accepted' && input?.confirmedEnd && !confirmedEnd) {
    errors.push({ field: 'confirmedEnd', code: 'invalid_end', message: 'Choose a valid confirmed end time.' })
  } else if (decision === 'accepted' && confirmedStart && confirmedEnd && new Date(confirmedEnd).getTime() <= new Date(confirmedStart).getTime()) {
    errors.push({ field: 'confirmedEnd', code: 'end_before_start', message: 'Confirmed end time must be after the start time.' })
  } else if (decision === 'accepted' && confirmedStart && confirmedEnd && getJohannesburgDateKey(confirmedStart) !== getJohannesburgDateKey(confirmedEnd)) {
    errors.push({ field: 'confirmedEnd', code: 'different_day', message: 'Confirmed start and end times must be on the same Johannesburg day.' })
  }
  if (reason.length > 1000) {
    errors.push({ field: 'reason', code: 'reason_too_long', message: 'Keep the resolution note under 1,000 characters.' })
  }

  return {
    isValid: errors.length === 0,
    errors,
    value: {
      decision,
      confirmedStart,
      confirmedEnd,
      reason: reason || null,
      timezone: APPOINTMENT_RESCHEDULE_TIMEZONE,
    },
  }
}
