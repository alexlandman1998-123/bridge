import type { SendLeadPropertySharePayload } from "../types.ts";
import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "../content/bridgeEmailLayout.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function stripHtml(value: string) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function handleLeadPropertyShareEmail(payload: SendLeadPropertySharePayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to).toLowerCase();
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const subject = normalizeText(payload.subject) || "Your matched property collection";
  const message = normalizeText(payload.message || payload.text) ||
    stripHtml(normalizeText(payload.html)) ||
    "Your property representative has shared a property update with you.";
  const text = normalizeText(payload.text || payload.message) || message;
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    organisationId: normalizeText(payload.organisationId || payload.organisation_id),
    defaults: {
      organisationName: normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
        normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
        "Arch9",
      supportEmail: normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
        normalizeText(Deno.env.get("SUPPORT_EMAIL")),
      supportPhone: normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
        normalizeText(Deno.env.get("SUPPORT_PHONE")),
    },
  });
  const html = renderBridgeEmailLayout({
    preheader: message,
    title: subject,
    greeting: "Hi,",
    contentHtml: renderBridgeIntroParagraphs(message.split(/\n{2,}/)),
    securityBody:
      "Property information is shared through Arch9 so your enquiry and follow-up can stay connected.",
    helpBody:
      "Need help? Reply to this email or contact your property representative directly.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
  const sender = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <onboarding@resend.dev>",
    branding.fromName || branding.organisationName,
  );

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send property collection email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "lead_property_share",
    emailId: emailResult.data?.id || null,
    providerMessageId: emailResult.data?.id || null,
  });
}
