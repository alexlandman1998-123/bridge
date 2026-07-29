import type { ReservationDepositEmailPayload } from "../types.ts";
import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

type BrandedReservationDepositEmailPayload = ReservationDepositEmailPayload & {
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  branding?: BridgeEmailLayoutBranding;
};

function resolvePropertyLine(payload: BrandedReservationDepositEmailPayload) {
  return [payload.developmentName, payload.unitLabel].filter(Boolean).join(
    " • ",
  );
}

export function buildReservationDepositSubject(
  payload: ReservationDepositEmailPayload,
) {
  return payload.unitLabel
    ? `Reservation deposit required - ${payload.unitLabel}`
    : "Reservation deposit required";
}

export function buildReservationDepositEmailHtml(
  payload: BrandedReservationDepositEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const greetingName = payload.buyerName || "there";
  const hasUploadLink = Boolean(payload.uploadProofLink);
  const organisationName = payload.organisationName || "Arch9";
  const contentHtml = [
    renderBridgeIntroParagraphs([
      "As part of securing this property, a reservation deposit is required.",
      "This deposit confirms your intent to proceed and allows the property to be reserved while your transaction progresses.",
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyLine || "Your selected property" },
        {
          label: "Deposit Amount",
          value: payload.formattedReservationDepositAmount,
        },
        { label: "Reference", value: payload.paymentReference },
        { label: "Payment Deadline", value: payload.paymentDeadline || "" },
        {
          label: "Transaction Reference",
          value: payload.transactionReference || "",
        },
      ],
      "Reservation Summary",
    ),
    renderBridgeSummaryCard(
      [
        { label: "Account Name", value: payload.accountName },
        { label: "Bank Name", value: payload.bankName },
        { label: "Account Number", value: payload.accountNumber },
        { label: "Branch Code", value: payload.branchCode },
        { label: "Account Type", value: payload.accountType },
      ],
      "Banking Details",
    ),
    payload.paymentInstructions
      ? `<p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #334155;"><strong>Payment Notes:</strong> ${
        escapeHtml(payload.paymentInstructions)
      }</p>`
      : "",
    `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #f8fbff;">
       <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #334155;"><strong>Next steps:</strong></p>
       ${
      renderBridgeSteps([
        "Make payment using the banking details above.",
        `Use the provided reference exactly: ${payload.paymentReference}.`,
        hasUploadLink
          ? "Upload your proof of payment using the button below."
          : "Upload your proof of payment in the Documents section of your onboarding portal.",
      ])
    }
     </div>`,
    hasUploadLink
      ? renderBridgeCta("Upload Proof of Payment", payload.uploadProofLink, {
        primaryColor: payload.branding?.primaryColor,
      })
      : `<p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #334155;">
           Upload your proof of payment in the Documents section of your onboarding portal so our team can verify and proceed.
         </p>`,
    `<p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">
       Once payment is received, our team will continue with the next transaction steps.
     </p>`,
  ].join("");

  return renderBridgeEmailLayout({
    preheader: `Reservation deposit required for ${
      propertyLine || "your selected property"
    }.`,
    title: "Reservation Deposit",
    greeting: `Hi ${greetingName},`,
    contentHtml,
    securityTitle: "Payment Verification",
    securityBody:
      "Your proof of payment is handled securely through Arch9 and linked to your transaction record for the authorised property team.",
    helpBody:
      "Need help? Reply to this email or contact your property representative directly.",
    organisationName,
    supportEmail: payload.supportEmail || "",
    supportPhone: payload.supportPhone || "",
    branding: payload.branding,
  });
}

export function buildReservationDepositEmailText(
  payload: BrandedReservationDepositEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const organisationName = payload.organisationName || "Arch9";
  const supportLine = [payload.supportEmail, payload.supportPhone].filter(
    Boolean,
  ).join(" | ");

  return [
    `Hi ${payload.buyerName || "there"},`,
    "",
    "As part of securing this property, a reservation deposit is required.",
    "This deposit confirms your intent to proceed and allows the property to be reserved while your transaction progresses.",
    "",
    `Property: ${propertyLine || "Your selected property"}`,
    `Deposit Amount: ${payload.formattedReservationDepositAmount}`,
    `Reference: ${payload.paymentReference}`,
    payload.paymentDeadline
      ? `Payment Deadline: ${payload.paymentDeadline}`
      : null,
    payload.transactionReference
      ? `Transaction Reference: ${payload.transactionReference}`
      : null,
    "",
    "Banking details:",
    payload.accountName ? `Account holder: ${payload.accountName}` : null,
    payload.bankName ? `Bank: ${payload.bankName}` : null,
    payload.accountNumber ? `Account number: ${payload.accountNumber}` : null,
    payload.branchCode ? `Branch code: ${payload.branchCode}` : null,
    payload.accountType ? `Account type: ${payload.accountType}` : null,
    payload.paymentInstructions
      ? `Payment notes: ${payload.paymentInstructions}`
      : null,
    "",
    "Next steps:",
    "1. Make payment using the banking details above.",
    `2. Use the provided reference exactly: ${payload.paymentReference}.`,
    payload.uploadProofLink
      ? "3. Upload your proof of payment using the provided link."
      : "3. Upload your proof of payment in the Documents section of your onboarding portal.",
    "",
    payload.uploadProofLink
      ? `Upload Proof of Payment: ${payload.uploadProofLink}`
      : "Upload your proof of payment in the Documents section of your onboarding portal.",
    "",
    "Once payment is received, our team will continue with the next transaction steps.",
    supportLine ? `Support: ${supportLine}` : null,
    "",
    organisationName,
    "Powered by Arch9",
  ]
    .filter(Boolean)
    .join("\n");
}
