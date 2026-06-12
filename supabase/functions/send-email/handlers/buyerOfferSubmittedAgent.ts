import type { SendBuyerOfferSubmittedAgentPayload } from "../types.ts";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleBuyerOfferSubmittedAgentEmail(payload: SendBuyerOfferSubmittedAgentPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const agentName = normalizeText(payload.agentName) || "there";
  const buyerName = normalizeText(payload.buyerName) || "A buyer";
  const propertyTitle = normalizeText(payload.propertyTitle) || "the viewed property";
  const offerAmount = normalizeText(payload.offerAmount);
  const financeType = normalizeText(payload.financeType);
  const offerSubmittedAt = normalizeText(payload.offerSubmittedAt);
  const agentReviewUrl = normalizeText(payload.agentReviewUrl);
  const note = normalizeText(payload.note);
  const organisationName =
    normalizeText(payload.organisationName) ||
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Bridge";
  const supportEmail =
    normalizeText(payload.supportEmail) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL"));
  const supportPhone =
    normalizeText(payload.supportPhone) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE"));
  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject = `Buyer offer submitted: ${propertyTitle}`;
  const contentHtml = [
    renderBridgeIntroParagraphs([
      `${buyerName} submitted an offer for ${propertyTitle}.`,
      "Review the offer in Bridge before sending it to the seller.",
      note ? `Buyer note: ${note}` : "",
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyTitle },
        { label: "Buyer", value: buyerName },
        { label: "Offer Amount", value: offerAmount },
        { label: "Finance Type", value: financeType },
        { label: "Submitted", value: offerSubmittedAt },
      ],
      "Buyer Offer Summary",
    ),
    agentReviewUrl ? renderBridgeCta("Review Offer In Bridge", agentReviewUrl) : "",
  ].join("");

  const html = renderBridgeEmailLayout({
    preheader: `${buyerName} submitted an offer for ${propertyTitle}.`,
    title: "Buyer Offer Submitted",
    greeting: `Hi ${agentName},`,
    contentHtml,
    securityTitle: "Canonical Offer Record",
    securityBody: "This submission has been captured as a canonical Bridge offer and linked to the buyer lead, viewing, and listing where available.",
    helpBody: "Open Bridge to review the offer and send it to the seller when ready.",
    organisationName,
    supportEmail,
    supportPhone,
  });

  const text = [
    `Hi ${agentName},`,
    "",
    `${buyerName} submitted an offer for ${propertyTitle}.`,
    "",
    `Property: ${propertyTitle}`,
    `Buyer: ${buyerName}`,
    offerAmount ? `Offer amount: ${offerAmount}` : null,
    financeType ? `Finance type: ${financeType}` : null,
    offerSubmittedAt ? `Submitted: ${offerSubmittedAt}` : null,
    note ? `Buyer note: ${note}` : null,
    agentReviewUrl ? `Review offer: ${agentReviewUrl}` : null,
    "",
    "Review the offer in Bridge before sending it to the seller.",
    "",
    organisationName,
    "Powered by Bridge",
  ].filter(Boolean).join("\n");

  const delivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
    communicationType: "buyer_offer_submitted_agent",
    recipient: to,
    recipientRole: "agent",
    subject,
    messagePreview: text,
  });

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
  });

  if (!emailResult.ok) {
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage:
        emailResult.error?.message ||
        "Failed to send buyer offer submitted notification.",
    });
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send buyer offer submitted notification.",
      details: emailResult.error,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "buyer_offer_submitted_agent",
    emailId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
  });
}
