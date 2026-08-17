import type { SendSellerViewingAvailabilityRequestPayload } from "../types.ts";
import {
  buildSellerViewingAvailabilityRequestEmailHtml,
  buildSellerViewingAvailabilityRequestEmailText,
  type SellerViewingAvailabilityRequestProperty,
} from "../content/sellerViewingAvailabilityRequest.ts";
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
import { assessControlledTestRecipient } from "../utils/controlledTestRecipient.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function normalizeEmailList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [
    ...new Set(values.flatMap((entry) =>
      String(entry || "")
        .split(/[,;\n]/)
        .map((email) => normalizeText(email).toLowerCase())
        .filter(Boolean)
    )),
  ];
}

function normalizeProperties(
  value: unknown,
): SellerViewingAvailabilityRequestProperty[] {
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
        sellerViewingAvailability: normalizeText(
          row.sellerViewingAvailability || row.seller_viewing_availability,
        ),
        sellerViewingAvailabilityWindows: normalizeText(
          row.sellerViewingAvailabilityWindows ||
            row.seller_viewing_availability_windows,
        ),
        sellerViewingAccessInstructions: normalizeText(
          row.sellerViewingAccessInstructions ||
            row.seller_viewing_access_instructions,
        ),
        sellerViewingNoticePeriod: normalizeText(
          row.sellerViewingNoticePeriod || row.seller_viewing_notice_period,
        ),
        sellerViewingNoticeRequired: row.sellerViewingNoticeRequired === true ||
          row.seller_viewing_notice_required === true,
      };
    });
}

export async function handleSellerViewingAvailabilityRequestEmail(
  payload: SendSellerViewingAvailabilityRequestPayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const recipients = normalizeEmailList(payload.to || payload.recipients);
  if (!recipients.length) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const sellerName =
    normalizeText(payload.sellerName || payload.recipientName) ||
    "there";
  const buyerName = normalizeText(payload.buyerName) || "the buyer";
  const agentName = normalizeText(payload.agentName) || "your agent";
  const agentEmail = normalizeText(payload.agentEmail).toLowerCase();
  const availabilityWindows = normalizeText(payload.availabilityWindows);
  const coordinationNotes = normalizeText(
    payload.coordinationNotes || payload.note || payload.message,
  );
  const actionLink = normalizeText(
    payload.actionLink || payload.action_link ||
      payload.sellerCoordinationLink || payload.seller_coordination_link,
  );
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
      ? `Viewing access request for ${propertyCount} properties`
      : `Viewing access request from ${branding.organisationName}`);
  const html = buildSellerViewingAvailabilityRequestEmailHtml({
    sellerName,
    buyerName,
    agentName,
    properties,
    availabilityWindows,
    coordinationNotes,
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail || supportEmail,
    supportPhone: branding.supportPhone || supportPhone,
    actionLink,
    branding,
  });
  const text = buildSellerViewingAvailabilityRequestEmailText({
    sellerName,
    buyerName,
    agentName,
    properties,
    availabilityWindows,
    coordinationNotes,
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail || supportEmail,
    supportPhone: branding.supportPhone || supportPhone,
    actionLink,
  });
  const baseIdempotencyKey = normalizeText(
    payload.idempotencyKey || payload.idempotency_key,
  );

  const results = [];
  for (const recipient of recipients) {
    const recipientSafety = assessControlledTestRecipient({
      email: recipient,
      recipientName: sellerName,
      metadata: rawPayload.metadata,
    });
    if (recipientSafety.suppressed) {
      results.push({
        recipient,
        ok: true,
        suppressed: true,
        suppressionReason: recipientSafety.reason,
        deliveryId: null,
        emailId: null,
        providerMessageId: null,
      });
      continue;
    }

    const delivery = await prepareEmailDelivery(
      {
        ...(payload as Record<string, unknown>),
        to: recipient,
      },
      {
        communicationType: "seller_viewing_availability_request",
        recipient,
        recipientRole: "seller",
        subject,
        messagePreview: text,
      },
    );

    const emailResult = await sendViaResendApi({
      apiKey: resendApiKey,
      from: sender,
      to: recipient,
      bcc: agentEmail,
      subject,
      html,
      text,
      replyTo: agentEmail || branding.supportEmail || supportEmail || undefined,
      idempotencyKey: baseIdempotencyKey
        ? `${baseIdempotencyKey}:${recipient}`
        : undefined,
    });

    if (!emailResult.ok) {
      await markEmailDeliveryFailed(delivery?.id || "", {
        errorMessage: emailResult.error?.message ||
          "Failed to send seller viewing availability request.",
      });
      results.push({
        recipient,
        ok: false,
        deliveryId: delivery?.id || null,
        error: emailResult.error?.message ||
          "Failed to send seller viewing availability request.",
      });
      continue;
    }

    await markEmailDeliverySent(delivery?.id || "", {
      emailId: emailResult.data?.id || null,
    });
    results.push({
      recipient,
      ok: true,
      deliveryId: delivery?.id || null,
      emailId: emailResult.data?.id || null,
      providerMessageId: emailResult.data?.id || null,
    });
  }

  const sentResults = results.filter((result) => result.ok);
  const providerSentResults = results.filter((result) =>
    result.ok && !result.suppressed
  );
  const suppressedResults = results.filter((result) => result.suppressed);
  const failedResults = results.filter((result) => !result.ok);
  if (!sentResults.length) {
    return jsonResponse(500, {
      error: failedResults[0]?.error ||
        "Failed to send seller viewing availability request.",
      type: "seller_viewing_availability_request",
      sentCount: 0,
      failedCount: failedResults.length,
      results,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_viewing_availability_request",
    sentCount: providerSentResults.length,
    suppressedCount: suppressedResults.length,
    failedCount: failedResults.length,
    deliveryIds: providerSentResults.map((result) => result.deliveryId).filter(
      Boolean,
    ),
    emailIds: providerSentResults.map((result) => result.emailId).filter(
      Boolean,
    ),
    providerMessageIds: providerSentResults
      .map((result) => result.providerMessageId)
      .filter(Boolean),
    results,
  });
}
