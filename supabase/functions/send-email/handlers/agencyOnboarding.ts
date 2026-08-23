import { sendViaResendApi } from "../services/resend.ts";
import type { SendAgencyOnboardingPayload } from "../types.ts";
import {
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "../content/bridgeEmailLayout.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function buildMessageCopy(payload: SendAgencyOnboardingPayload) {
  const messageKind = normalizeText(payload.messageKind).toLowerCase() || "initial_request";
  const agencyName = normalizeText(payload.agencyName) || "your agency";
  const principalName = normalizeText(payload.principalName) || "your team";
  const secureLink = normalizeText(payload.secureLink || payload.onboardingLink || payload.actionLink);

  if (messageKind === "submission_confirmation") {
    return {
      subject: `${agencyName} onboarding received by Arch9`,
      headline: "Agency onboarding received",
      body:
        `Thank you. Arch9 has received the agency onboarding submission for ${agencyName}. We’ll review the details and follow up if anything else is needed before activation.`,
      closing: `If you need to update anything, reply to this message and we’ll help from there.`,
      secureLink,
    };
  }

  if (messageKind === "reminder") {
    return {
      subject: `Reminder: complete your Arch9 agency onboarding for ${agencyName}`,
      headline: "Agency onboarding reminder",
      body:
        `This is a quick reminder to finish the Arch9 agency onboarding for ${agencyName}. The secure link below will take you back to the saved draft so you can continue from where you left off.`,
      closing: `If you need help, reply and we’ll guide ${principalName} through the final steps.`,
      secureLink,
    };
  }

  if (messageKind === "link_replaced") {
    return {
      subject: `Your new Arch9 agency onboarding link for ${agencyName}`,
      headline: "New secure onboarding link",
      body:
        `We’ve generated a new secure onboarding link for ${agencyName}. Please use the link below to continue with the latest draft and complete the agency services agreement.`,
      closing: `The previous link has been replaced for security.`,
      secureLink,
    };
  }

  return {
    subject: `Complete your Arch9 agency onboarding for ${agencyName}`,
    headline: "Complete your agency onboarding",
    body:
      `Please complete the Arch9 agency onboarding for ${agencyName}. We’ll capture the agency details, the principal contact, and the services agreement so we can activate your account properly.`,
    closing: `If you have any questions, ${principalName} can reply to this email and we’ll help out.`,
    secureLink,
  };
}

function buildHtml(payload: SendAgencyOnboardingPayload, branding: Awaited<ReturnType<typeof resolveEmailBranding>>) {
  const copy = buildMessageCopy(payload);
  const secureLink = normalizeText(copy.secureLink);
  const bodySections = [
    renderBridgeIntroParagraphs([copy.body]),
    secureLink ? renderBridgeCta("Open Secure Onboarding", secureLink, { primaryColor: branding.primaryColor }) : "",
    renderBridgeIntroParagraphs([copy.closing || ""]),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: copy.body,
    title: copy.headline,
    greeting: `Hi ${normalizeText(payload.recipientName) || normalizeText(payload.principalName) || "there"},`,
    contentHtml: [
      bodySections,
      payload.planName || payload.planSummary
        ? `<div style="margin: 18px 0 0; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
             <p style="margin: 0 0 8px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Plan context</p>
             ${renderBridgeBullets([
               payload.planName ? `Plan: ${payload.planName}` : "",
               payload.planSummary || "",
             ].filter(Boolean))}
           </div>`
        : "",
    ].join(""),
    securityTitle: "Secure Agency Onboarding",
    securityBody: "Your agency details and agreement are handled through Arch9 so the onboarding stays private and traceable.",
    helpBody: "Need help? Reply to this email and we’ll pick it up.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
}

function buildText(payload: SendAgencyOnboardingPayload) {
  const copy = buildMessageCopy(payload);
  const lines = [
    copy.headline,
    "",
    copy.body,
    payload.planName ? `Plan: ${payload.planName}` : "",
    payload.planSummary ? `Plan summary: ${payload.planSummary}` : "",
    copy.secureLink ? `Secure onboarding link: ${copy.secureLink}` : "",
    copy.closing || "",
  ].filter(Boolean);
  return lines.join("\n\n");
}

export async function handleAgencyOnboardingEmail(payload: SendAgencyOnboardingPayload) {
  const to = normalizeText(payload.to).toLowerCase();
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const fromAddress = normalizeText(
    Deno.env.get("BRIDGE_FROM_EMAIL") || Deno.env.get("FROM_EMAIL") ||
      Deno.env.get("ARCH9_RESEND_FROM_EMAIL") ||
      Deno.env.get("RESEND_FROM_EMAIL") ||
      "Arch9 <onboarding@resend.dev>",
  );
  const replyTo = normalizeText(payload.principalEmail) || undefined;
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    defaults: {
      organisationName: normalizeText(payload.agencyName) || "Arch9",
      supportEmail: normalizeText(payload.principalEmail),
      supportPhone: normalizeText(payload.principalPhone),
      replyTo,
    },
  });

  const copy = buildMessageCopy(payload);
  const delivery = await sendViaResendApi({
    apiKey: resendApiKey,
    from: formatEmailSender(fromAddress, branding.fromName || branding.organisationName),
    to,
    subject: copy.subject,
    html: buildHtml(payload, branding),
    text: buildText(payload),
    replyTo,
  });

  if (!delivery.ok) {
    return jsonResponse(502, {
      error: "Agency onboarding email delivery failed.",
      details: delivery.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    messageId: delivery.data?.id || null,
    subject: copy.subject,
  });
}
