import type { SendAppointmentEmailPayload } from '../types.ts'
import {
  buildAppointmentEmailHtml,
  buildAppointmentEmailText,
  buildAppointmentSubject,
} from '../content/appointment.ts'
import { sendViaResendApi } from '../services/resend.ts'
import { jsonResponse } from '../utils/http.ts'
import { normalizeText } from '../utils/text.ts'

function escapeIcsText(value = '') {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function formatUtcIcsDate(value = '') {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function buildIcsAttachment(payload: SendAppointmentEmailPayload) {
  if (payload.attachCalendarInvite === false) return null
  const date = normalizeText(payload.appointmentDate)
  const time = normalizeText(payload.appointmentTime).slice(0, 5)
  if (!date || !time) return null

  const start = new Date(`${date}T${time}:00+02:00`)
  if (Number.isNaN(start.getTime())) return null
  const endTime = normalizeText(payload.appointmentEndTime).slice(0, 5)
  const explicitEnd = endTime ? new Date(`${date}T${endTime}:00+02:00`) : null
  const end = explicitEnd && !Number.isNaN(explicitEnd.getTime()) && explicitEnd.getTime() > start.getTime()
    ? explicitEnd
    : new Date(start.getTime() + 45 * 60 * 1000)
  const uid = normalizeText(payload.appointmentId)
    ? `bridge-${normalizeText(payload.appointmentId)}@bridge.app`
    : `bridge-${crypto.randomUUID()}@bridge.app`
  const title = normalizeText(payload.appointmentTitle || payload.appointmentType || 'Arch9 Appointment')
  const location = normalizeText(payload.meetingUrl || payload.location || 'To be confirmed')
  const description = [
    normalizeText(payload.notes),
    normalizeText(payload.actionLink) ? `Appointment link: ${normalizeText(payload.actionLink)}` : '',
  ].filter(Boolean).join('\n\n')
  const organizerEmail = normalizeText(payload.organizerEmail || 'appointments@bridge.co.za')
  const organizerName = normalizeText(payload.organizerName || 'Arch9')
  const attendeeEmail = normalizeText(payload.to)
  const attendeeName = normalizeText(payload.recipientName || payload.to || 'Participant')

  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Arch9//Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatUtcIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatUtcIcsDate(start.toISOString())}`,
    `DTEND:${formatUtcIcsDate(end.toISOString())}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    'STATUS:CONFIRMED',
    `ORGANIZER;CN=${escapeIcsText(organizerName)}:MAILTO:${escapeIcsText(organizerEmail)}`,
    attendeeEmail ? `ATTENDEE;CN=${escapeIcsText(attendeeName)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:MAILTO:${escapeIcsText(attendeeEmail)}` : '',
    normalizeText(payload.actionLink) ? `URL:${escapeIcsText(normalizeText(payload.actionLink))}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  return {
    filename: 'bridge-appointment.ics',
    content: btoa(content),
    content_type: 'text/calendar; method=REQUEST; charset=UTF-8',
  }
}

export async function handleAppointmentEmail(payload: SendAppointmentEmailPayload) {
  const resendApiKey = normalizeText(Deno.env.get('RESEND_API_KEY'))
  if (!resendApiKey) {
    return jsonResponse(500, { error: 'Missing RESEND_API_KEY secret.' })
  }

  const to = normalizeText(payload.to)
  if (!to) {
    return jsonResponse(400, { error: 'Missing required field: to' })
  }

  const eventType = normalizeText(payload.type).toLowerCase()
  const sender =
    normalizeText(Deno.env.get('RESEND_APPOINTMENTS_FROM_EMAIL')) ||
    normalizeText(Deno.env.get('RESEND_FROM_EMAIL')) ||
    'Arch9 Appointments <appointments@bridge.co.za>'

  const subject = buildAppointmentSubject(eventType, normalizeText(payload.appointmentType) || 'Appointment')
  const html = buildAppointmentEmailHtml({
    eventType,
    recipientName: normalizeText(payload.recipientName),
    appointmentType: normalizeText(payload.appointmentType),
    appointmentTitle: normalizeText(payload.appointmentTitle),
    appointmentDate: normalizeText(payload.appointmentDate),
    appointmentTime: normalizeText(payload.appointmentTime),
    relatedListing: normalizeText(payload.relatedListing),
    location: normalizeText(payload.location),
    status: normalizeText(payload.status),
    notes: normalizeText(payload.notes),
    actionLink: normalizeText(payload.actionLink),
    acceptLink: normalizeText(payload.acceptLink),
    declineLink: normalizeText(payload.declineLink),
    rescheduleLink: normalizeText(payload.rescheduleLink),
    meetingUrl: normalizeText(payload.meetingUrl),
  })
  const text = buildAppointmentEmailText({
    eventType,
    recipientName: normalizeText(payload.recipientName),
    appointmentType: normalizeText(payload.appointmentType),
    appointmentTitle: normalizeText(payload.appointmentTitle),
    appointmentDate: normalizeText(payload.appointmentDate),
    appointmentTime: normalizeText(payload.appointmentTime),
    relatedListing: normalizeText(payload.relatedListing),
    location: normalizeText(payload.location),
    status: normalizeText(payload.status),
    notes: normalizeText(payload.notes),
    actionLink: normalizeText(payload.actionLink),
    acceptLink: normalizeText(payload.acceptLink),
    declineLink: normalizeText(payload.declineLink),
    rescheduleLink: normalizeText(payload.rescheduleLink),
    meetingUrl: normalizeText(payload.meetingUrl),
  })

  const icsAttachment = buildIcsAttachment(payload)

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
    attachments: icsAttachment ? [icsAttachment] : undefined,
  })

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || 'Failed to send appointment email.',
      details: emailResult.error,
    })
  }

  return jsonResponse(200, {
    ok: true,
    type: eventType,
    emailId: emailResult.data?.id || null,
  })
}
