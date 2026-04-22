import type { ReservationDepositEmailPayload } from "../types.ts";

function resolvePropertyLine(payload: ReservationDepositEmailPayload) {
  return [payload.developmentName, payload.unitLabel].filter(Boolean).join(" • ");
}

export function buildReservationDepositSubject(payload: ReservationDepositEmailPayload) {
  return payload.unitLabel
    ? `Reservation deposit required - ${payload.unitLabel}`
    : "Reservation deposit required";
}

export function buildReservationDepositEmailHtml(payload: ReservationDepositEmailPayload) {
  const propertyLine = resolvePropertyLine(payload);
  const greetingName = payload.buyerName || "there";
  const hasUploadLink = Boolean(payload.uploadProofLink);

  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; background: #f8fafc; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe4ef; border-radius: 16px; overflow: hidden;">
        <div style="padding: 20px 24px; background: #0f2f4f; color: #ffffff;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;">BRIDGE</p>
          <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">Reservation Deposit</h1>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 14px; font-size: 15px;">Hi ${greetingName},</p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
            As part of securing this property, a reservation deposit is required.
          </p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: #334155;">
            This deposit confirms your intent to proceed and allows the property to be reserved while your transaction progresses.
          </p>

          <div style="margin: 16px 0; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #f8fbff;">
            <p style="margin: 0 0 6px; font-size: 14px; color: #334155;"><strong>Property:</strong> ${propertyLine || "Your selected property"}</p>
            <p style="margin: 0 0 6px; font-size: 14px; color: #334155;"><strong>Deposit Amount:</strong> ${payload.formattedReservationDepositAmount}</p>
            <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Reference:</strong> ${payload.paymentReference}</p>
            ${
    payload.paymentDeadline
      ? `<p style="margin: 6px 0 0; font-size: 14px; color: #334155;"><strong>Payment Deadline:</strong> ${payload.paymentDeadline}</p>`
      : ""
  }
            ${
    payload.transactionReference
      ? `<p style="margin: 6px 0 0; font-size: 14px; color: #334155;"><strong>Transaction Reference:</strong> ${payload.transactionReference}</p>`
      : ""
  }
          </div>

          <div style="margin: 16px 0; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #ffffff;">
            ${
    payload.accountName
      ? `<p style="margin: 0 0 6px; font-size: 14px; color: #334155;"><strong>Account Name:</strong> ${payload.accountName}</p>`
      : ""
  }
            ${
    payload.bankName
      ? `<p style="margin: 0 0 6px; font-size: 14px; color: #334155;"><strong>Bank Name:</strong> ${payload.bankName}</p>`
      : ""
  }
            ${
    payload.accountNumber
      ? `<p style="margin: 0 0 6px; font-size: 14px; color: #334155;"><strong>Account Number:</strong> ${payload.accountNumber}</p>`
      : ""
  }
            ${
    payload.branchCode
      ? `<p style="margin: 0; font-size: 14px; color: #334155;"><strong>Branch Code:</strong> ${payload.branchCode}</p>`
      : ""
  }
            ${
    payload.accountType
      ? `<p style="margin: 6px 0 0; font-size: 14px; color: #334155;"><strong>Account Type:</strong> ${payload.accountType}</p>`
      : ""
  }
          </div>
          ${
    payload.paymentInstructions
      ? `<p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #334155;"><strong>Payment Notes:</strong> ${payload.paymentInstructions}</p>`
      : ""
  }

          <div style="margin: 0 0 16px; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #f8fbff;">
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #334155;"><strong>Next steps:</strong></p>
            <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.6; color: #334155;">1. Make payment using the banking details above.</p>
            <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.6; color: #334155;">2. Use the provided reference exactly: <strong>${payload.paymentReference}</strong>.</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">3. Upload your proof of payment using the button below.</p>
          </div>

          ${
    hasUploadLink
      ? `<p style="margin: 0 0 16px;">
           <a href="${payload.uploadProofLink}" style="display: inline-block; padding: 12px 18px; background: #0f4c81; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600;">
             Upload Proof of Payment
           </a>
         </p>
         <p style="margin: 0 0 14px; font-size: 13px; line-height: 1.5; color: #64748b;">
           If the button does not work, copy and paste this URL into your browser:<br />
           <a href="${payload.uploadProofLink}" style="color: #0f4c81;">${payload.uploadProofLink}</a>
         </p>`
      : ""
  }
          ${
    !hasUploadLink
      ? `<p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #334155;">
           Upload your proof of payment in the Documents section of your onboarding portal so our team can verify and proceed.
         </p>`
      : ""
  }
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">
            Once payment is received, our team will continue with the next transaction steps.
          </p>
        </div>
      </div>
    </div>
  `;
}

export function buildReservationDepositEmailText(payload: ReservationDepositEmailPayload) {
  const propertyLine = resolvePropertyLine(payload);

  return [
    `Hi ${payload.buyerName || "there"},`,
    "",
    "As part of securing this property, a reservation deposit is required.",
    "This deposit confirms your intent to proceed and allows the property to be reserved while your transaction progresses.",
    "",
    `Property: ${propertyLine || "Your selected property"}`,
    `Deposit Amount: ${payload.formattedReservationDepositAmount}`,
    `Reference: ${payload.paymentReference}`,
    payload.paymentDeadline ? `Payment Deadline: ${payload.paymentDeadline}` : null,
    payload.transactionReference ? `Transaction Reference: ${payload.transactionReference}` : null,
    "",
    "Banking details:",
    payload.accountName ? `Account holder: ${payload.accountName}` : null,
    payload.bankName ? `Bank: ${payload.bankName}` : null,
    payload.accountNumber ? `Account number: ${payload.accountNumber}` : null,
    payload.branchCode ? `Branch code: ${payload.branchCode}` : null,
    payload.accountType ? `Account type: ${payload.accountType}` : null,
    payload.paymentInstructions ? `Payment notes: ${payload.paymentInstructions}` : null,
    "",
    "Next steps:",
    "1. Make payment using the banking details above.",
    `2. Use the provided reference exactly: ${payload.paymentReference}.`,
    "3. Upload your proof of payment using the provided link.",
    "",
    payload.uploadProofLink
      ? `Upload Proof of Payment: ${payload.uploadProofLink}`
      : "Upload your proof of payment in the Documents section of your onboarding portal.",
    "",
    "Once payment is received, our team will continue with the next transaction steps.",
    "",
    "Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}
