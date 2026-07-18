export const APPOINTMENT_RSVP_TIMEZONE = 'Africa/Johannesburg'

export const APPOINTMENT_RSVP_ACTIONS = Object.freeze({
  accept: 'accept',
  decline: 'decline',
  reschedule: 'reschedule',
})

export const APPOINTMENT_RSVP_STATUSES = Object.freeze({
  accept: 'Accepted',
  decline: 'Declined',
  reschedule: 'Proposed New Time',
})

const JOHANNESBURG_OFFSET_MINUTES = 120

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseDate(value = '') {
  const match = normalizeText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  return { year, month, day }
}

function parseTime(value = '') {
  const match = normalizeText(value).match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return { hours, minutes, totalMinutes: (hours * 60) + minutes }
}

function toIso(dateParts, timeParts) {
  if (!dateParts || !timeParts) return null
  return new Date(Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hours,
    timeParts.minutes - JOHANNESBURG_OFFSET_MINUTES,
  )).toISOString()
}

export function actionToAppointmentRsvpStatus(action = '') {
  return APPOINTMENT_RSVP_STATUSES[normalizeText(action).toLowerCase()] || ''
}

export function isCompletedAppointmentRsvp(status = '') {
  return ['accepted', 'declined', 'proposed new time'].includes(normalizeText(status).toLowerCase())
}

export function getAppointmentRsvpStatusCopy(status = '') {
  if (status === APPOINTMENT_RSVP_STATUSES.accept) return 'Thanks, your attendance has been confirmed.'
  if (status === APPOINTMENT_RSVP_STATUSES.decline) return 'Thanks, your response has been recorded.'
  if (status === APPOINTMENT_RSVP_STATUSES.reschedule) return 'Thanks, your alternative time request has been sent to the Arch9 team.'
  return 'Choose a response for this appointment request.'
}

export function buildAppointmentRsvpContract(input = {}, options = {}) {
  const errors = []
  const action = normalizeText(input.action).toLowerCase()
  const status = actionToAppointmentRsvpStatus(action)
  const message = normalizeText(input.message)
  const preferredDate = normalizeText(input.preferredDate)
  const preferredStartTime = normalizeText(input.preferredStartTime)
  const preferredEndTime = normalizeText(input.preferredEndTime)
  const dateParts = parseDate(preferredDate)
  const startParts = parseTime(preferredStartTime)
  const endParts = preferredEndTime ? parseTime(preferredEndTime) : null
  const preferredStart = toIso(dateParts, startParts)
  const preferredEnd = endParts ? toIso(dateParts, endParts) : null
  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now()

  if (!status) {
    errors.push({ field: 'action', code: 'missing_action', message: 'Choose whether to accept, decline, or request another time.' })
  }
  if (message.length > 1000) {
    errors.push({ field: 'message', code: 'message_too_long', message: 'Keep the reschedule message under 1,000 characters.' })
  }
  if (status === APPOINTMENT_RSVP_STATUSES.reschedule) {
    if (!dateParts) errors.push({ field: 'preferredDate', code: 'invalid_preferred_date', message: 'Choose a valid preferred date.' })
    if (!startParts) errors.push({ field: 'preferredStartTime', code: 'invalid_preferred_start', message: 'Choose a valid preferred start time.' })
    if (preferredStart && new Date(preferredStart).getTime() <= nowMs) {
      errors.push({ field: 'preferredDate', code: 'preferred_time_in_past', message: 'Choose a preferred time in the future.' })
    }
    if (preferredEndTime && !endParts) {
      errors.push({ field: 'preferredEndTime', code: 'invalid_preferred_end', message: 'Choose a valid preferred end time.' })
    } else if (startParts && endParts && endParts.totalMinutes <= startParts.totalMinutes) {
      errors.push({ field: 'preferredEndTime', code: 'preferred_end_before_start', message: 'Preferred end time must be after the start time.' })
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    value: {
      action,
      status,
      proposedNewTime: status === APPOINTMENT_RSVP_STATUSES.reschedule ? preferredStart : null,
      preferredEnd: status === APPOINTMENT_RSVP_STATUSES.reschedule ? preferredEnd : null,
      comment: status === APPOINTMENT_RSVP_STATUSES.reschedule ? message || null : null,
      timezone: APPOINTMENT_RSVP_TIMEZONE,
    },
  }
}
