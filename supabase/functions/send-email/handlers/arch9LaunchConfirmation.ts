import { sendViaResendApi } from "../services/resend.ts";
import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import type {
  SendArch9LaunchConfirmationPayload,
  SendArch9LaunchInternalNotificationPayload,
} from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function envEnabled(value: string | undefined, fallback = true) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function renderEmailHtml({
  recipientName,
  roleType,
  discussionFocus,
  preferredTime,
}: {
  recipientName: string;
  roleType: string;
  discussionFocus: string;
  preferredTime: string;
}) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  return renderBridgeEmailLayout({
    preheader: "Thank you for your Arch9 request. We will be in contact shortly.",
    title: "Thank You. We Will Be In Contact Shortly.",
    greeting,
    contentHtml: [
      renderBridgeIntroParagraphs([
        "We have received your request for a private Arch9 strategy session.",
        "Our team will review your details and come back to you with a time that suits your schedule.",
      ]),
      renderBridgeSummaryCard(
        [
          { label: "Profile", value: roleType },
          { label: "Focus", value: discussionFocus },
          { label: "Preferred Time", value: preferredTime },
        ],
        "Request Details",
      ),
      `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
         <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What happens next</p>
         ${renderBridgeSteps([
        "We review your details.",
        "We prepare a tailored walkthrough.",
        "We confirm a time that suits you.",
      ])}
       </div>`,
    ].join(""),
    securityBody:
      "Your request details are used only by the Arch9 team to prepare the follow-up.",
    helpBody:
      "Need help? Reply to this email and the Arch9 team will assist.",
    organisationName: "Arch9",
  });
}

function renderInternalNotificationHtml({
  fullName,
  email,
  phone,
  company,
  roleType,
  discussionFocus,
  preferredTime,
  note,
  pageUrl,
  submittedAt,
  requestLabel,
  requestHeading,
  requestBody,
  hiddenSummary,
}: {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  roleType: string;
  discussionFocus: string;
  preferredTime: string;
  note: string;
  pageUrl: string;
  submittedAt: string;
  requestLabel?: string;
  requestHeading?: string;
  requestBody?: string;
  hiddenSummary?: string;
}) {
  const label = requestLabel || "New concierge request";
  const heading = requestHeading || `${fullName || "A launch guest"} requested a follow-up.`;
  const body = requestBody || "They scanned the Arch9 launch QR flow and asked to be contacted after the event.";
  const hidden = hiddenSummary || `New Arch9 launch concierge request from ${fullName || "a launch guest"}.`;
  return renderBridgeEmailLayout({
    preheader: hidden,
    title: label,
    greeting: heading,
    contentHtml: [
      renderBridgeIntroParagraphs([body, note ? `Note: ${note}` : ""]),
      renderBridgeSummaryCard(
        [
          { label: "Name", value: fullName },
          { label: "Email", value: email },
          { label: "Phone", value: phone },
          { label: "Company", value: company },
          { label: "Profile", value: roleType },
          { label: "Focus", value: discussionFocus },
          { label: "Preferred Time", value: preferredTime },
          { label: "Submitted", value: submittedAt },
          { label: "Source Page", value: pageUrl },
        ],
        "Request Details",
      ),
    ].join(""),
    securityBody:
      "This internal notification contains submitted contact details and should be handled by authorised Arch9 team members only.",
    helpBody:
      "Reply to this email if ownership or routing needs to change.",
    organisationName: "Arch9",
  });
}

export async function handleArch9LaunchConfirmationEmail(
  payload: SendArch9LaunchConfirmationPayload,
) {
  const emailsEnabled = envEnabled(Deno.env.get("ARCH9_LAUNCH_CONFIRMATION_EMAILS_ENABLED"), true);
  const recipientEmail = normalizeText(payload.to).toLowerCase();

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: "arch9_launch_confirmation",
      sent: false,
      suppressed: true,
      reason: "arch9_launch_confirmation_emails_disabled",
      recipientEmail,
    });
  }

  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const from = normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 Concierge <onboarding@resend.dev>";
  const replyTo = normalizeText(Deno.env.get("ARCH9_REPLY_TO_EMAIL"));
  const recipientName = normalizeText(payload.recipientName || payload.recipient_name);
  const roleType = normalizeText(payload.roleType || payload.role_type);
  const discussionFocus = normalizeText(payload.discussionFocus || payload.discussion_focus);
  const preferredTime = normalizeText(payload.preferredTime || payload.preferred_time);

  const html = renderEmailHtml({
    recipientName,
    roleType,
    discussionFocus,
    preferredTime,
  });
  const text = [
    recipientName ? `Hi ${recipientName},` : "Hi,",
    "",
    "Thank you. We’ll be in contact shortly.",
    "",
    "We’ve received your request for a private Arch9 strategy session.",
    "Our team will review your details and come back to you with a time that suits your schedule.",
    "",
    roleType ? `Profile: ${roleType}` : "",
    discussionFocus ? `Focus: ${discussionFocus}` : "",
    preferredTime ? `Preferred time: ${preferredTime}` : "",
    "",
    "Arch9 Concierge",
  ].filter(Boolean).join("\n");

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject: "Thank you for your Arch9 request",
    html,
    text,
    replyTo: replyTo || undefined,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the Arch9 launch confirmation email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "arch9_launch_confirmation",
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}

export async function handleArch9LaunchInternalNotificationEmail(
  payload: SendArch9LaunchInternalNotificationPayload,
) {
  const emailsEnabled = envEnabled(Deno.env.get("ARCH9_LAUNCH_INTERNAL_EMAILS_ENABLED"), true);
  const requestType = normalizeText(payload.type).toLowerCase();
  const source = normalizeText(payload.source).toLowerCase();
  const isTrainingRequest = requestType === "arch9_training_request" ||
    requestType === "partner_training_request" ||
    source.includes("training");
  const fallbackTrainingRecipient = normalizeText(
    Deno.env.get("ARCH9_TRAINING_REQUEST_EMAIL") ||
      Deno.env.get("ARCH9_LAUNCH_INTERNAL_EMAIL") ||
      Deno.env.get("BRIDGE_SUPPORT_EMAIL") ||
      "support@arch9.co.za",
  );
  const recipientEmail = (normalizeText(payload.to) || (isTrainingRequest ? fallbackTrainingRecipient : "")).toLowerCase();

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: "arch9_launch_internal_notification",
      sent: false,
      suppressed: true,
      reason: "arch9_launch_internal_emails_disabled",
      recipientEmail,
    });
  }

  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const from = normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 Concierge <onboarding@resend.dev>";
  const replyTo = normalizeText(payload.email) ||
    normalizeText(Deno.env.get("ARCH9_REPLY_TO_EMAIL"));
  const fullName = normalizeText(payload.fullName || payload.full_name);
  const email = normalizeText(payload.email || "");
  const phone = normalizeText(payload.phone || "");
  const company = normalizeText(payload.company || "");
  const roleType = normalizeText(payload.roleType || payload.role_type);
  const discussionFocus = normalizeText(payload.discussionFocus || payload.discussion_focus);
  const preferredTime = normalizeText(payload.preferredTime || payload.preferred_time);
  const note = normalizeText(payload.note || "");
  const pageUrl = normalizeText(payload.pageUrl || payload.page_url);
  const submittedAt = normalizeText(payload.submittedAt || payload.submitted_at);
  const requestLabel = isTrainingRequest ? "Free training request" : "New concierge request";
  const requestHeading = isTrainingRequest
    ? `${fullName || company || "A partner contact"} requested free Arch9 training.`
    : "";
  const requestBody = isTrainingRequest
    ? "They accepted or reviewed a partner connection and asked the Arch9 team to help onboard their company."
    : "";
  const hiddenSummary = isTrainingRequest
    ? `Free Arch9 training request from ${fullName || company || "a partner contact"}.`
    : "";

  const html = renderInternalNotificationHtml({
    fullName,
    email,
    phone,
    company,
    roleType,
    discussionFocus,
    preferredTime,
    note,
    pageUrl,
    submittedAt,
    requestLabel,
    requestHeading,
    requestBody,
    hiddenSummary,
  });
  const text = [
    isTrainingRequest
      ? `Free Arch9 training request: ${fullName || company || "Partner contact"}`
      : `New Arch9 launch concierge request: ${fullName || "Launch guest"}`,
    "",
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    company ? `Company: ${company}` : "",
    roleType ? `Profile: ${roleType}` : "",
    discussionFocus ? `Focus: ${discussionFocus}` : "",
    preferredTime ? `Preferred time: ${preferredTime}` : "",
    note ? `Note: ${note}` : "",
    submittedAt ? `Submitted: ${submittedAt}` : "",
    pageUrl ? `Source page: ${pageUrl}` : "",
  ].filter(Boolean).join("\n");

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject: isTrainingRequest
      ? `Free Arch9 training request${company ? `: ${company}` : fullName ? `: ${fullName}` : ""}`
      : `New Arch9 request${fullName ? `: ${fullName}` : ""}`,
    html,
    text,
    replyTo: replyTo || undefined,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the Arch9 internal notification email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: requestType || "arch9_launch_internal_notification",
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
