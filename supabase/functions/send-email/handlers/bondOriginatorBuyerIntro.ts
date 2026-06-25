import {
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendBondOriginatorBuyerIntroPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function firstName(value = "") {
  return normalizeText(value).split(/\s+/).filter(Boolean)[0] || "there";
}

export async function handleBondOriginatorBuyerIntroEmail(
  payload: SendBondOriginatorBuyerIntroPayload,
) {
  const recipientEmail = normalizeText(payload.to).toLowerCase();
  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const metadata = payload.metadata && typeof payload.metadata === "object"
    ? payload.metadata
    : {};
  const buyerName = normalizeText(payload.recipientName) ||
    normalizeText(metadata.buyerName as string);
  const consultantName = normalizeText(metadata.consultantName as string) ||
    normalizeText(metadata.assignedConsultantName as string) ||
    "your bond originator";
  const organisationName = normalizeText(metadata.organisationName as string) ||
    "your bond originator";
  const consultantEmail = normalizeText(metadata.consultantEmail as string);
  const consultantPhone = normalizeText(metadata.consultantPhone as string);
  const propertyLabel = normalizeText(metadata.propertyLabel as string);
  const developmentName = normalizeText(metadata.developmentName as string);
  const portalLink = normalizeText(metadata.applicationLink as string);
  const subject = normalizeText(payload.subject) ||
    `Meet Your Bond Originator - ${organisationName}`;
  const title = normalizeText(payload.title) ||
    "Your bond application has been assigned";
  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@bridge9.app>";

  const fields = [
    { label: "Bond Originator", value: consultantName },
    { label: "Organisation", value: organisationName },
    { label: "Property", value: propertyLabel },
    { label: "Development", value: developmentName },
    { label: "Email", value: consultantEmail },
    { label: "Phone", value: consultantPhone },
  ].filter((field) => field.value);

  const intro = normalizeText(payload.message) ||
    `${consultantName} and the ${organisationName} team will assist you through the bond application process and keep you updated along the way.`;

  const html = renderBridgeEmailLayout({
    preheader: "Your bond application has been assigned to a bond originator.",
    title,
    greeting: `Hi ${firstName(buyerName)},`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        "Thank you for completing your onboarding.",
        "Your bond application has been assigned to:",
      ]),
      renderBridgeSummaryCard(fields, "Bond Originator Details"),
      renderBridgeIntroParagraphs([intro, "What happens next:"]),
      renderBridgeBullets([
        "Your application will be reviewed.",
        "Supporting documents may be requested.",
        "Your application will be submitted to the banks.",
        "You will receive updates as progress is made.",
      ]),
      renderBridgeCta("View Application", portalLink),
    ].join(""),
    securityBody:
      "Your bond application information is available only to authorised parties involved in your transaction.",
    helpBody:
      "Please respond quickly to any document requests so the bond team can keep your application moving.",
    organisationName: "Arch9",
  });

  const text = [
    `Hi ${firstName(buyerName)},`,
    "",
    "Thank you for completing your onboarding.",
    "",
    "Your bond application has been assigned to:",
    consultantName,
    organisationName,
    "",
    intro,
    "",
    propertyLabel ? `Transaction: ${propertyLabel}` : "",
    developmentName ? `Development: ${developmentName}` : "",
    "",
    "What happens next:",
    "- Your application will be reviewed.",
    "- Supporting documents may be requested.",
    "- Your application will be submitted to the banks.",
    "- You will receive updates as progress is made.",
    "",
    consultantPhone ? `Phone: ${consultantPhone}` : "",
    consultantEmail ? `Email: ${consultantEmail}` : "",
    portalLink ? `View your application: ${portalLink}` : "",
  ].filter(Boolean).join("\n");

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject,
    html,
    text,
    replyTo: consultantEmail || undefined,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the bond originator buyer introduction email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "bond_originator_buyer_intro",
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
