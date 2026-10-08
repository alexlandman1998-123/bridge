import { actOnCalendarProviderEvent } from './calendarProviderService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getAppointmentTemplateInstructions, getAppointmentTypeTemplate } from './appointmentTemplateService'
import { appointmentLocalParts, resolveAppointmentSchedule } from '../core/appointments/appointmentTime.js'

const DEFAULT_TIMEZONE = 'Africa/Johannesburg'

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function toLower(value = '') {
  return toText(value).toLowerCase()
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
  return /^(?:arch9|bridge):/i.test(appointmentTypeLabel)
    ? appointmentTypeLabel.replace(/^bridge:/i, 'Arch9:')
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
  const schedule = resolveAppointmentSchedule(appointment, {
    defaultDurationMinutes: getAppointmentTypeTemplate(appointment.appointmentType || appointment.appointment_type)?.defaultDurationMinutes,
  })
  const start = new Date(schedule.dateTime)
  const end = new Date(schedule.endDateTime)

  const timeZone = schedule.allDay ? schedule.timezone : toText(options?.timeZone || options?.timezone || getEffectiveTimezone(appointment), DEFAULT_TIMEZONE)
  const participants = getParticipants(appointment)
  const organizerName = toText(appointment?.organizerName || appointment?.assignedAgentName || appointment?.agentName || 'Arch9')
  const organizerEmail = toText(appointment?.organizerEmail || appointment?.assignedAgentEmail || appointment?.agentEmail)
  const uid = getAppointmentUid(appointment)
  const title = getAppointmentCalendarTitle(appointment)
  const description = getAppointmentCalendarDescription(appointment)
  const location = getAppointmentCalendarLocation(appointment)
  const status = toLower(appointment?.status)
  const cancelled = status.includes('cancel') || status === 'declined'
  const method = cancelled ? 'CANCEL' : 'REQUEST'

  return {
    uid,
    method,
    status: cancelled ? 'CANCELLED' : /pending|request|propos/.test(status) ? 'TENTATIVE' : 'CONFIRMED',
    title,
    description,
    location,
    start,
    end,
    timeZone,
    allDay: schedule.allDay,
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
    sequence: Number(appointment?.calendarSequence || appointment?.calendar_sequence || appointment?.calendarRevision || appointment?.calendar_revision || 0) || 0,
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
    payload.allDay
      ? `DTSTART;VALUE=DATE:${appointmentLocalParts(payload.start, payload.timeZone).date.replace(/-/g, '')}`
      : `DTSTART:${formatIcsUtc(payload.start)}`,
    payload.allDay
      ? `DTEND;VALUE=DATE:${appointmentLocalParts(payload.end, payload.timeZone).date.replace(/-/g, '')}`
      : `DTEND:${formatIcsUtc(payload.end)}`,
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
    .select('appointment_id, organisation_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, end_date_time, timezone, all_day, location, status, notes, visibility_scope, appointment_instructions, required_documents, calendar_event_uid, ics_generated_at, external_calendar_status, external_calendar_provider, external_calendar_event_id')
    .eq('appointment_id', scopedAppointmentId)
    .maybeSingle()

  if (
    appointmentQuery.error &&
    (isMissingColumnError(appointmentQuery.error, 'end_date_time') ||
      isMissingColumnError(appointmentQuery.error, 'calendar_event_uid') ||
      isMissingColumnError(appointmentQuery.error, 'external_calendar_status') ||
      isMissingColumnError(appointmentQuery.error, 'required_documents'))
  ) {
    appointmentQuery = await supabase
      .from('appointments')
      .select('appointment_id, organisation_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, timezone, all_day, location, status, notes, visibility_scope, appointment_instructions')
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
  const startLocal = payload.allDay ? appointmentLocalParts(payload.start, timeZone).date.replace(/-/g, '') : formatIcsUtc(payload.start)
  const endLocal = payload.allDay ? appointmentLocalParts(payload.end, timeZone).date.replace(/-/g, '') : formatIcsUtc(payload.end)

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
  if (payload.allDay) params.set('allday', 'true')

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

function connectedAction(appointment = {}, options = {}, provider, action) {
  return actOnCalendarProviderEvent({
    organisationId: options.organisationId || appointment.organisationId || appointment.organisation_id,
    appointmentId: appointment.appointmentId || appointment.appointment_id || appointment.id,
    provider: provider || options.provider,
    action,
    reviewToken: options.reviewToken || null,
  })
}
export async function syncAppointmentToGoogleCalendar(appointment, options = {}) {
  return connectedAction(appointment, options, 'google', 'sync')
}
export async function syncAppointmentToOutlookCalendar(appointment, options = {}) {
  return connectedAction(appointment, options, 'outlook', 'sync')
}
export async function deleteExternalCalendarEvent(appointment, options = {}) {
  return connectedAction(appointment, options, options.provider, 'remove')
}
export async function updateExternalCalendarEvent(appointment, options = {}) {
  return connectedAction(appointment, options, options.provider, 'sync')
}
