export const APPOINTMENT_TIMEZONE = 'Africa/Johannesburg'
const DAY_MS = 86400000
const formatters = new Map()
const text = value => String(value ?? '').trim()
const clockText = value => value.endsWith(':00') ? value.slice(0, 5) : value

function timeError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function formatter(timezone) {
  if (!formatters.has(timezone)) {
    try {
      const value = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
      formatters.set(timezone, value)
    } catch {
      throw timeError('APPOINTMENT_INVALID_TIMEZONE', 'Choose a valid appointment timezone.')
    }
  }
  return formatters.get(timezone)
}

export function appointmentLocalParts(instant, timezone = APPOINTMENT_TIMEZONE) {
  const date = new Date(instant)
  if (!Number.isFinite(date.getTime())) throw timeError('APPOINTMENT_INVALID_TIME', 'Choose a valid appointment date and time.')
  const parts = Object.fromEntries(formatter(timezone).formatToParts(date).map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` }
}

function parseWallTime(date, time) {
  const value = `${text(date)}T${text(time)}`
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) throw timeError('APPOINTMENT_INVALID_TIME', 'Choose a valid appointment date and time.')
  const [year, month, day, hour, minute, second] = match.slice(1).map(part => Number(part || 0))
  const parsed = new Date(0)
  parsed.setUTCFullYear(year, month - 1, day)
  parsed.setUTCHours(hour, minute, Number(second), 0)
  if (year < 1000 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day || hour > 23 || minute > 59 || Number(second) > 59) {
    throw timeError('APPOINTMENT_INVALID_TIME', 'Choose a valid appointment date and time.')
  }
  return parsed.getTime()
}

// A named timezone can have zero, one or two instants for a civil clock value.
// Check offsets on both sides of a clock change rather than using the host TZ.
export function appointmentLocalToIso(date, time, timezone = APPOINTMENT_TIMEZONE, explicitInstant = '') {
  const wall = parseWallTime(date, time)
  formatter(timezone)
  const offsets = new Set([-36, 0, 36].map(hours => {
    const probe = wall + hours * 3600000
    const parts = appointmentLocalParts(probe, timezone)
    return parseWallTime(parts.date, parts.time) - probe
  }))
  const candidates = [...offsets].map(offset => wall - offset).filter(instant => {
    const parts = appointmentLocalParts(instant, timezone)
    return parseWallTime(parts.date, parts.time) === wall
  })
  if (!candidates.length) throw timeError('APPOINTMENT_NONEXISTENT_TIME', 'That clock time does not exist in the selected timezone. Choose another time.')
  if (candidates.length > 1) {
    const explicit = parseAppointmentInstant(explicitInstant, timezone)
    if (!explicit || !candidates.includes(Date.parse(explicit))) {
      throw timeError('APPOINTMENT_AMBIGUOUS_TIME', 'That clock time occurs twice in the selected timezone. Choose an explicit time with a UTC offset.')
    }
    return explicit
  }
  return new Date(candidates[0]).toISOString()
}

export function parseAppointmentInstant(value, timezone = APPOINTMENT_TIMEZONE) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const raw = text(value)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw)) {
    return appointmentLocalToIso(raw.slice(0, 10), raw.slice(11), timezone)
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return null
  // Date.parse rolls impossible dates such as 30 February into another month.
  parseWallTime(raw.slice(0, 10), raw.slice(11, 19).replace(/(?:Z|[+-].*)$/, ''))
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

export function addAppointmentDateDays(date, days) {
  const midnight = parseWallTime(date, '00:00')
  return new Date(midnight + days * DAY_MS).toISOString().slice(0, 10)
}

// Readers preserve explicit instants and flag contradictory historical fields.
// Writers use strict validation; closing an old booking can use a tolerant read.
export function resolveAppointmentSchedule(row = {}, { defaultDurationMinutes = 45, strict = true } = {}) {
  const timezone = text(row.timezone || row.appointment_timezone || row.timeZone) || APPOINTMENT_TIMEZONE
  const rawStart = row.dateTime || row.date_time || row.startsAt || row.starts_at || row.startDateTime || row.start_date_time
  const rawEnd = row.endDateTime || row.end_date_time
  const allDay = row.allDay === true || row.all_day === true
  let date = text(row.date || row.appointmentDate || row.appointment_date)
  let startTime = text(row.startTime || row.start_time)
  let endTime = text(row.endTime || row.end_time)
  let start = null
  let end = null
  try {
    // Capture valid stored instants before validating local display fields so
    // a tolerant historical read or closure never replaces them with NULL.
    start = parseAppointmentInstant(rawStart, timezone)
    end = parseAppointmentInstant(rawEnd, timezone)
    formatter(timezone)
    const suppliedDuration = row.durationMinutes ?? row.duration_minutes
    if (suppliedDuration != null && (!Number.isFinite(Number(suppliedDuration)) || Number(suppliedDuration) <= 0)) {
      throw timeError('APPOINTMENT_INVALID_DURATION', 'Appointment duration must be greater than zero.')
    }
    if (rawStart && !start) throw timeError('APPOINTMENT_INVALID_TIME', 'Choose a valid appointment start time.')
    const savedParts = start ? appointmentLocalParts(start, timezone) : null
    date ||= savedParts?.date || ''
    startTime ||= savedParts?.time || ''
    if (allDay) { startTime = '00:00'; endTime = '23:59' }
    const wallStart = appointmentLocalToIso(date, startTime, timezone, start)
    let mismatch = start && Math.abs(Date.parse(start) - Date.parse(wallStart)) >= 1000
    if (mismatch && strict) throw timeError('APPOINTMENT_TIME_MISMATCH', 'The appointment date, clock time and saved timestamp disagree. Review the time before saving.')
    start ||= wallStart
    if (rawEnd && !end) throw timeError('APPOINTMENT_INVALID_TIME', 'Choose a valid appointment end time.')
    if (allDay) {
      end = appointmentLocalToIso(addAppointmentDateDays(date, 1), '00:00', timezone)
    } else if (endTime) {
      const wallEnd = appointmentLocalToIso(date, endTime, timezone, end)
      const endMismatch = end && Math.abs(Date.parse(end) - Date.parse(wallEnd)) >= 1000
      if (endMismatch && strict) throw timeError('APPOINTMENT_TIME_MISMATCH', 'The appointment end time and saved timestamp disagree.')
      mismatch ||= endMismatch
      end ||= wallEnd
    } else if (!end) {
      const duration = Number(row.durationMinutes ?? row.duration_minutes ?? defaultDurationMinutes)
      if (!Number.isFinite(duration) || duration <= 0) throw timeError('APPOINTMENT_INVALID_DURATION', 'Appointment duration must be greater than zero.')
      end = new Date(Date.parse(start) + duration * 60000).toISOString()
    }
    if (Date.parse(end) <= Date.parse(start)) throw timeError('APPOINTMENT_INVALID_DURATION', 'Appointment end time must be after the start time.')
    const endParts = appointmentLocalParts(end, timezone)
    if (!allDay && endParts.date !== date) throw timeError('APPOINTMENT_INVALID_DURATION', 'Timed appointments must end on the selected day. Choose an earlier time or an all-day appointment.')
    return {
      date, startTime: clockText(startTime), endTime: allDay ? '23:59' : clockText(endTime || endParts.time),
      dateTime: start, endDateTime: end, timezone, allDay,
      schedulingTimeIssue: mismatch ? 'APPOINTMENT_TIME_MISMATCH' : null,
    }
  } catch (error) {
    if (strict) throw error
    return { date, startTime, endTime, dateTime: start, endDateTime: end, timezone, allDay, schedulingTimeIssue: error.code || 'APPOINTMENT_INVALID_TIME' }
  }
}

// Date/clock edits supersede inherited instants; timestamp-only edits supersede
// inherited clock fields. Explicitly supplied contradictory values are rejected.
export function mergeAppointmentSchedule(current = {}, changes = {}) {
  const merged = { ...current, ...changes }
  const changed = key => Object.hasOwn(changes, key) && changes[key] !== current[key]
  const previousDuration = Date.parse(current.endDateTime) - Date.parse(current.dateTime)
  const keepDuration = !Object.hasOwn(changes, 'endTime') && !Object.hasOwn(changes, 'endDateTime')
    && Number.isFinite(previousDuration) && previousDuration > 0 && !current.allDay && !merged.allDay
  if (['date', 'startTime', 'timezone', 'allDay'].some(changed)) {
    if (!Object.hasOwn(changes, 'dateTime')) merged.dateTime = null
    if (!Object.hasOwn(changes, 'endDateTime')) merged.endDateTime = null
  } else if (changed('dateTime')) {
    if (!Object.hasOwn(changes, 'date')) merged.date = null
    if (!Object.hasOwn(changes, 'startTime')) merged.startTime = null
    // Keep a clock end only when the caller supplies one for the new start.
    if (!Object.hasOwn(changes, 'endTime')) merged.endTime = null
    if (!Object.hasOwn(changes, 'endDateTime')) merged.endDateTime = null
  }
  if (changed('endTime') && !Object.hasOwn(changes, 'endDateTime')) merged.endDateTime = null
  if (changed('durationMinutes') && !Object.hasOwn(changes, 'endTime') && !Object.hasOwn(changes, 'endDateTime')) {
    merged.endTime = null
    merged.endDateTime = null
  }
  if (keepDuration && !Object.hasOwn(changes, 'durationMinutes') && (changed('startTime') || changed('dateTime'))) {
    const timezone = merged.timezone || APPOINTMENT_TIMEZONE
    const start = parseAppointmentInstant(merged.dateTime, timezone)
      || appointmentLocalToIso(merged.date, merged.startTime, timezone)
    merged.endDateTime = new Date(Date.parse(start) + previousDuration).toISOString()
    merged.endTime = appointmentLocalParts(merged.endDateTime, timezone).time
  }
  return merged
}
