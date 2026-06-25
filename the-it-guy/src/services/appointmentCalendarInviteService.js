import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getAppointmentTemplateInstructions, getAppointmentTypeTemplate } from './appointmentTemplateService'

const DEFAULT_TIMEZONE = 'Africa/Johannesburg'
const DEFAULT_DURATION_MINUTES = 45

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function toLower(value = '') {
  return toText(value).toLowerCase()
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(toText(value))
}

function isMissingTableError(error, tableName = '') {
  const message = String(error?.message || error?.details || '').toLowerCase()
  return error?.code === '42P01' || (tableName ? message.includes(tableName.toLowerCase()) : false)
}

function isMissingColumnError(error, columnName = '') {
  const message = String(error?.message || error?.details || '').toLowerCase()
  return error?.code === '42703' || (columnName ? message.includes(columnName.toLowerCase()) : false)
}

function getEffectiveTimezone(appointment = {}) {
  return toText(appointment?.timezone || appointment?.appointment_timezone || appointment?.timeZone, DEFAULT_TIMEZONE)
}

function resolveStartDate(appointment = {}) {
  const explicit = toText(appointment?.dateTime || appointment?.date_time || appointment?.startDateTime || appointment?.start_date_time)
  if (explicit) {
    const parsed = new Date(explicit)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const date = toText(appointment?.date || appointment?.appointment_date)
  const start = toText(appointment?.startTime || appointment?.start_time).slice(0, 5)
  if (date && start) {
    const parsed = new Date(`${date}T${start}`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return null
}

function resolveEndDate(appointment = {}, startDate = null) {
  const explicit = toText(appointment?.endDateTime || appointment?.end_date_time)
  if (explicit) {
    const parsed = new Date(explicit)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const date = toText(appointment?.date || appointment?.appointment_date)
  const end = toText(appointment?.endTime || appointment?.end_time).slice(0, 5)
  if (date && end) {
    const parsed = new Date(`${date}T${end}`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const start = startDate instanceof Date ? startDate : resolveStartDate(appointment)
  if (!start || Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000)
}

function formatIcsDateTimeInTimezone(date, timeZone = DEFAULT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
    accumulator[part.type] = part.value
    return accumulator
  }, {})

  const year = parts.year || '1970'
  const month = parts.month || '01'
  const day = parts.day || '01'
  const hour = parts.hour || '00'
  const minute = parts.minute || '00'
  const second = parts.second || '00'
  return `${year}${month}${day}T${hour}${minute}${second}`
}

function formatIcsUtc(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  const second = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}T${hour}${minute}${second}Z`
}

function escapeIcsText(value = '') {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function sanitizeFileName(value = '') {
  return toText(value || 'appointment-invite')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'appointment-invite'
}

function resolveAudienceLabel(appointment = {}) {
  const visibility = toLower(appointment?.visibility || appointment?.visibility_scope)
  if (visibility === 'internal_only') return 'Internal coordination appointment.'
  if (visibility === 'shared_role_players') return 'Role-player coordination appointment.'
  return 'Client-facing transaction appointment.'
}

function getParticipants(appointment = {}) {
  return Array.isArray(appointment?.participants)
    ? appointment.participants
    : Array.isArray(appointment?.attendeesDetailed)
      ? appointment.attendeesDetailed
      : []
}

function getParticipantLabel(participant = {}) {
  const name = toText(participant?.name || participant?.fullName || participant?.participant_name, 'Participant')
  const role = toText(participant?.participantRole || participant?.role || participant?.participant_role)
  return role ? `${name} (${role})` : name
}

function getAppointmentUid(appointment = {}) {
  const explicit = toText(appointment?.calendarEventUid || appointment?.calendar_event_uid)
  if (explicit) return explicit
  const appointmentId = toText(appointment?.appointmentId || appointment?.appointment_id || appointment?.id)
  return appointmentId ? `bridge-${appointmentId}@bridge.app` : `bridge-${Date.now()}@bridge.app`
}

export function getAppointmentCalendarTitle(appointment = {}) {
  const template = getAppointmentTypeTemplate(appointment?.appointmentType || appointment?.appointment_type)
  const templateTitle = toText(appointment?.calendarTitle || appointment?.calendar_title || template?.calendarTitle)
  const appointmentTypeLabel = toText(
    appointment?.title ||
    appointment?.appointmentTitle ||
    appointment?.appointmentTypeLabel ||
    templateTitle ||
    template?.label ||
    appointment?.appointmentType ||
    appointment?.appointment_type,
    'Appointment',
  )
  return appointmentTypeLabel.toLowerCase().startsWith('bridge:')
    ? appointmentTypeLabel
    : `Arch9: ${appointmentTypeLabel}`
}

export function getAppointmentCalendarLocation(appointment = {}) {
  return toText(appointment?.location || appointment?.meetingLocation || appointment?.meeting_link || 'To be confirmed')
}

export function getAppointmentCalendarDescription(appointment = {}) {
  const template = getAppointmentTypeTemplate(appointment?.appointmentType || appointment?.appointment_type)
  const participants = getParticipants(appointment)
  const participantLine = participants.length
    ? participants.map((participant) => getParticipantLabel(participant)).join(', ')
    : 'Participants to be confirmed'

  const instructions = toText(
    appointment?.instructions
    || appointment?.appointment_instructions
    || appointment?.calendarDescription
    || appointment?.calendar_description
    || getAppointmentTemplateInstructions(template?.type || 'viewing', 'buyer')
    || 'Please bring your ID document and any requested supporting documents.',
  )
  const transactionReference = toText(appointment?.transactionReference || appointment?.transaction_reference || appointment?.matterReference)
  const portalLink = toText(appointment?.portalLink || appointment?.clientPortalLink || appointment?.client_portal_link)
  const status = toText(appointment?.status)
  const requiredPrep = Array.isArray(appointment?.requiredDocuments || appointment?.required_documents)
    ? (appointment?.requiredDocuments || appointment?.required_documents)
    : (Array.isArray(template?.requiredBeforeAppointment) ? template.requiredBeforeAppointment : [])
  const prepLine = requiredPrep.length
    ? requiredPrep
      .map((item) => (typeof item === 'string' ? item : (item?.label || item?.key)))
      .filter(Boolean)
      .join(', ')
    : ''

  const lines = [
    'This appointment is part of your Arch9 property transaction.',
    resolveAudienceLabel(appointment),
    transactionReference ? `Transaction reference: ${transactionReference}` : '',
    status ? `Status: ${status}` : '',
    prepLine ? `Required before appointment: ${prepLine}` : '',
    `Participants: ${participantLine}`,
    `Instructions: ${instructions}`,
    portalLink ? `Portal: ${portalLink}` : '',
    'Need help? Contact your Arch9 transaction team.',
  ].filter(Boolean)

  return lines.join('\n')
}

export function buildAppointmentICSPayload(appointment = {}, options = {}) {
  const start = resolveStartDate(appointment)
  const end = resolveEndDate(appointment, start)

  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
    throw new Error('Calendar invite could not be generated because the appointment date/time is invalid.')
  }

  const timeZone = toText(options?.timeZone || options?.timezone || getEffectiveTimezone(appointment), DEFAULT_TIMEZONE)
  const participants = getParticipants(appointment)
  const organizerName = toText(appointment?.organizerName || appointment?.assignedAgentName || appointment?.agentName || 'Arch9')
  const organizerEmail = toText(appointment?.organizerEmail || appointment?.assignedAgentEmail || appointment?.agentEmail)
  const uid = getAppointmentUid(appointment)
  const title = getAppointmentCalendarTitle(appointment)
  const description = getAppointmentCalendarDescription(appointment)
  const location = getAppointmentCalendarLocation(appointment)
  const method = toLower(appointment?.status).includes('cancel') ? 'CANCEL' : 'REQUEST'

  return {
    uid,
    method,
    status: toLower(appointment?.status).includes('cancel') ? 'CANCELLED' : 'CONFIRMED',
    title,
    description,
    location,
    start,
    end,
    timeZone,
    attendees: participants
      .map((participant) => ({
        name: toText(participant?.name || participant?.participant_name),
        email: toText(participant?.email || participant?.participant_email).toLowerCase(),
        role: toText(participant?.participantRole || participant?.participant_role),
      }))
      .filter((attendee) => attendee.email),
    organizer: organizerEmail ? { name: organizerName, email: organizerEmail.toLowerCase() } : null,
    appointmentUrl: toText(appointment?.appointmentUrl || appointment?.actionHref || appointment?.portalLink || appointment?.clientPortalLink),
    transactionReference: toText(appointment?.transactionReference || appointment?.transaction_reference || appointment?.matterReference),
    sequence: Number(appointment?.calendarSequence || appointment?.calendar_sequence || 0) || 0,
  }
}

function renderIcsContent(payload = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Arch9//Appointments//EN',
    `METHOD:${payload.method || 'REQUEST'}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(payload.uid || `bridge-${Date.now()}@bridge.app`)}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART;TZID=${escapeIcsText(payload.timeZone || DEFAULT_TIMEZONE)}:${formatIcsDateTimeInTimezone(payload.start, payload.timeZone || DEFAULT_TIMEZONE)}`,
    `DTEND;TZID=${escapeIcsText(payload.timeZone || DEFAULT_TIMEZONE)}:${formatIcsDateTimeInTimezone(payload.end, payload.timeZone || DEFAULT_TIMEZONE)}`,
    `SUMMARY:${escapeIcsText(payload.title || 'Arch9 Appointment')}`,
    `DESCRIPTION:${escapeIcsText(payload.description || '')}`,
    `LOCATION:${escapeIcsText(payload.location || '')}`,
    `STATUS:${escapeIcsText(payload.status || 'CONFIRMED')}`,
    `SEQUENCE:${Number(payload.sequence || 0)}`,
  ]

  if (payload.organizer?.email) {
    lines.push(`ORGANIZER;CN=${escapeIcsText(payload.organizer.name || 'Arch9')}:MAILTO:${escapeIcsText(payload.organizer.email)}`)
  }

  for (const attendee of Array.isArray(payload.attendees) ? payload.attendees : []) {
    lines.push(
      `ATTENDEE;CN=${escapeIcsText(attendee.name || attendee.email)};ROLE=REQ-PARTICIPANT:MAILTO:${escapeIcsText(attendee.email)}`,
    )
  }

  if (payload.appointmentUrl) {
    lines.push(`URL:${escapeIcsText(payload.appointmentUrl)}`)
  }

  if (payload.transactionReference) {
    lines.push(`X-BRIDGE-TRANSACTION-REFERENCE:${escapeIcsText(payload.transactionReference)}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

async function fetchAppointmentById(appointmentId) {
  const scopedAppointmentId = toText(appointmentId)
  if (!scopedAppointmentId) {
    throw new Error('Appointment is required to generate a calendar invite.')
  }

  let appointmentQuery = await supabase
    .from('appointments')
    .select('appointment_id, organisation_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, status, notes, visibility_scope, appointment_instructions, required_documents, calendar_event_uid, ics_generated_at, external_calendar_status, external_calendar_provider, external_calendar_event_id')
    .eq('appointment_id', scopedAppointmentId)
    .maybeSingle()

  if (
    appointmentQuery.error &&
    (isMissingColumnError(appointmentQuery.error, 'calendar_event_uid') ||
      isMissingColumnError(appointmentQuery.error, 'external_calendar_status') ||
      isMissingColumnError(appointmentQuery.error, 'required_documents'))
  ) {
    appointmentQuery = await supabase
      .from('appointments')
      .select('appointment_id, organisation_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, status, notes, visibility_scope, appointment_instructions')
      .eq('appointment_id', scopedAppointmentId)
      .maybeSingle()
  }

  if (appointmentQuery.error) {
    throw appointmentQuery.error
  }

  if (!appointmentQuery.data) {
    throw new Error('Appointment could not be loaded for calendar invite generation.')
  }

  const participantQuery = await supabase
    .from('appointment_participants')
    .select('participant_id, name, email, participant_role')
    .eq('appointment_id', scopedAppointmentId)

  if (participantQuery.error && !isMissingTableError(participantQuery.error, 'appointment_participants')) {
    throw participantQuery.error
  }

  return {
    ...appointmentQuery.data,
    participants: Array.isArray(participantQuery.data) ? participantQuery.data : [],
  }
}

async function markIcsGenerated(appointment = {}, payload = {}) {
  const appointmentId = toText(appointment?.appointment_id || appointment?.appointmentId || appointment?.id)
  if (!appointmentId) return

  const updatePayload = {
    updated_at: new Date().toISOString(),
    calendar_event_uid: payload.uid || getAppointmentUid(appointment),
    ics_generated_at: new Date().toISOString(),
    external_calendar_status: 'ics_generated',
  }

  const updateResult = await supabase
    .from('appointments')
    .update(updatePayload)
    .eq('appointment_id', appointmentId)

  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'calendar_event_uid') ||
      isMissingColumnError(updateResult.error, 'ics_generated_at') ||
      isMissingColumnError(updateResult.error, 'external_calendar_status')
    ) {
      return
    }

    if (!isMissingTableError(updateResult.error, 'appointments')) {
      throw updateResult.error
    }
  }
}

export async function generateAppointmentICS(appointmentId, options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Calendar invite generation requires database connectivity.')
  }

  const appointment = await fetchAppointmentById(appointmentId)
  const payload = buildAppointmentICSPayload(appointment, options)
  const content = renderIcsContent(payload)

  try {
    await markIcsGenerated(appointment, payload)
  } catch (metadataError) {
    console.warn('[appointments][calendar] Unable to update ICS metadata.', metadataError)
  }

  return {
    appointment,
    payload,
    content,
    fileName: `${sanitizeFileName(payload.title)}.ics`,
  }
}

export function getGoogleCalendarLink(appointment = {}, options = {}) {
  const payload = buildAppointmentICSPayload(appointment, options)
  const timeZone = payload.timeZone || DEFAULT_TIMEZONE
  const startLocal = formatIcsDateTimeInTimezone(payload.start, timeZone)
  const endLocal = formatIcsDateTimeInTimezone(payload.end, timeZone)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: payload.title,
    details: payload.description,
    location: payload.location,
    dates: `${startLocal}/${endLocal}`,
    ctz: timeZone,
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function getOutlookCalendarLink(appointment = {}, options = {}) {
  const payload = buildAppointmentICSPayload(appointment, options)

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: payload.title,
    startdt: payload.start.toISOString(),
    enddt: payload.end.toISOString(),
    body: payload.description,
    location: payload.location,
  })

  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`
}

export function generateAppointmentICSFromAppointment(appointment = {}, options = {}) {
  const payload = buildAppointmentICSPayload(appointment, options)
  const content = renderIcsContent(payload)
  return {
    payload,
    content,
    fileName: `${sanitizeFileName(payload.title)}.ics`,
  }
}

export function downloadAppointmentICSFromAppointment(appointment = {}, options = {}) {
  const { content, fileName } = generateAppointmentICSFromAppointment(appointment, options)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName || 'appointment-invite.ics'
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function downloadAppointmentICS(appointmentId, options = {}) {
  const generated = await generateAppointmentICS(appointmentId, options)
  const blob = new Blob([generated.content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = generated.fileName || 'appointment-invite.ics'
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return generated
}

export async function syncAppointmentToGoogleCalendar() {
  throw new Error('Google Calendar sync is not implemented yet.')
}

export async function syncAppointmentToOutlookCalendar() {
  throw new Error('Outlook Calendar sync is not implemented yet.')
}

export async function deleteExternalCalendarEvent() {
  throw new Error('External calendar event deletion is not implemented yet.')
}

export async function updateExternalCalendarEvent() {
  throw new Error('External calendar event update is not implemented yet.')
}
