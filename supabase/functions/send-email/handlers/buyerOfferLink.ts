import type { SendBuyerOfferLinkPayload } from "../types.ts";
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

export async function handleBuyerOfferLinkEmail(payload: SendBuyerOfferLinkPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const offerLink = normalizeText(payload.offerLink);
  if (!offerLink) {
    return jsonResponse(400, { error: "Missing required field: offerLink" });
  }

  const buyerName = normalizeText(payload.buyerName) || "there";
  const propertyTitle = normalizeText(payload.propertyTitle);
  const propertyCount = Number.isFinite(payload.propertyCount) ? Number(payload.propertyCount) : 0;
  const agentName = normalizeText(payload.agentName);
  const expiresAt = normalizeText(payload.expiresAt);
  const note = normalizeText(payload.note);
  const organisationName =
    normalizeText(payload.organisationName) ||
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Arch9";
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
    "Arch9 <onboarding@resend.dev>";

  const propertyLabel = propertyTitle ||
    (propertyCount > 1 ? `${propertyCount} viewed properties` : "the property you viewed");
  const subject = `Your secure offer link${propertyTitle ? ` for ${propertyTitle}` : ""}`;
  const introParagraphs = [
    propertyCount > 1
      ? `Your agent has prepared a secure offer portal for the properties you viewed.`
      : `Your agent has prepared a secure offer link for ${propertyLabel}.`,
    "Open the link below when you are ready to review the details and start an offer.",
    note ? `Agent note: ${note}` : "",
  ];
  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    renderBridgeSummaryCard(
      [
        { label: propertyCount > 1 ? "Viewed Properties" : "Property", value: propertyLabel },
        { label: "Agent", value: agentName },
        { label: "Link Expires", value: expiresAt },
      ],
      "Offer Link Summary",
    ),
    renderBridgeCta("Open Secure Offer Link", offerLink),
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: `Your secure Arch9 offer link is ready for ${propertyLabel}.`,
    title: "Offer Link Ready",
    greeting: `Hi ${buyerName},`,
    contentHtml,
    securityTitle: "Secure Offer Portal",
    securityBody: "Your offer link is shared through Arch9 so your agent can keep the offer, viewing, and transaction record connected.",
    helpBody: "Need help? Reply to this email or contact your agent before submitting an offer.",
    organisationName,
    supportEmail,
    supportPhone,
  });
  const text = [
    `Hi ${buyerName},`,
    "",
    propertyCount > 1
      ? "Your agent has prepared a secure offer portal for the properties you viewed."
      : `Your agent has prepared a secure offer link for ${propertyLabel}.`,
    note ? `Agent note: ${note}` : null,
    "",
    `Property: ${propertyLabel}`,
    agentName ? `Agent: ${agentName}` : null,
    expiresAt ? `Link expires: ${expiresAt}` : null,
    "",
    "Open Secure Offer Link:",
    offerLink,
    "",
    "Need help? Reply to this email or contact your agent before submitting an offer.",
    "",
    organisationName,
    "Powered by Arch9",
  ].filter(Boolean).join("\n");

  const delivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
    communicationType: "buyer_offer_link",
    recipient: to,
    recipientRole: "buyer",
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
      errorMessage: emailResult.error?.message || "Failed to send buyer offer link email.",
    });
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send buyer offer link email.",
      details: emailResult.error,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "buyer_offer_link",
    emailId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
  });
}
