import type { SendSellerOfferReviewPayload } from "../types.ts";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleSellerOfferReviewEmail(payload: SendSellerOfferReviewPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const reviewLink = normalizeText(payload.reviewLink);
  if (!reviewLink) {
    return jsonResponse(400, { error: "Missing required field: reviewLink" });
  }

  const sellerName = normalizeText(payload.sellerName) || "there";
  const propertyTitle = normalizeText(payload.propertyTitle) || "your property";
  const buyerName = normalizeText(payload.buyerName) || "the buyer";
  const offerAmount = normalizeText(payload.offerAmount);
  const agentName = normalizeText(payload.agentName);
  const expiresAt = normalizeText(payload.expiresAt);
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

  const subject = `Offer received for ${propertyTitle}`;
  const introParagraphs = [
    `${agentName || "Your agent"} has sent you a buyer offer to review for ${propertyTitle}.`,
    "Open the secure review link below to view the offer and record your decision.",
    note ? `Agent note: ${note}` : "",
  ];
  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyTitle },
        { label: "Buyer", value: buyerName },
        { label: "Offer Amount", value: offerAmount },
        { label: "Agent", value: agentName },
        { label: "Link Expires", value: expiresAt },
      ],
      "Offer Review Summary",
    ),
    renderBridgeCta("Review Buyer Offer", reviewLink),
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: `A buyer offer is ready for seller review on ${propertyTitle}.`,
    title: "Buyer Offer Ready For Review",
    greeting: `Hi ${sellerName},`,
    contentHtml,
    securityTitle: "Secure Seller Review",
    securityBody: "Your offer review link is shared through Bridge so the offer decision stays connected to the listing, buyer lead, and transaction workflow.",
    helpBody: "Need help? Reply to this email or contact your agent before making a decision.",
    organisationName,
    supportEmail,
    supportPhone,
  });
  const text = [
    `Hi ${sellerName},`,
    "",
    `${agentName || "Your agent"} has sent you a buyer offer to review for ${propertyTitle}.`,
    note ? `Agent note: ${note}` : null,
    "",
    `Property: ${propertyTitle}`,
    `Buyer: ${buyerName}`,
    offerAmount ? `Offer amount: ${offerAmount}` : null,
    agentName ? `Agent: ${agentName}` : null,
    expiresAt ? `Link expires: ${expiresAt}` : null,
    "",
    "Review Buyer Offer:",
    reviewLink,
    "",
    "Need help? Reply to this email or contact your agent before making a decision.",
    "",
    organisationName,
    "Powered by Bridge",
  ].filter(Boolean).join("\n");

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
      error: emailResult.error?.message || "Failed to send seller offer review email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_offer_review",
    emailId: emailResult.data?.id || null,
  });
}
