import type { SendSellerMandateSentPayload } from "../types.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleSellerMandateSentEmail(payload: SendSellerMandateSentPayload) {
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
  const mandateType = normalizeText(payload.mandateType) || "mandate";
  const mandateStartDate = normalizeText(payload.mandateStartDate) || "TBC";
  const mandateEndDate = normalizeText(payload.mandateEndDate) || "TBC";
  const askingPrice = normalizeText(payload.askingPrice) || "TBC";
  const portalLink = normalizeText(payload.portalLink);

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject = `${mandateType} ready for review: ${propertyTitle}`;
  const html = `
    <p>Hi ${sellerName},</p>
    <p>Your ${mandateType.toLowerCase()} for <strong>${propertyTitle}</strong> is ready for review.</p>
    <p><strong>Commercial summary</strong></p>
    <ul>
      <li>Asking price: ${askingPrice}</li>
      <li>Mandate period: ${mandateStartDate} to ${mandateEndDate}</li>
    </ul>
    <p>You can review and respond to this mandate in your seller portal:</p>
    <p>${portalLink ? `<a href="${portalLink}">${portalLink}</a>` : "Portal link currently unavailable. Please contact your agent."}</p>
    <p>You can request changes in the portal if needed. Commission terms remain review-only on the seller side.</p>
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
      error: emailResult.error?.message || "Failed to send seller mandate email.",
      details: emailResult.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "seller_mandate_sent",
    emailId: emailResult.data?.id || null,
  });
}
