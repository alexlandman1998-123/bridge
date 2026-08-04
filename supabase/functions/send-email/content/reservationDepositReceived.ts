import type { ReservationDepositReceivedEmailPayload } from "../types.ts";
import {
  type BridgeEmailLayoutBranding,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

function resolvePropertyLine(payload: ReservationDepositReceivedEmailPayload) {
  return [payload.developmentName, payload.unitLabel].filter(Boolean).join(" • ");
}

export function buildReservationDepositReceivedSubject() {
  return "Reservation deposit received – next steps";
}

export function buildReservationDepositReceivedPreview() {
  return "We’ve received your reservation deposit and your transaction is moving to the next step.";
}

export function buildReservationDepositReceivedEmailHtml(
  payload: ReservationDepositReceivedEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const greetingName = payload.buyerName || "there";
  const previewText = buildReservationDepositReceivedPreview();
  const hasPortalLink = Boolean(payload.clientPortalLink);
  const branding = payload.branding as BridgeEmailLayoutBranding | undefined;

  const contentHtml = [
    renderBridgeIntroParagraphs([
      `We have received your reservation deposit${propertyLine ? ` for ${propertyLine}` : ""}.`,
      "Thank you. This payment has been successfully received and recorded.",
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyLine },
        { label: "Transaction Reference", value: payload.transactionReference },
      ],
      "Payment Summary",
    ),
    `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What happens next</p>
       ${renderBridgeSteps([
      "Our team continues preparing your transaction documents.",
      "Your Offer to Purchase (OTP) will be prepared and uploaded to your transaction.",
      "You can continue tracking progress and managing documents in your client portal.",
    ])}
     </div>`,
    hasPortalLink
      ? renderBridgeCta("Open Client Portal", payload.clientPortalLink, {
        primaryColor: branding?.primaryColor,
      })
      : renderBridgeIntroParagraphs([
        "You can continue tracking your transaction and document progress through your client portal.",
      ]),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: previewText,
    title: "Reservation Deposit Received",
    greeting: `Hi ${greetingName},`,
    contentHtml,
    organisationName: payload.organisationName,
    supportEmail: payload.supportEmail,
    supportPhone: payload.supportPhone,
    branding,
  });
}

export function buildReservationDepositReceivedEmailText(
  payload: ReservationDepositReceivedEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const previewText = buildReservationDepositReceivedPreview();

  return [
    `Hi ${payload.buyerName || "there"},`,
    "",
    `We’ve received your reservation deposit${propertyLine ? ` for ${propertyLine}` : ""}.`,
    "Thank you — this payment has been successfully received and recorded.",
    payload.transactionReference
      ? `Transaction Reference: ${payload.transactionReference}`
      : null,
    "",
    "What happens next:",
    "1. Our team continues preparing your transaction documents",
    "2. Your Offer to Purchase (OTP) will be prepared and uploaded to your transaction",
    "3. You can continue tracking progress and managing documents in your client portal",
    "",
    payload.clientPortalLink ? `Open Client Portal: ${payload.clientPortalLink}` : null,
    previewText,
    "",
    "Arch9",
  ]
    .filter(Boolean)
    .join("\n");
}
