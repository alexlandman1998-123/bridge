import type { SendSellerOnboardingSubmittedPayload } from "../types.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleSellerOnboardingSubmittedEmail(payload: SendSellerOnboardingSubmittedPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const to = normalizeText(payload.to);
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const agentName = normalizeText(payload.agentName) || "Agent";
  const sellerName = normalizeText(payload.sellerName) || "Seller";
  const propertyTitle = normalizeText(payload.propertyTitle) || "property";

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject = `Seller onboarding submitted: ${propertyTitle}`;
  const html = `
    <p>Hi ${agentName},</p>
    <p>${sellerName} has submitted seller onboarding for ${propertyTitle}.</p>
    <p>You can now review the data and prepare the next step.</p>
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
      error: emailResult.error?.message || "Failed to send seller onboarding submitted email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_onboarding_submitted",
    emailId: emailResult.data?.id || null,
  });
}
