import type { SendLeadAcknowledgementPayload } from "../types.ts";
import {
  buildLeadAcknowledgementEmailText,
  buildLeadAcknowledgementSubject,
} from "../content/leadAcknowledgement.ts";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function normalizeEmail(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0] || "";
}

export async function handleLeadAcknowledgementEmail(
  payload: SendLeadAcknowledgementPayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeEmail(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const centralSender =
    normalizeText(payload.fromEmail || payload.from_email) ||
    normalizeText(Deno.env.get("RESEND_LEAD_ACK_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";
  const replyTo = normalizeEmail(payload.replyTo || payload.reply_to);
  const subject = normalizeText(payload.subject) ||
    buildLeadAcknowledgementSubject();

  const content = {
    recipientName: normalizeText(
      payload.recipientName || payload.recipient_name,
    ),
    organisationName: normalizeText(
      payload.organisationName || payload.organisation_name,
    ),
    organisationLogoUrl: normalizeText(
      payload.organisationLogoUrl || payload.organisation_logo_url,
    ),
    organisationTagline: normalizeText(
      payload.organisationTagline || payload.organisation_tagline,
    ),
    organisationPhone: normalizeText(
      payload.organisationPhone || payload.organisation_phone,
    ),
    organisationEmail: normalizeText(
      payload.organisationEmail || payload.organisation_email,
    ),
    organisationWebsite: normalizeText(
      payload.organisationWebsite || payload.organisation_website,
    ),
    organisationBrandPrimaryColor: normalizeText(
      payload.organisationBrandPrimaryColor ||
        payload.organisation_brand_primary_color,
    ),
    organisationBrandSecondaryColor: normalizeText(
      payload.organisationBrandSecondaryColor ||
        payload.organisation_brand_secondary_color,
    ),
    enquiryReceivedAt: normalizeText(
      payload.enquiryReceivedAt || payload.enquiry_received_at,
    ),
    timezone: normalizeText(payload.timezone),
    source: normalizeText(payload.source),
    originalMessage: normalizeText(
      payload.originalMessage || payload.original_message,
    ),
    agentName: normalizeText(payload.agentName || payload.agent_name),
    agentFirstName: normalizeText(
      payload.agentFirstName || payload.agent_first_name,
    ),
    agentEmail: normalizeText(payload.agentEmail || payload.agent_email),
    agentPhone: normalizeText(payload.agentPhone || payload.agent_phone),
    agentJobTitle: normalizeText(
      payload.agentJobTitle || payload.agent_job_title,
    ),
    agentBio: normalizeText(payload.agentBio || payload.agent_bio),
    agentAvatarUrl: normalizeText(
      payload.agentAvatarUrl || payload.agent_avatar_url,
    ),
    responseExpectation: normalizeText(
      payload.responseExpectation || payload.response_expectation,
    ),
    customResponseText: normalizeText(
      payload.customResponseText || payload.custom_response_text,
    ),
  };
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    organisationId: normalizeText(
      payload.organisationId || payload.organisation_id,
    ),
    defaults: {
      organisationName: content.organisationName || "Arch9",
      logoUrl: content.organisationLogoUrl,
      tagline: content.organisationTagline,
      supportEmail: content.organisationEmail,
      supportPhone: content.organisationPhone,
      website: content.organisationWebsite,
      primaryColor: content.organisationBrandPrimaryColor,
      secondaryColor: content.organisationBrandSecondaryColor,
      fromName: normalizeText(payload.fromName || payload.from_name),
      replyTo,
    },
  });
  const agentName = content.agentName || "your property practitioner";
  const agentFirstName = content.agentFirstName ||
    agentName.split(/\s+/).filter(Boolean)[0] ||
    "the agent";
  const responseExpectation = content.customResponseText ||
    content.responseExpectation ||
    `${agentFirstName} will review your enquiry and contact you shortly.`;
  const contentHtml = [
    renderBridgeIntroParagraphs([
      "Thank you for your interest in one of our properties. We have received your enquiry and our team will be in touch with you shortly.",
      "Buying a home is a big decision, and we are here to make the process as smooth and straightforward as possible.",
      responseExpectation,
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Agent", value: agentName },
        { label: "Agent Email", value: content.agentEmail },
        { label: "Agent Phone", value: content.agentPhone },
        { label: "Source", value: content.source },
        { label: "Message", value: content.originalMessage },
      ],
      "Enquiry Details",
    ),
    content.agentEmail
      ? renderBridgeCta(
        `Email ${agentFirstName}`,
        `mailto:${content.agentEmail}`,
        {
          primaryColor: branding.primaryColor,
        },
      )
      : "",
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: "We have received your property enquiry.",
    title: "Thanks For Your Enquiry",
    greeting: `Hi ${content.recipientName || "there"},`,
    contentHtml,
    securityBody:
      "Your enquiry details are shared only with the property team handling your request.",
    helpBody:
      "Need help? Reply to this email or contact the listed property practitioner directly.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
  const sender = formatEmailSender(
    centralSender,
    branding.fromName || branding.organisationName,
  );

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    bcc: content.agentEmail,
    subject,
    html,
    text: buildLeadAcknowledgementEmailText(content),
    replyTo: replyTo || undefined,
    idempotencyKey:
      normalizeText(payload.idempotencyKey || payload.idempotency_key) ||
      undefined,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message ||
        "Failed to send lead acknowledgement email.",
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
