import type { SendAppointmentEmailPayload } from '../types.ts'
import {
  buildAppointmentEmailHtml,
  buildAppointmentEmailText,
  buildAppointmentSubject,
} from '../content/appointment.ts'
import { sendViaResendApi } from '../services/resend.ts'
import { jsonResponse } from '../utils/http.ts'
import { normalizeText } from '../utils/text.ts'

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
  const sender = normalizeText(Deno.env.get('RESEND_FROM_EMAIL')) || 'Bridge <onboarding@resend.dev>'

  const subject = buildAppointmentSubject(eventType, normalizeText(payload.appointmentType) || 'Appointment')
  const html = buildAppointmentEmailHtml({
    eventType,
    recipientName: normalizeText(payload.recipientName),
    appointmentType: normalizeText(payload.appointmentType),
    appointmentTitle: normalizeText(payload.appointmentTitle),
    appointmentDate: normalizeText(payload.appointmentDate),
    appointmentTime: normalizeText(payload.appointmentTime),
    location: normalizeText(payload.location),
    status: normalizeText(payload.status),
    notes: normalizeText(payload.notes),
  })
  const text = buildAppointmentEmailText({
    eventType,
    recipientName: normalizeText(payload.recipientName),
    appointmentType: normalizeText(payload.appointmentType),
    appointmentTitle: normalizeText(payload.appointmentTitle),
    appointmentDate: normalizeText(payload.appointmentDate),
    appointmentTime: normalizeText(payload.appointmentTime),
    location: normalizeText(payload.location),
    status: normalizeText(payload.status),
    notes: normalizeText(payload.notes),
  })

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
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
