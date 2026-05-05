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
    <p>Hi ${sellerName},</p>
    <p>Your agent has started your seller onboarding on Bridge.</p>
    <p>Please complete your seller onboarding here:</p>
    <p><a href="${onboardingLink}">${onboardingLink}</a></p>
    <p>This captures your seller profile and property details so the next step can be prepared.</p>
    <p>Regards,<br/>Bridge</p>
  `;

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
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
