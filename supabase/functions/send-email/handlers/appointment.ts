import { createClient } from "supabase";
import type { SendAppointmentEmailPayload } from "../types.ts";
import {
  buildAppointmentEmailHtml,
  buildAppointmentEmailText,
  buildAppointmentSubject,
} from "../content/appointment.ts";
import {
  isClientEmailRecipientRole,
  normalizeEmailAddress,
  resolveAudienceEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function escapeIcsText(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatUtcIcsDate(value = "") {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function encodeBase64Utf8(value = "") {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildIcsAttachment(payload: SendAppointmentEmailPayload) {
  if (payload.attachCalendarInvite === false) return null;
  const date = normalizeText(payload.appointmentDate);
  const time = normalizeText(payload.appointmentTime).slice(0, 5);
  if (!date || !time) return null;

  const start = payload.dateTime ? new Date(payload.dateTime) : new Date(`${date}T${time}:00+02:00`);
  if (Number.isNaN(start.getTime())) return null;
  const endTime = normalizeText(payload.appointmentEndTime).slice(0, 5);
  const explicitEnd = payload.endDateTime ? new Date(payload.endDateTime) : endTime ? new Date(`${date}T${endTime}:00+02:00`) : null;
  const end = explicitEnd && !Number.isNaN(explicitEnd.getTime()) &&
      explicitEnd.getTime() > start.getTime()
    ? explicitEnd
    : new Date(start.getTime() + 45 * 60 * 1000);
  const uid = normalizeText(payload.appointmentId)
    ? `bridge-${normalizeText(payload.appointmentId)}@bridge.app`
    : `bridge-${crypto.randomUUID()}@bridge.app`;
  const title = normalizeText(
    payload.appointmentTitle || payload.appointmentType || "Arch9 Appointment",
  );
  const location = normalizeText(
    payload.meetingUrl || payload.location || "To be confirmed",
  );
  const description = [
    normalizeText(payload.agentName)
      ? `Host: ${normalizeText(payload.agentName)}${
        normalizeText(payload.agentRole)
          ? `, ${normalizeText(payload.agentRole)}`
          : ""
      }`
      : "",
    normalizeText(payload.organisationName)
      ? `Agency: ${normalizeText(payload.organisationName)}`
      : "",
    normalizeText(payload.notes),
    normalizeText(payload.actionLink)
      ? `Appointment link: ${normalizeText(payload.actionLink)}`
      : "",
    normalizeText(payload.meetingUrl || payload.location)
      ? `Location: ${normalizeText(payload.meetingUrl || payload.location)}`
      : "",
    "Please reply to the email if you need to reschedule.",
  ].filter(Boolean).join("\n\n");
  const organizerEmail = normalizeText(
    payload.organizerEmail || payload.agentEmail || payload.replyTo ||
      "no-reply@arch9.co.za",
  );
  const organizerName = normalizeText(
    payload.organizerName || payload.agentName || payload.organisationName ||
      "Arch9",
  );
  const attendeeEmail = normalizeText(payload.to);
  const attendeeName = normalizeText(
    payload.recipientName || payload.to || "Participant",
  );
  const timezone = normalizeText(payload.timezone || "Africa/Johannesburg");
  const normalizedStatus = normalizeText(payload.status).toLowerCase();
  const isCancellation =
    normalizeText(payload.type).toLowerCase() === "appointment_cancelled" ||
    normalizedStatus.includes("cancel");
  const method = isCancellation ? "CANCEL" : "REQUEST";
  const eventStatus = isCancellation
    ? "CANCELLED"
    : normalizedStatus.includes("pending") ||
        normalizedStatus.includes("request")
    ? "TENTATIVE"
    : "CONFIRMED";

  const endDateParts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit' })
    .formatToParts(end).reduce<Record<string,string>>((parts, part) => ({ ...parts, [part.type]:part.value }), {});
  const calendarStart = payload.allDay ? `DTSTART;VALUE=DATE:${date.replaceAll('-', '')}` : `DTSTART:${formatUtcIcsDate(start.toISOString())}`;
  const calendarEnd = payload.allDay ? `DTEND;VALUE=DATE:${endDateParts.year}${endDateParts.month}${endDateParts.day}` : `DTEND:${formatUtcIcsDate(end.toISOString())}`;
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Arch9//Appointments//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    `X-WR-TIMEZONE:${escapeIcsText(timezone)}`,
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatUtcIcsDate(payload.calendarTimestamp || new Date().toISOString())}`,
    calendarStart,
    calendarEnd,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `STATUS:${eventStatus}`,
    `SEQUENCE:${Math.max(0, Math.min(2147483647, Math.floor(Number(payload.calendarSequence) || 0)))}`,
    `ORGANIZER;CN=${escapeIcsText(organizerName)}:MAILTO:${
      escapeIcsText(organizerEmail)
    }`,
    attendeeEmail
      ? `ATTENDEE;CN=${
        escapeIcsText(attendeeName)
      };ROLE=REQ-PARTICIPANT;RSVP=TRUE:MAILTO:${escapeIcsText(attendeeEmail)}`
      : "",
    normalizeText(payload.actionLink)
      ? `URL:${escapeIcsText(normalizeText(payload.actionLink))}`
      : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const folded = content.split('\r\n').map(line => {
    let output = '', segment = '', length = 0;
    for (const character of line) {
      const size = new TextEncoder().encode(character).length;
      if (length + size > 75) { output += segment + '\r\n'; segment = ' '; length = 1; }
      segment += character; length += size;
    }
    return output + segment;
  }).join('\r\n') + '\r\n';

  return {
    filename: normalizeText(payload.appointmentId)
      ? `arch9-appointment-${normalizeText(payload.appointmentId)}.ics`
      : "arch9-appointment.ics",
    content: encodeBase64Utf8(folded),
    content_type: `text/calendar; method=${method}; charset=UTF-8`,
  };
}

type ProviderMessage = Omit<Parameters<typeof sendViaResendApi>[0], 'apiKey'>;
export async function freezeCalendarProviderMessage(client: { rpc: Function } | undefined, message: ProviderMessage): Promise<ProviderMessage | null> {
  const key = normalizeText(message.idempotencyKey);
  if (!key.startsWith('calendar-appointment:')) return message;
  const jobId = key.slice('calendar-appointment:'.length);
  if (!client || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('Calendar delivery configuration is unavailable.');
  const frozen = await client.rpc('freeze_calendar_provider_payload', { p_id:jobId, p_payload:message });
  if (frozen.error) throw new Error('Calendar provider content could not be persisted.');
  return frozen.data;
}

export async function handleAppointmentEmail(
  payload: SendAppointmentEmailPayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const eventType = normalizeText(payload.type).toLowerCase();
  const rawPayload = payload as Record<string, unknown>;
  const organisationName = normalizeText(
    rawPayload.organisationName || rawPayload.organisation_name,
  ) || "Arch9";
  const supportEmail = normalizeText(
    rawPayload.supportEmail || rawPayload.support_email,
  );
  const supportPhone = normalizeText(
    rawPayload.supportPhone || rawPayload.support_phone,
  );
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const supabase = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : undefined;
  const branding = await resolveEmailBranding({
    supabase,
    payload: rawPayload,
    organisationId: normalizeText(
      rawPayload.organisationId || rawPayload.organisation_id,
    ),
    defaults: { organisationName, supportEmail, supportPhone },
  });
  const baseSender = normalizeText(Deno.env.get("RESEND_APPOINTMENTS_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 Appointments <no-reply@arch9.co.za>";
  const participantRole = normalizeText(payload.participantRole).toLowerCase();
  const audience = participantRole && !isClientEmailRecipientRole(participantRole)
    ? "internal"
    : "client";
  const sender = await resolveAudienceEmailSender({
    audience,
    branding,
    platformSender: audience === "internal"
      ? normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) || baseSender
      : baseSender,
    supabase: audience === "client" ? supabase : undefined,
  });

  const subject = buildAppointmentSubject(
    eventType,
    normalizeText(payload.appointmentType) || "Appointment",
    {
      participantRole: normalizeText(payload.participantRole),
      appointmentTitle: normalizeText(payload.appointmentTitle),
      organisationName: branding.organisationName,
      emailTheme: normalizeText(
        rawPayload.emailTheme || rawPayload.email_theme,
      ),
      emailTemplateKey: normalizeText(
        rawPayload.emailTemplateKey || rawPayload.email_template_key ||
          rawPayload.templateKey || rawPayload.template_key,
      ),
    },
  );
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
    participantRole: normalizeText(payload.participantRole),
    agentName: normalizeText(payload.agentName),
    agentRole: normalizeText(payload.agentRole),
    agentBio: normalizeText(payload.agentBio),
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    attachCalendarInvite: payload.attachCalendarInvite !== false,
    branding,
    emailTheme: normalizeText(
      rawPayload.emailTheme || rawPayload.email_theme,
    ),
    emailTemplateKey: normalizeText(
      rawPayload.emailTemplateKey || rawPayload.email_template_key ||
        rawPayload.templateKey || rawPayload.template_key,
    ),
  });
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
    participantRole: normalizeText(payload.participantRole),
    agentName: normalizeText(payload.agentName),
    agentRole: normalizeText(payload.agentRole),
    agentBio: normalizeText(payload.agentBio),
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    attachCalendarInvite: payload.attachCalendarInvite !== false,
    emailTheme: normalizeText(
      rawPayload.emailTheme || rawPayload.email_theme,
    ),
    emailTemplateKey: normalizeText(
      rawPayload.emailTemplateKey || rawPayload.email_template_key ||
        rawPayload.templateKey || rawPayload.template_key,
    ),
  });

  const icsAttachment = buildIcsAttachment({
    ...payload,
    organizerEmail: payload.organizerEmail || payload.agentEmail ||
      payload.replyTo || branding.replyTo || normalizeEmailAddress(sender),
    organizerName: payload.organizerName || payload.agentName || branding.organisationName,
  });

  const providerMessage = await freezeCalendarProviderMessage(supabase, {
    from: sender,
    to,
    bcc: payload.bccAgent === false ? undefined : normalizeText(payload.agentEmail || payload.organizerEmail),
    subject,
    html,
    text,
    attachments: icsAttachment ? [icsAttachment] : undefined,
    replyTo: normalizeText(
      payload.replyTo || payload.organizerEmail || payload.agentEmail ||
        branding.replyTo,
    ) || undefined,
    idempotencyKey: normalizeText(payload.idempotencyKey) || undefined,
  });
  if (!providerMessage) return jsonResponse(409, { error: 'This calendar delivery was superseded.' });
  const emailResult = await sendViaResendApi({ ...providerMessage, apiKey: resendApiKey });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send appointment email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: eventType,
    emailId: emailResult.data?.id || null,
  });
}
