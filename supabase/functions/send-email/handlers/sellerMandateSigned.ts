import type { SendSellerMandateSignedPayload } from "../types.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleSellerMandateSignedEmail(payload: SendSellerMandateSignedPayload) {
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
  const signedAt = normalizeText(payload.signedAt) || "Just now";
  const signedDocumentName = normalizeText(payload.signedDocumentName) || "Signed mandate";

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject = `Mandate signed: ${propertyTitle}`;
  const html = `
    <p>Hi ${agentName},</p>
    <p>${sellerName} has signed the mandate for <strong>${propertyTitle}</strong>.</p>
    <ul>
      <li>Signed at: ${signedAt}</li>
      <li>Document: ${signedDocumentName}</li>
    </ul>
    <p>The listing has moved forward in the seller workflow.</p>
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
      error: emailResult.error?.message || "Failed to send seller mandate signed email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_mandate_signed",
    emailId: emailResult.data?.id || null,
  });
}
