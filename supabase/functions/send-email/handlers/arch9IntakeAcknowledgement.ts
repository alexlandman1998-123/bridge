import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendArch9IntakeAcknowledgementPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function normalizeEmail(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0] || "";
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  const text = normalizeText(value);
  return text ? [text] : [];
}

export async function handleArch9IntakeAcknowledgementEmail(
  payload: SendArch9IntakeAcknowledgementPayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeEmail(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const firstName = firstText(payload.firstName, payload.first_name);
  const lastName = firstText(payload.lastName, payload.last_name);
  const recipientName = firstText(
    payload.recipientName,
    payload.recipient_name,
    [firstName, lastName].filter(Boolean).join(" "),
  );
  const organisationName = firstText(
    payload.organisationName,
    payload.organisation_name,
  );
  const roleLabel = firstText(payload.roleLabel, payload.role_label);
  const interests = normalizeList(payload.interests);
  const from = normalizeText(Deno.env.get("ARCH9_RESEND_FROM_EMAIL")) ||
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  const replyTo = normalizeEmail(
    payload.replyTo || payload.reply_to ||
      Deno.env.get("ARCH9_INTAKE_REPLY_TO_EMAIL"),
  );
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    defaults: {
      organisationName: "Arch9",
      fromName: "Arch9",
      replyTo,
      primaryColor: "#004d3e",
      secondaryColor: "#6bd6b3",
      supportEmail: replyTo,
    },
  });
  const fields = [
    { label: "Role", value: roleLabel },
    { label: "Organisation", value: organisationName },
    { label: "Top interests", value: interests.join(", ") },
  ].filter((field) => field.value);
  const contentHtml = [
    renderBridgeIntroParagraphs([
      "Thanks for telling us where you fit into the property journey.",
      "We've received your details and the Arch9 team will review your intake shortly.",
      "We'll take a look and be in touch shortly to get you connected.",
    ]),
    fields.length ? renderBridgeSummaryCard(fields, "Your Intake") : "",
  ].join("");

  const html = renderBridgeEmailLayout({
    preheader: "We've received your Arch9 intake.",
    title: "You're in.",
    greeting: `Hi ${recipientName || "there"},`,
    contentHtml,
    securityBody:
      "Your details are shared only with the Arch9 team handling your enquiry.",
    helpBody:
      "Questions in the meantime? Reply to this email and we'll help.",
    organisationName: "Arch9",
    supportEmail: replyTo,
    branding,
  });
  const text = [
    `Hi ${recipientName || "there"},`,
    "",
    "Thanks for telling us where you fit into the property journey.",
    "We've received your details and the Arch9 team will review your intake shortly.",
    "We'll take a look and be in touch shortly to get you connected.",
    "",
    roleLabel ? `Role: ${roleLabel}` : "",
    organisationName ? `Organisation: ${organisationName}` : "",
    interests.length ? `Top interests: ${interests.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: formatEmailSender(from, "Arch9"),
    to,
    subject: normalizeText(payload.subject) || "You're in - Arch9 intake received",
    html,
    text,
    replyTo: replyTo || undefined,
    idempotencyKey:
      normalizeText(payload.idempotencyKey || payload.idempotency_key) ||
      undefined,
  });

  if (!emailResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the Arch9 intake acknowledgement email.",
      details: emailResult.error,
      status: emailResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "arch9_intake_acknowledgement",
    sent: true,
    provider: "resend",
    providerMessageId: emailResult.data?.id || null,
  });
}
