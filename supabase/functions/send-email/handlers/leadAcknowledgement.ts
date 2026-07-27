import type { SendLeadAcknowledgementPayload } from "../types.ts";
import {
  buildLeadAcknowledgementEmailHtml,
  buildLeadAcknowledgementEmailText,
  buildLeadAcknowledgementSubject,
} from "../content/leadAcknowledgement.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function normalizeEmail(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0] || "";
}

function formatSender(name: string, email: string) {
  const cleanName = normalizeText(name).replace(/[<>\r\n"]/g, "");
  return cleanName ? `${cleanName} <${email}>` : email;
}

export async function handleLeadAcknowledgementEmail(payload: SendLeadAcknowledgementPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeEmail(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const centralSender = normalizeText(payload.fromEmail || payload.from_email) ||
    normalizeText(Deno.env.get("RESEND_LEAD_ACK_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";
  const senderEmail = normalizeEmail(centralSender);
  const sender = senderEmail && !centralSender.includes("<")
    ? formatSender(
      normalizeText(payload.fromName || payload.from_name || payload.organisationName || payload.organisation_name || "Arch9"),
      senderEmail,
    )
    : centralSender;
  const replyTo = normalizeEmail(payload.replyTo || payload.reply_to);
  const subject = normalizeText(payload.subject) || buildLeadAcknowledgementSubject();

  const content = {
    recipientName: normalizeText(payload.recipientName || payload.recipient_name),
    organisationName: normalizeText(payload.organisationName || payload.organisation_name),
    organisationLogoUrl: normalizeText(payload.organisationLogoUrl || payload.organisation_logo_url),
    organisationTagline: normalizeText(payload.organisationTagline || payload.organisation_tagline),
    organisationPhone: normalizeText(payload.organisationPhone || payload.organisation_phone),
    organisationEmail: normalizeText(payload.organisationEmail || payload.organisation_email),
    organisationWebsite: normalizeText(payload.organisationWebsite || payload.organisation_website),
    organisationBrandPrimaryColor: normalizeText(payload.organisationBrandPrimaryColor || payload.organisation_brand_primary_color),
    organisationBrandSecondaryColor: normalizeText(payload.organisationBrandSecondaryColor || payload.organisation_brand_secondary_color),
    enquiryReceivedAt: normalizeText(payload.enquiryReceivedAt || payload.enquiry_received_at),
    timezone: normalizeText(payload.timezone),
    source: normalizeText(payload.source),
    originalMessage: normalizeText(payload.originalMessage || payload.original_message),
    agentName: normalizeText(payload.agentName || payload.agent_name),
    agentFirstName: normalizeText(payload.agentFirstName || payload.agent_first_name),
    agentEmail: normalizeText(payload.agentEmail || payload.agent_email),
    agentPhone: normalizeText(payload.agentPhone || payload.agent_phone),
    agentJobTitle: normalizeText(payload.agentJobTitle || payload.agent_job_title),
    agentBio: normalizeText(payload.agentBio || payload.agent_bio),
    agentAvatarUrl: normalizeText(payload.agentAvatarUrl || payload.agent_avatar_url),
    responseExpectation: normalizeText(payload.responseExpectation || payload.response_expectation),
    customResponseText: normalizeText(payload.customResponseText || payload.custom_response_text),
  };

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html: buildLeadAcknowledgementEmailHtml(content),
    text: buildLeadAcknowledgementEmailText(content),
    replyTo: replyTo || undefined,
    idempotencyKey: normalizeText(payload.idempotencyKey || payload.idempotency_key) || undefined,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send lead acknowledgement email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "lead_acknowledgement",
    emailId: emailResult.data?.id || null,
    providerMessageId: emailResult.data?.id || null,
  });
}
