import type { ReservationDepositReceivedEmailPayload } from "../types.ts";

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

  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; background: #f8fafc; padding: 24px;">
      <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
        ${previewText}
      </div>
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe4ef; border-radius: 16px; overflow: hidden;">
        <div style="padding: 20px 24px; background: #0f2f4f; color: #ffffff;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;">BRIDGE</p>
          <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">Reservation Deposit Received</h1>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 14px; font-size: 15px;">Hi ${greetingName},</p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
            We’ve received your reservation deposit${propertyLine ? ` for ${propertyLine}` : ""}.
          </p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
            Thank you — this payment has been successfully received and recorded.
          </p>
          ${
    payload.transactionReference
      ? `<p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6;"><strong>Transaction Reference:</strong> ${payload.transactionReference}</p>`
      : ""
  }

          <div style="margin: 16px 0; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #f8fbff;">
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;"><strong>What happens next:</strong></p>
            <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.6;">1. Our team continues preparing your transaction documents</p>
            <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.6;">2. Your Offer to Purchase (OTP) will be prepared and uploaded to your transaction</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.6;">3. You can continue tracking progress and managing documents in your client portal</p>
          </div>

          ${
    hasPortalLink
      ? `<p style="margin: 0 0 18px;">
           <a href="${payload.clientPortalLink}" style="display: inline-block; padding: 12px 18px; background: #0f4c81; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600;">
             Open Client Portal
           </a>
         </p>
         <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
           If the button does not work, copy and paste this URL into your browser:<br />
           <a href="${payload.clientPortalLink}" style="color: #0f4c81;">${payload.clientPortalLink}</a>
         </p>`
      : `<p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">
           You can continue tracking your transaction and document progress through your client portal.
         </p>`
  }
        </div>
      </div>
    </div>
  `;
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
    "Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}
