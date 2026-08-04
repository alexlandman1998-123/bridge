import type { SendBuyerViewingAvailabilityRequestPayload } from "../types.ts";
import {
  buildBuyerViewingAvailabilityRequestEmailHtml,
  buildBuyerViewingAvailabilityRequestEmailText,
  type ViewingAvailabilityRequestProperty,
} from "../content/viewingAvailabilityRequest.ts";
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
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function normalizeProperties(
  value: unknown,
): ViewingAvailabilityRequestProperty[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((property) => property && typeof property === "object")
    .map((property) => {
      const row = property as Record<string, unknown>;
      return {
        title: normalizeText(row.title || row.name || row.address),
        price: normalizeText(row.price || row.priceLabel),
        area: normalizeText(row.area || row.suburb || row.location),
        match: normalizeText(row.match || row.matchLabel),
        link: normalizeText(row.link || row.url),
      };
    });
}

export async function handleBuyerViewingAvailabilityRequestEmail(
  payload: SendBuyerViewingAvailabilityRequestPayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to).toLowerCase();
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const buyerName = normalizeText(payload.buyerName || payload.recipientName) ||
    "there";
  const agentName = normalizeText(payload.agentName) || "your agent";
  const agentEmail = normalizeText(payload.agentEmail).toLowerCase();
  const note = normalizeText(payload.note || payload.message);
  const properties = normalizeProperties(payload.properties);
  const organisationName = normalizeText(payload.organisationName) ||
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Arch9";
  const supportEmail = normalizeText(payload.supportEmail) ||
    agentEmail ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL"));
  const supportPhone = normalizeText(payload.supportPhone) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE"));
  const rawPayload = payload as Record<string, unknown>;
  const branding = await resolveEmailBranding({
    payload: rawPayload,
    organisationId: normalizeText(
      rawPayload.organisationId || rawPayload.organisation_id,
    ),
    defaults: { organisationName, supportEmail, supportPhone },
  });
  const sender = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <onboarding@resend.dev>",
    branding.fromName || branding.organisationName,
  );
  const propertyCount = properties.length || Number(payload.propertyCount || 0);
  const subject = normalizeText(payload.subject) ||
    (propertyCount > 1
      ? `Viewing options from ${branding.organisationName}`
      : `Viewing availability request from ${branding.organisationName}`);
  const html = buildBuyerViewingAvailabilityRequestEmailHtml({
    buyerName,
    agentName,
    properties,
    note,
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail || supportEmail,
    supportPhone: branding.supportPhone || supportPhone,
    branding,
  });
  const text = buildBuyerViewingAvailabilityRequestEmailText({
    buyerName,
    agentName,
    properties,
    note,
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail || supportEmail,
    supportPhone: branding.supportPhone || supportPhone,
  });

  const delivery = await prepareEmailDelivery(
    payload as Record<string, unknown>,
    {
      communicationType: "buyer_viewing_availability_request",
      recipient: to,
      recipientRole: "buyer",
      subject,
      messagePreview: text,
    },
  );

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
    replyTo: agentEmail || branding.supportEmail || supportEmail || undefined,
    idempotencyKey:
      normalizeText(payload.idempotencyKey || payload.idempotency_key) ||
      undefined,
  });

  if (!emailResult.ok) {
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage: emailResult.error?.message ||
        "Failed to send buyer viewing availability request.",
    });
    return jsonResponse(500, {
      error: emailResult.error?.message ||
        "Failed to send buyer viewing availability request.",
      details: emailResult.error,
      deliveryId: delivery?.id || null,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "buyer_viewing_availability_request",
    emailId: emailResult.data?.id || null,
    providerMessageId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
  });
}
