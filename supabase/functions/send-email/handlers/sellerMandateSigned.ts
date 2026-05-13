import type { SendSellerMandateSignedPayload } from "../types.ts";
import {
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
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
  const organisationName =
    normalizeText(payload.organisationName) ||
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Bridge";
  const supportEmail =
    normalizeText(payload.supportEmail) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL"));
  const supportPhone =
    normalizeText(payload.supportPhone) ||
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE"));

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject = `Mandate signed: ${propertyTitle}`;
  const html = renderBridgeEmailLayout({
    preheader: `${sellerName} has signed the mandate for ${propertyTitle}.`,
    title: "Mandate Signed",
    greeting: `Hi ${agentName},`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        `${sellerName} has signed the mandate for ${propertyTitle}.`,
        "The listing workflow has moved forward in Bridge.",
      ]),
      renderBridgeSummaryCard(
        [
          { label: "Property", value: propertyTitle },
          { label: "Signed At", value: signedAt },
          { label: "Document", value: signedDocumentName },
        ],
        "Signature Summary",
      ),
    ].join(""),
    securityTitle: "Secure Mandate Record",
    securityBody: "The signed mandate record is retained in Bridge for authorised users linked to this workflow.",
    helpBody: "Need help? Reply to this email or review the listing workflow in Bridge.",
    organisationName,
    supportEmail,
    supportPhone,
  });
  const text = [
    `Hi ${agentName},`,
    "",
    `${sellerName} has signed the mandate for ${propertyTitle}.`,
    `Signed at: ${signedAt}`,
    `Document: ${signedDocumentName}`,
    "",
    "The listing workflow has moved forward in Bridge.",
    "",
    organisationName,
    "Powered by Bridge",
  ].join("\n");

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
