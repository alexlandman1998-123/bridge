import {
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
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
    "Complete your bond application";
  const title = normalizeText(payload.title) ||
    "Complete your bond application";
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    organisationId: normalizeText(
      metadata.organisationId as string || metadata.organisation_id as string,
    ),
    defaults: {
      organisationName,
      supportEmail: consultantEmail,
      supportPhone: consultantPhone,
      replyTo: consultantEmail,
    },
  });
  const from = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <no-reply@arch9.co.za>",
    branding.fromName || branding.organisationName,
  );

  const fields = [
    { label: "Bond Originator", value: consultantName },
    { label: "Organisation", value: organisationName },
    { label: "Property", value: propertyLabel },
    { label: "Development", value: developmentName },
    { label: "Email", value: consultantEmail },
    { label: "Phone", value: consultantPhone },
  ].filter((field) => field.value);

  const intro = normalizeText(payload.message) ||
    `${consultantName} and the ${organisationName} team are ready to process your bond application. Complete the online application so your information can be reviewed and prepared for submission.`;

  const html = renderBridgeEmailLayout({
    preheader: "Complete your online bond application in the buyer portal.",
    title,
    greeting: `Hi ${firstName(buyerName)},`,
    contentHtml: [
      renderBridgeIntroParagraphs([
        "Your online bond application is ready in the buyer portal.",
        "Your bond team:",
      ]),
      renderBridgeSummaryCard(fields, "Your Bond Team"),
      renderBridgeIntroParagraphs([intro, "What to do next:"]),
      renderBridgeBullets([
        "Open the buyer portal and complete the online bond application.",
        "Upload any supporting documents requested by the bond team.",
        "Your bond originator will review the application and prepare it for bank submission.",
        "You will receive updates in the portal as progress is made.",
      ]),
      renderBridgeCta("Complete Bond Application", portalLink),
    ].join(""),
    securityBody:
      "Your bond application information is available only to authorised parties involved in your transaction.",
    helpBody:
      "Please respond quickly to any document requests so the bond team can keep your application moving.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  const text = [
    `Hi ${firstName(buyerName)},`,
    "",
    "Your online bond application is ready in the buyer portal.",
    "",
    "Your bond team:",
    consultantName,
    organisationName,
    "",
    intro,
    "",
    propertyLabel ? `Transaction: ${propertyLabel}` : "",
    developmentName ? `Development: ${developmentName}` : "",
    "",
    "What to do next:",
    "- Open the buyer portal and complete the online bond application.",
    "- Upload any supporting documents requested by the bond team.",
    "- Your bond originator will review the application and prepare it for bank submission.",
    "- You will receive updates in the portal as progress is made.",
    "",
    consultantPhone ? `Phone: ${consultantPhone}` : "",
    consultantEmail ? `Email: ${consultantEmail}` : "",
    portalLink ? `Complete your bond application: ${portalLink}` : "",
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
