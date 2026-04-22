import type { OnboardingSubmittedEmailPayload } from "../types.ts";

function resolvePropertyLine(payload: OnboardingSubmittedEmailPayload) {
  return [payload.developmentName, payload.unitLabel].filter(Boolean).join(" • ");
}

export function buildOnboardingSubmittedSubject() {
  return "Your onboarding is complete – next steps";
}

export function buildOnboardingSubmittedPreview() {
  return "We’ve received your information. Access your client portal to track your transaction.";
}

export function buildOnboardingSubmittedEmailHtml(
  payload: OnboardingSubmittedEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const greetingName = payload.buyerName || "there";
  const previewText = buildOnboardingSubmittedPreview();

  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; background: #f8fafc; padding: 24px;">
      <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
        ${previewText}
      </div>
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe4ef; border-radius: 16px; overflow: hidden;">
        <div style="padding: 20px 24px; background: #0f2f4f; color: #ffffff;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;">BRIDGE</p>
          <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">Onboarding Submitted</h1>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 14px; font-size: 15px;">Hi ${greetingName},</p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
            Thank you — we’ve successfully received your onboarding information.
          </p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
            Our team will now review your details and begin preparing your Offer to Purchase (OTP).
          </p>
          ${
    propertyLine
      ? `<p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;"><strong>Property:</strong> ${propertyLine}</p>`
      : ""
  }
          ${
    payload.transactionReference
      ? `<p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;"><strong>Transaction Reference:</strong> ${payload.transactionReference}</p>`
      : ""
  }

          <div style="margin: 16px 0; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #f8fbff;">
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;"><strong>What happens next:</strong></p>
            <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.6;">1. Our team reviews your information</p>
            <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.6;">2. We prepare your Offer to Purchase (OTP)</p>
            <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.6;">3. You will receive your documents for review and signature</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.6;">4. You can track your transaction and upload documents via your client portal</p>
          </div>

          <p style="margin: 0 0 22px;">
            <a href="${payload.clientPortalLink}" style="display: inline-block; padding: 12px 18px; background: #0f4c81; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600;">
              Open Client Portal
            </a>
          </p>

          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
            If the button does not work, copy and paste this URL into your browser:<br />
            <a href="${payload.clientPortalLink}" style="color: #0f4c81;">${payload.clientPortalLink}</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

export function buildOnboardingSubmittedEmailText(
  payload: OnboardingSubmittedEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const previewText = buildOnboardingSubmittedPreview();

  return [
    `Hi ${payload.buyerName || "there"},`,
    "",
    "Thank you — we’ve successfully received your onboarding information.",
    "Our team will now review your details and begin preparing your Offer to Purchase (OTP).",
    propertyLine ? `Property: ${propertyLine}` : null,
    payload.transactionReference
      ? `Transaction Reference: ${payload.transactionReference}`
      : null,
    "",
    "What happens next:",
    "1. Our team reviews your information",
    "2. We prepare your Offer to Purchase (OTP)",
    "3. You will receive your documents for review and signature",
    "4. You can track your transaction and upload documents via your client portal",
    "",
    `Open Client Portal: ${payload.clientPortalLink}`,
    "",
    previewText,
    "",
    "Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}
