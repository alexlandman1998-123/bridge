import {
  renderBridgeBullets,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendBuyerViewingAvailabilityConfirmationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeEmail(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0] || "";
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  return normalizeText(value).split(/\r?\n/).map((item) => normalizeText(item))
    .filter(Boolean);
}

export async function handleBuyerViewingAvailabilityConfirmationEmail(
  payload: SendBuyerViewingAvailabilityConfirmationPayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeEmail(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const metadata = asRecord(payload.metadata);
  const availabilityWindows = normalizeList(
    payload.availabilityWindows || payload.availability_windows ||
      metadata.availabilityWindows,
  );
  const propertyLabels = normalizeList(
    payload.propertyLabels || payload.property_labels ||
      metadata.propertyLabels,
  );
  const buyerName = firstText(
    payload.buyerName,
    payload.buyer_name,
    payload.recipientName,
    payload.recipient_name,
  ) || "there";
  const agentName = firstText(
    payload.agentName,
    payload.agent_name,
    metadata.agentName,
  );
  const agentEmail = normalizeEmail(
    payload.agentEmail || payload.agent_email || metadata.agentEmail,
  );
  const supportEmail = firstText(payload.supportEmail, payload.support_email);
  const supportPhone = firstText(payload.supportPhone, payload.support_phone);
  const organisationName = firstText(
    payload.organisationName,
    payload.organisation_name,
    metadata.organisationName,
  ) || "Arch9";
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    organisationId: firstText(
      payload.organisationId,
      payload.organisation_id,
      metadata.organisationId,
      metadata.organisation_id,
    ),
    defaults: { organisationName, supportEmail, supportPhone },
  });
  const subject = normalizeText(payload.subject) ||
    "Thanks, we have your viewing times";
  const message = normalizeText(payload.message) ||
    "Thank you! We have your preferred viewing times. We are confirming the options with the seller and will confirm shortly.";
  const followUpMessage = firstText(
    payload.followUpMessage,
    payload.follow_up_message,
    metadata.followUpMessage,
    metadata.follow_up_message,
  ) ||
    (agentName
      ? `${agentName} will come back to you as soon as the seller confirms access.`
      : "Your agent will come back to you as soon as the seller confirms access.");
  const title = normalizeText(payload.title) || "Viewing Times Received";
  const preheader = normalizeText(payload.preheader) ||
    "Thank you - we have your preferred viewing times.";
  const contentHtml = [
    renderBridgeIntroParagraphs([
      message,
      followUpMessage,
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyLabels.join(", ") },
        { label: "Agent", value: agentName || agentEmail },
      ],
      "Viewing Request",
    ),
    availabilityWindows.length ? renderBridgeBullets(availabilityWindows) : "",
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader,
    title,
    greeting: `Hi ${buyerName},`,
    contentHtml,
    securityBody:
      "Your viewing preferences are shared with the property team handling your enquiry.",
    helpBody:
      "Need to change anything? Reply to this email and your agent will help.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
  const text = [
    `Hi ${buyerName},`,
    "",
    message,
    followUpMessage,
    "",
    propertyLabels.length ? `Property: ${propertyLabels.join(", ")}` : "",
    availabilityWindows.length ? "Your selected times:" : "",
    ...availabilityWindows.map((item) => `- ${item}`),
    "",
    "Need to change anything? Reply to this email and your agent will help.",
    "",
    branding.organisationName,
  ].filter(Boolean).join("\n");

  const delivery = await prepareEmailDelivery(
    payload as Record<string, unknown>,
    {
      communicationType: "buyer_viewing_availability_confirmation",
      recipient: to,
      recipientRole: "buyer",
      subject,
      messagePreview: text,
      context: {
        organisationId: firstText(
          payload.organisationId,
          payload.organisation_id,
        ),
        leadId: firstText(payload.leadId, payload.lead_id),
        listingId: firstText(payload.listingId, payload.listing_id),
        metadata: {
          source: "buyer_viewing_preferences",
          availabilityWindows,
          propertyLabels,
        },
      },
    },
  );

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: formatEmailSender(
      normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
        "Arch9 <no-reply@arch9.co.za>",
      branding.fromName || branding.organisationName,
    ),
    to,
    bcc: agentEmail,
    subject,
    html,
    text,
    replyTo: agentEmail || branding.replyTo || branding.supportEmail ||
      undefined,
    idempotencyKey:
      normalizeText(payload.idempotencyKey || payload.idempotency_key) ||
      undefined,
  });

  if (!emailResult.ok) {
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage: emailResult.error?.message ||
        "Failed to send buyer viewing availability confirmation.",
    });
    return jsonResponse(502, {
      error: "Resend rejected the buyer viewing confirmation email.",
      details: emailResult.error,
      status: emailResult.status,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "buyer_viewing_availability_confirmation",
    sent: true,
    provider: "resend",
    providerResponse: emailResult.data,
    deliveryId: delivery?.id || null,
  });
}
