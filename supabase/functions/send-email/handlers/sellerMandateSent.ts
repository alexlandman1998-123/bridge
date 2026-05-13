import { createClient } from "supabase";
import type { SendSellerMandateSentPayload } from "../types.ts";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { fetchOrganisationEmailTemplateOverride } from "../services/emailTemplateSettings.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

export async function handleSellerMandateSentEmail(payload: SendSellerMandateSentPayload) {
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
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
  const agentName = normalizeText(payload.agentName);
  const organisationId = normalizeText(payload.organisationId);
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
  let templateOverrides = null;
  if (organisationId && supabaseUrl && serviceRoleKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      templateOverrides = await fetchOrganisationEmailTemplateOverride(
        supabase,
        organisationId,
        "seller_mandate_sent",
      );
    } catch (error) {
      console.error("[seller_mandate_sent] template override lookup failed", error);
    }
  }

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const subject = normalizeText(templateOverrides?.subject) || `${mandateType} ready for review: ${propertyTitle}`;
  const introParagraphs = Array.isArray(templateOverrides?.introParagraphs) && templateOverrides.introParagraphs.length
    ? templateOverrides.introParagraphs
    : [
        `Your ${mandateType.toLowerCase()} for ${propertyTitle} is ready for secure review and signature.`,
        "Bridge keeps the mandate workflow connected between you, your agent, and the supporting transaction team.",
      ];
  const processSteps = Array.isArray(templateOverrides?.processSteps) && templateOverrides.processSteps.length
    ? templateOverrides.processSteps
    : [
        "Open the secure mandate link.",
        "Review the mandate details and signature areas.",
        "Sign the mandate, or contact your agent if anything needs attention.",
      ];
  const ctaLabel = normalizeText(templateOverrides?.ctaLabel) || "Review & Sign Mandate";
  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyTitle },
        { label: "Asking Price", value: askingPrice },
        { label: "Mandate Period", value: `${mandateStartDate} to ${mandateEndDate}` },
        { label: "Agent", value: agentName },
      ],
      "Mandate Summary",
    ),
    `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What happens next</p>
       ${renderBridgeSteps(processSteps)}
     </div>`,
    portalLink
      ? renderBridgeCta(ctaLabel, portalLink)
      : `<p style="margin: 0 0 18px; font-size: 14px; line-height: 1.6; color: #9a3412;">Your secure mandate link is currently unavailable. Please contact your agent to resend it.</p>`,
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: normalizeText(templateOverrides?.preheader) || `Your ${mandateType.toLowerCase()} for ${propertyTitle} is ready for review and signature.`,
    title: normalizeText(templateOverrides?.title) || `${mandateType} Ready`,
    greeting: `Hi ${sellerName},`,
    contentHtml,
    securityTitle: normalizeText(templateOverrides?.securityTitle) || "Secure Mandate Review",
    securityBody: normalizeText(templateOverrides?.securityBody) || "Your mandate is shared through a secure Bridge link. Only authorised parties involved in your transaction can access this workflow.",
    helpBody: normalizeText(templateOverrides?.helpBody) || "Need help? Reply to this email or contact your agent directly before signing.",
    organisationName,
    supportEmail,
    supportPhone,
  });
  const text = [
    `Hi ${sellerName},`,
    "",
    `Your ${mandateType.toLowerCase()} for ${propertyTitle} is ready for secure review and signature.`,
    "",
    "Mandate Summary:",
    `Property: ${propertyTitle}`,
    `Asking Price: ${askingPrice}`,
    `Mandate Period: ${mandateStartDate} to ${mandateEndDate}`,
    agentName ? `Agent: ${agentName}` : null,
    "",
    portalLink ? "Review & Sign Mandate:" : "Your secure mandate link is currently unavailable. Please contact your agent to resend it.",
    portalLink || null,
    "",
    "Need help? Reply to this email or contact your agent directly before signing.",
    "",
    organisationName,
    "Powered by Bridge",
  ].filter(Boolean).join("\n");

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
