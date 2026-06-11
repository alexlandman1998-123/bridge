import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendCommercialAccessNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function envEnabled(value: string | undefined, fallback = true) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function resolveActionLabel(eventKind: string, decision: string) {
  if (eventKind === "decision" && decision === "approved") return "Open Commercial";
  if (eventKind === "decision") return "Open Bridge";
  return "Review Request";
}

export async function handleCommercialAccessNotificationEmail(
  payload: SendCommercialAccessNotificationPayload,
) {
  const emailsEnabled = envEnabled(Deno.env.get("COMMERCIAL_ACCESS_EMAILS_ENABLED"), true);
  const recipientEmail = normalizeText(payload.to).toLowerCase();
  const eventKind = normalizeText(payload.eventKind || payload.event_kind).toLowerCase();
  const decision = normalizeText(payload.decision).toLowerCase();

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: "commercial_access_notification",
      sent: false,
      suppressed: true,
      reason: "commercial_access_emails_disabled",
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

  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <no-reply@bridge9.app>";
  const recipientName = normalizeText(payload.recipientName || payload.recipient_name) || "there";
  const requesterName = normalizeText(payload.requesterName || payload.requester_name) || "A workspace user";
  const requesterEmail = normalizeText(payload.requesterEmail || payload.requester_email);
  const organisationName = normalizeText(payload.organisationName || payload.organisation_name) || "your Bridge workspace";
  const actionLink = normalizeText(payload.actionLink || payload.action_link);

  const isDecision = eventKind === "decision";
  const isReminder = eventKind === "reminder";
  const approved = decision === "approved";
  const title = isDecision
    ? approved
      ? "Commercial access approved"
      : "Commercial access request reviewed"
    : isReminder
      ? "Commercial access reminder"
      : "Commercial access requested";
  const subject = normalizeText(payload.subject) || `${title} - ${organisationName}`;
  const message = normalizeText(payload.message) || (isDecision
    ? approved
      ? "Your principal approved Commercial access. You can open the Commercial workspace now."
      : "Your principal reviewed your Commercial access request. Contact them if you need more detail."
    : isReminder
      ? `${requesterName} is still waiting for Commercial workspace access approval.`
    : `${requesterName} requested access to the Commercial workspace.`);

  const summary = [
    { label: "Workspace", value: organisationName },
    { label: "Requester", value: requesterName },
    { label: "Requester Email", value: requesterEmail },
    { label: "Decision", value: isDecision ? decision || "reviewed" : "" },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(summary, "Commercial Access"),
      renderBridgeCta(resolveActionLabel(eventKind, decision), actionLink),
    ].join(""),
    securityBody:
      "Commercial workspace access can only be approved by authorised principals and workspace administrators.",
    helpBody:
      "Open Bridge to review Commercial access and keep workspace permissions aligned with your brokerage process.",
    organisationName,
  });

  const text = [
    `Hi ${recipientName},`,
    "",
    message,
    organisationName ? `Workspace: ${organisationName}` : "",
    requesterName ? `Requester: ${requesterName}` : "",
    requesterEmail ? `Requester Email: ${requesterEmail}` : "",
    actionLink ? `Open Bridge: ${actionLink}` : "",
  ].filter(Boolean).join("\n");

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject,
    html,
    text,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the Commercial access email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "commercial_access_notification",
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
