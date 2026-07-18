import type { SendSellerMandateSignedPayload } from "../types.ts";
import {
  renderBridgeEmailLayout,
  renderBridgeCta,
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

  const recipientName = normalizeText(payload.recipientName);
  const agentName = normalizeText(payload.agentName) || recipientName || "Agent";
  const sellerName = normalizeText(payload.sellerName) || "Seller";
  const propertyTitle = normalizeText(payload.propertyTitle) || "property";
  const signedAt = normalizeText(payload.signedAt) || "Just now";
  const signedDocumentName = normalizeText(payload.signedDocumentName) || "Signed mandate";
  const packetType = normalizeText(payload.packetType).toLowerCase();
  const documentLabel = normalizeText(payload.documentLabel) || (packetType === "otp" ? "Offer to Purchase" : "mandate");
  const titleLabel = documentLabel.replace(/\b\w/g, (character) => character.toUpperCase());
  const downloadLink = normalizeText(payload.downloadLink);
  const organisationName =
    normalizeText(payload.organisationName) ||
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Arch9";
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
    "Arch9 <onboarding@resend.dev>";

  const subject = `Signed ${documentLabel} ready: ${propertyTitle}`;
  const html = renderBridgeEmailLayout({
    preheader: `The signed ${documentLabel} for ${propertyTitle} is ready to download.`,
    title: `Signed ${titleLabel} Ready`,
    greeting: `Hi ${recipientName || agentName},`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        `All required signatures for the ${documentLabel} on ${propertyTitle} are complete.`,
        downloadLink
          ? "Use the secure download link below to access the signed PDF."
          : "The signed mandate record is available in Arch9 for authorised users linked to this workflow.",
      ]),
      renderBridgeCta(`Download signed ${documentLabel}`, downloadLink),
      renderBridgeSummaryCard(
        [
          { label: "Property", value: propertyTitle },
          { label: "Seller", value: sellerName },
          { label: "Signed At", value: signedAt },
          { label: "Document", value: signedDocumentName },
        ],
        "Signature Summary",
      ),
    ].join(""),
    securityTitle: `Secure ${titleLabel} Record`,
    securityBody: downloadLink
      ? `This download link is secure and time-limited. Authorised users can also access the signed ${documentLabel} from Arch9.`
      : `The signed ${documentLabel} record is retained in Arch9 for authorised users linked to this workflow.`,
    helpBody: "Need help? Reply to this email or review the listing workflow in Arch9.",
    organisationName,
    supportEmail,
    supportPhone,
  });
  const text = [
    `Hi ${recipientName || agentName},`,
    "",
    `All required signatures for the ${documentLabel} on ${propertyTitle} are complete.`,
    `Signed at: ${signedAt}`,
    `Document: ${signedDocumentName}`,
    downloadLink ? `Download: ${downloadLink}` : "",
    "",
    `The signed ${documentLabel} is retained in Arch9 for authorised users linked to this workflow.`,
    "",
    organisationName,
    "Powered by Arch9",
  ].join("\n");

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to,
    subject,
    html,
    text,
    idempotencyKey: normalizeText(payload.idempotencyKey),
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
