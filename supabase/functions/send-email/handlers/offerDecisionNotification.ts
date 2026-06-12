import type { SendOfferDecisionNotificationPayload } from "../types.ts";
import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
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

function formatDecision(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "accepted") return "Accepted";
  if (normalized === "countered") return "Counter Requested";
  if (normalized === "rejected") return "Rejected";
  return "Updated";
}

export async function handleOfferDecisionNotificationEmail(
  payload: SendOfferDecisionNotificationPayload,
) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const decisionKey = normalizeText(payload.decision).toLowerCase();
  const decisionLabel = formatDecision(decisionKey);
  const recipientName = normalizeText(payload.recipientName) || "there";
  const recipientRole = normalizeText(payload.recipientRole).toLowerCase();
  const isBuyerRecipient = recipientRole === "buyer";
  const isAcceptedBuyerNotification = isBuyerRecipient &&
    decisionKey === "accepted";
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
  const organisationName = normalizeText(payload.organisationName) ||
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Bridge";
  const supportEmail = normalizeText(payload.supportEmail) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL"));
  const supportPhone = normalizeText(payload.supportPhone) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE"));
  const sender = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject = isAcceptedBuyerNotification
    ? `Congratulations, the seller accepted your offer: ${propertyTitle}`
    : `Offer ${decisionLabel}: ${propertyTitle}`;
  const intro = isAcceptedBuyerNotification
    ? [
      `Congratulations, ${sellerName} has accepted your offer for ${propertyTitle}.`,
      "This is an exciting step. Bridge will help keep the next part of the journey clear, coordinated, and easy to follow.",
    ]
    : isBuyerRecipient
    ? [
      `The seller decision for your offer on ${propertyTitle} is: ${decisionLabel}.`,
      nextStep,
    ]
    : [
      `${sellerName} has marked the offer from ${buyerName} as ${decisionLabel.toLowerCase()}.`,
      nextStep,
    ];
  const acceptedBuyerSteps = [
    "Your accepted offer moves into the formal transaction workflow.",
    "Your agent will send or confirm your buyer onboarding link so you can complete your details and upload supporting documents.",
    "If your offer depends on finance, expect follow-up from the bond originator or finance team.",
    "Transfer attorney details and any other confirmed roleplayers will be shared with you as the transaction is set up.",
  ];

  const contentHtml = [
    renderBridgeIntroParagraphs([
      ...intro,
      decisionNotes ? `Seller note: ${decisionNotes}` : "",
    ]),
    isAcceptedBuyerNotification
      ? `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
           <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What happens next</p>
           ${renderBridgeSteps(acceptedBuyerSteps)}
         </div>`
      : "",
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
    preheader: isAcceptedBuyerNotification
      ? `Congratulations, the seller has accepted your offer for ${propertyTitle}.`
      : `Seller decision recorded: ${decisionLabel} for ${propertyTitle}.`,
    title: isAcceptedBuyerNotification
      ? "Offer Accepted"
      : `Offer ${decisionLabel}`,
    greeting: `Hi ${recipientName},`,
    contentHtml,
    securityTitle: isAcceptedBuyerNotification
      ? "Secure Transaction Workflow"
      : "Offer Workflow Updated",
    securityBody: isAcceptedBuyerNotification
      ? "Your accepted offer and next steps are handled through Bridge and shared only with authorised parties involved in your transaction."
      : "This decision was recorded through Bridge and linked to the canonical buyer offer record.",
    helpBody: isAcceptedBuyerNotification
      ? "Your agent will guide you through the next step. You can reply to this email if you need help."
      : nextStep,
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
    isAcceptedBuyerNotification ? "" : null,
    isAcceptedBuyerNotification ? "What happens next:" : null,
    ...(isAcceptedBuyerNotification
      ? acceptedBuyerSteps.map((line, index) => `${index + 1}. ${line}`)
      : []),
    "",
    isAcceptedBuyerNotification
      ? "Your agent will guide you through the next step. You can reply to this email if you need help."
      : nextStep,
    "",
    organisationName,
    "Powered by Bridge",
  ].filter(Boolean).join("\n");

  const delivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
    communicationType: "offer_decision_notification",
    recipient: to,
    recipientRole: recipientRole || "buyer",
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
        "Failed to send offer decision notification.",
    });
    return jsonResponse(500, {
      error: emailResult.error?.message ||
        "Failed to send offer decision notification.",
      details: emailResult.error,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "offer_decision_notification",
    emailId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
  });
}
