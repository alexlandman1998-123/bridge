import type { SendSellerOnboardingPayload } from "../types.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleSellerOnboardingEmail(payload: SendSellerOnboardingPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const sellerName = normalizeText(payload.sellerName) || "there";
  const propertyTitle = normalizeText(payload.propertyTitle) || "your property";
  const onboardingLink = normalizeText(payload.onboardingLink);
  if (!onboardingLink) {
    return jsonResponse(400, { error: "Missing required field: onboardingLink" });
  }

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject = `Complete seller onboarding for ${propertyTitle}`;
  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; background: #f8fafc; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe4ef; border-radius: 16px; overflow: hidden;">
        <div style="padding: 20px 24px; background: #0f2f4f; color: #ffffff;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;">Bridge</p>
          <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">Seller Onboarding</h1>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 14px; font-size: 15px;">Hi ${sellerName || "there"},</p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
            Your seller onboarding has been created. Please complete your onboarding information so your agent can continue with mandate and listing preparation.
          </p>
          ${
            propertyTitle
              ? `<div style="margin: 16px 0; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #f8fbff;">
                   <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Property:</strong> ${propertyTitle}</p>
                 </div>`
              : ""
          }
          <p style="margin: 0 0 18px; font-size: 15px;">Use the link below to begin:</p>
          <p style="margin: 0 0 22px;">
            <a href="${onboardingLink}" style="display: inline-block; padding: 12px 18px; background: #0f4c81; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600;">
              Open Onboarding
            </a>
          </p>
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
            If the button does not work, copy and paste this URL into your browser:<br />
            <a href="${onboardingLink}" style="color: #0f4c81;">${onboardingLink}</a>
          </p>
        </div>
      </div>
    </div>
  `;
  const text = [
    `Hi ${sellerName || "there"},`,
    "",
    "Your seller onboarding has been created on Bridge.",
    propertyTitle ? `Property: ${propertyTitle}` : null,
    "",
    "Please complete your onboarding information using this link:",
    onboardingLink,
    "",
    "Bridge",
  ]
    .filter(Boolean)
    .join("\n");

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
      error: emailResult.error?.message || "Failed to send seller onboarding email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_onboarding",
    emailId: emailResult.data?.id || null,
  });
}
