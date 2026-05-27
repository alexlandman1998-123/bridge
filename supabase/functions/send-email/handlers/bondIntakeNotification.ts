import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendBondIntakeNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function envEnabled(value: string | undefined, fallback = false) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

export async function handleBondIntakeNotificationEmail(
  payload: SendBondIntakeNotificationPayload,
) {
  const emailsEnabled = envEnabled(Deno.env.get("BOND_INTAKE_EMAILS_ENABLED"), false);
  const transactionId = normalizeText(payload.transactionId);
  const recipientEmail = normalizeText(payload.to).toLowerCase();

  if (!emailsEnabled) {
    return jsonResponse(200, {
      ok: true,
      type: "bond_intake_notification",
      sent: false,
      suppressed: true,
      reason: "bond_intake_emails_disabled",
      transactionId,
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
  const subject = normalizeText(payload.subject) || "Bond application update";
  const title = normalizeText(payload.title) || "Bond application update";
  const recipientName = normalizeText(payload.recipientName) || "there";
  const message = normalizeText(payload.message) ||
    "There is an update on a bond application in Bridge.";
  const metadata = payload.metadata && typeof payload.metadata === "object"
    ? payload.metadata
    : {};

  const fields = [
    { label: "Transaction", value: transactionId },
    { label: "Buyer", value: normalizeText(metadata.buyerName as string) },
    { label: "Property", value: normalizeText(metadata.propertyLabel as string) },
  ].filter((field) => field.value);

  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(fields, "Application Summary"),
    ].join(""),
    securityBody:
      "Bond application information is available only to authorised parties on the transaction.",
    helpBody:
      "Please open Bridge to review the application and continue with the next action.",
    organisationName: "Bridge",
  });

  const text = [
    `Hi ${recipientName},`,
    "",
    message,
    transactionId ? `Transaction: ${transactionId}` : "",
    "",
    "Please open Bridge to review the application and continue with the next action.",
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
      error: "Resend rejected the bond intake email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "bond_intake_notification",
    sent: true,
    transactionId,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
