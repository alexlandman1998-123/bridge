import type { SendOfferDecisionNotificationPayload } from "../types.ts";
import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function formatDecision(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "accepted") return "Accepted";
  if (normalized === "countered") return "Counter Requested";
  if (normalized === "rejected") return "Rejected";
  return "Updated";
}

export async function handleOfferDecisionNotificationEmail(payload: SendOfferDecisionNotificationPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const decisionLabel = formatDecision(normalizeText(payload.decision));
  const recipientName = normalizeText(payload.recipientName) || "there";
  const recipientRole = normalizeText(payload.recipientRole).toLowerCase();
  const propertyTitle = normalizeText(payload.propertyTitle) || "the property";
  const buyerName = normalizeText(payload.buyerName) || "the buyer";
  const sellerName = normalizeText(payload.sellerName) || "the seller";
  const agentName = normalizeText(payload.agentName);
  const offerAmount = normalizeText(payload.offerAmount);
  const decisionNotes = normalizeText(payload.decisionNotes);
  const nextStep = normalizeText(payload.nextStep) ||
    (recipientRole === "buyer"
      ? "Your agent will contact you with the next step."
      : "Open Bridge to continue the offer workflow.");
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

  const subject = `Offer ${decisionLabel}: ${propertyTitle}`;
  const intro = recipientRole === "buyer"
    ? [
        `${sellerName} has accepted your offer for ${propertyTitle}.`,
        "Your agent will confirm the accepted offer and send the buyer onboarding link.",
      ]
    : [
        `${sellerName} has marked the offer from ${buyerName} as ${decisionLabel.toLowerCase()}.`,
        nextStep,
      ];

  const contentHtml = [
    renderBridgeIntroParagraphs([
      ...intro,
      decisionNotes ? `Seller note: ${decisionNotes}` : "",
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyTitle },
        { label: "Buyer", value: buyerName },
        { label: "Seller Decision", value: decisionLabel },
        { label: "Offer Amount", value: offerAmount },
        { label: "Agent", value: agentName },
      ],
      "Offer Decision Summary",
    ),
  ].join("");

  const html = renderBridgeEmailLayout({
    preheader: `Seller decision recorded: ${decisionLabel} for ${propertyTitle}.`,
    title: `Offer ${decisionLabel}`,
    greeting: `Hi ${recipientName},`,
    contentHtml,
    securityTitle: "Offer Workflow Updated",
    securityBody: "This decision was recorded through Bridge and linked to the canonical buyer offer record.",
    helpBody: nextStep,
    organisationName,
    supportEmail,
    supportPhone,
  });

  const text = [
    `Hi ${recipientName},`,
    "",
    ...intro,
    "",
    `Property: ${propertyTitle}`,
    `Buyer: ${buyerName}`,
    `Seller decision: ${decisionLabel}`,
    offerAmount ? `Offer amount: ${offerAmount}` : null,
    agentName ? `Agent: ${agentName}` : null,
    decisionNotes ? `Seller note: ${decisionNotes}` : null,
    "",
    nextStep,
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
      error: emailResult.error?.message || "Failed to send offer decision notification.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "offer_decision_notification",
    emailId: emailResult.data?.id || null,
  });
}
