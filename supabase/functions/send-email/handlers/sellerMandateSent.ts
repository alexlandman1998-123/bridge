import { createClient } from "supabase";
import type { SendSellerMandateSentPayload } from "../types.ts";
import {
  escapeHtml,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { fetchOrganisationEmailTemplateOverride } from "../services/emailTemplateSettings.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

const MANDATE_SIGNING_EMAIL_PROVIDER_TIMEOUT_MS = 20000;

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
  const requestedRecipientRole = normalizeText(payload.recipientRole).toLowerCase();
  const recipientRole = requestedRecipientRole === "agent"
    ? "agent"
    : ["purchaser", "purchaser_1", "purchaser_2", "buyer", "buyer_spouse"].includes(requestedRecipientRole)
      ? "purchaser"
      : "seller";
  const recipientName = normalizeText(payload.recipientName) || (recipientRole === "agent" ? normalizeText(payload.agentName) || "there" : sellerName);
  const propertyTitle = normalizeText(payload.propertyTitle) || "your property";
  const mandateType = normalizeText(payload.mandateType) || "mandate";
  const isReminder = payload.reminder === true;
  const isOtp = /offer to purchase|otp/i.test(mandateType);
  const mandateStartDate = normalizeText(payload.mandateStartDate) || "TBC";
  const mandateEndDate = normalizeText(payload.mandateEndDate) || "TBC";
  const askingPrice = normalizeText(payload.askingPrice) || "TBC";
  const portalLink = normalizeText(payload.portalLink);
  const agentName = normalizeText(payload.agentName);
  const organisationId = normalizeText(payload.organisationId);
  const mandateId = normalizeText(payload.mandateId || payload.packetId);
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
  const supabase = organisationId && supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;
  let templateOverrides = null;
  if (organisationId && supabase) {
    try {
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
    "Arch9 <onboarding@resend.dev>";
  const branding = await resolveEmailBranding({
    supabase: supabase || undefined,
    organisationId,
    payload: payload as Record<string, unknown>,
    defaults: {
      organisationName,
      supportEmail,
      supportPhone,
    },
  });
  const brandedSender = formatEmailSender(
    sender,
    branding.fromName || branding.organisationName,
  );
  const brandedOrganisationName = branding.organisationName || organisationName;
  const agentLabel = agentName ? ` ${agentName}` : " your agent";
  const propertyContext = [
    propertyTitle && propertyTitle !== "your property"
      ? `the property at ${propertyTitle}`
      : "your property",
    askingPrice !== "TBC" ? `listed at ${askingPrice}` : "",
    !isOtp && (mandateStartDate !== "TBC" || mandateEndDate !== "TBC")
      ? `with a mandate period of ${mandateStartDate} to ${mandateEndDate}`
      : "",
  ].filter(Boolean).join(", ");
  const contextSentence = propertyContext
    ? `This relates to ${propertyContext}.`
    : "";

  const subject = isReminder
    ? `Just a nudge: ${mandateType} still needs your signature for ${propertyTitle}`
    : normalizeText(templateOverrides?.subject) ||
    (recipientRole === "agent"
      ? `Agency signature needed: ${propertyTitle}`
      : `${mandateType} ready for review: ${propertyTitle}`);
  const introParagraphs = Array.isArray(templateOverrides?.introParagraphs) && templateOverrides.introParagraphs.length
    ? templateOverrides.introParagraphs
    : isReminder
      ? [
        `Just a gentle nudge - the ${mandateType.toLowerCase()} for ${propertyTitle} is still waiting for your signature.`,
        "Your secure signing link is still active, so you can jump back in whenever you are ready.",
      ]
    : recipientRole === "agent"
      ? [
        `The ${mandateType.toLowerCase()} for ${propertyTitle} is ready for your agency signature.`,
        isOtp ? "Please review the offer carefully before signing." : "Please review and sign first. The seller will receive their signing invitation automatically after your signature is complete.",
      ]
      : [
        isOtp
          ? `Your offer to purchase for ${propertyTitle} is ready for secure review and signature.`
          : `Your mandate for ${propertyTitle} is ready for secure review and signature.`,
        isOtp
          ? "The offer records the buyer's proposed terms. Please read it carefully before signing, and ask your agent if anything is unclear."
          : `The mandate gives${agentLabel} the authority to move ahead with the listing process on the agreed terms. Please read it carefully before signing, and ask your agent if anything is unclear.`,
        contextSentence,
      ];
  const processSteps = Array.isArray(templateOverrides?.processSteps) && templateOverrides.processSteps.length
    ? templateOverrides.processSteps
    : recipientRole === "agent"
      ? [
        `Open the secure ${isOtp ? "offer" : "mandate"} link.`,
        `Review the ${isOtp ? "offer" : "mandate"} details and signature area.`,
        isOtp ? "Sign the offer when the details are correct." : "Sign the mandate so the seller can receive their signing invitation.",
      ]
      : [
        `Open the secure ${isOtp ? "offer" : "mandate"} link and review the document.`,
        "Check that the property, parties, pricing, and signature details look right.",
        `Sign when you are comfortable, or reply to this email/contact your agent if something needs attention.`,
        isOtp
          ? "After signing, the transaction team will continue with offer review and the next transaction steps."
          : "After signing, your agent can continue with the listing and any outstanding seller-readiness steps.",
      ];
  const ctaLabel = normalizeText(templateOverrides?.ctaLabel) ||
    (isOtp ? "Review & Sign Offer" : recipientRole === "agent" ? "Review & Sign as Agent" : "Review & Sign Mandate");
  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    `<h2 style="margin: 22px 0 10px; font-size: 18px; line-height: 1.35; color: #17233A; font-weight: 700;">What happens next</h2>
     <p style="margin: 0 0 12px; font-size: 15px; line-height: 1.65; color: #1f3347;">${
      escapeHtml(
        recipientRole === "agent"
          ? isOtp
            ? "Once you sign, the offer can continue through the controlled transaction workflow."
            : "Once you sign, the seller receives their own signing invitation so the mandate can move forward without manual chasing."
          : isOtp
          ? "Once your signature is complete, the offer is returned to the transaction team for the next review step."
          : "Once your signature is complete, your agent can continue preparing the listing and will come back to you if anything still needs attention.",
      )
    }</p>
       ${renderBridgeSteps(processSteps)}
     `,
    portalLink
      ? renderBridgeCta(ctaLabel, portalLink, { primaryColor: branding.primaryColor })
      : `<p style="margin: 0 0 18px; font-size: 14px; line-height: 1.6; color: #9a3412;">Your secure ${isOtp ? "offer" : "mandate"} link is currently unavailable. Please contact your agent to resend it.</p>`,
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: normalizeText(templateOverrides?.preheader) ||
      (recipientRole === "agent"
        ? `Agency signature is required before the seller can sign ${propertyTitle}.`
        : `Your ${mandateType.toLowerCase()} for ${propertyTitle} is ready for review and signature.`),
    title: isReminder ? `${mandateType} Signature Reminder` : normalizeText(templateOverrides?.title) || (recipientRole === "agent" ? `${mandateType} Ready for Agent Signature` : `${mandateType} Ready`),
    greeting: `Hi ${recipientName},`,
    contentHtml,
    securityTitle: normalizeText(templateOverrides?.securityTitle) || (isOtp ? "Secure Offer Review" : "Secure Mandate Review"),
    securityBody: normalizeText(templateOverrides?.securityBody) || `Your ${isOtp ? "offer" : "mandate"} is shared through a secure ${brandedOrganisationName} signing link. Only authorised parties involved in your transaction can access this workflow.`,
    helpBody: normalizeText(templateOverrides?.helpBody) || "Need help? Reply to this email or contact your agent directly before signing.",
    organisationName: brandedOrganisationName,
    supportEmail: branding.supportEmail || supportEmail,
    supportPhone: branding.supportPhone || supportPhone,
    footerText: brandedOrganisationName,
    branding,
  });
  const text = [
    `Hi ${recipientName},`,
    "",
    isReminder
      ? `The ${mandateType.toLowerCase()} for ${propertyTitle} is still waiting for your signature. Your secure link remains active.`
      : recipientRole === "agent"
      ? `The ${mandateType.toLowerCase()} for ${propertyTitle} is ready for your agency signature. The seller will be invited after you sign.`
      : isOtp
      ? `Your offer to purchase for ${propertyTitle} is ready for secure review and signature.`
      : `Your mandate for ${propertyTitle} is ready for secure review and signature.`,
    "",
    recipientRole === "agent"
      ? isOtp
        ? "Please review and sign so the offer can continue through the controlled transaction workflow."
        : "Please review and sign first. The seller will receive their signing invitation automatically after your signature is complete."
      : isOtp
      ? "The offer records the buyer's proposed terms. Please read it carefully before signing, and ask your agent if anything is unclear."
      : `The mandate gives${agentLabel} the authority to move ahead with the listing process on the agreed terms. Please read it carefully before signing, and ask your agent if anything is unclear.`,
    contextSentence || null,
    "",
    "What happens next:",
    ...processSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    portalLink ? `${ctaLabel}:` : `Your secure ${isOtp ? "offer" : "mandate"} link is currently unavailable. Please contact your agent to resend it.`,
    portalLink || null,
    "",
    "Need help? Reply to this email or contact your agent directly before signing.",
    "",
    brandedOrganisationName,
  ].filter(Boolean).join("\n");

  console.log("[mandate_signing_email] send attempt", {
    mandateId: mandateId || null,
    recipientRole,
    recipientEmailPresent: Boolean(to),
  });

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: brandedSender,
    to,
    subject,
    html,
    text,
    idempotencyKey: normalizeText(payload.idempotencyKey),
    timeoutMs: MANDATE_SIGNING_EMAIL_PROVIDER_TIMEOUT_MS,
  });

  if (!emailResult.ok) {
    console.error("[mandate_signing_email] provider failed", {
      mandateId: mandateId || null,
      recipientRole,
      recipientEmailPresent: Boolean(to),
      emailProviderStatus: emailResult.status || null,
      providerMessage: emailResult.error?.message || emailResult.error?.error || null,
    });
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send seller mandate email.",
      details: emailResult.error,
    });
  }

  console.log("[mandate_signing_email] provider sent", {
    mandateId: mandateId || null,
    recipientRole,
    recipientEmailPresent: Boolean(to),
    emailProviderStatus: emailResult.status || null,
  });

  return jsonResponse(200, {
    ok: true,
    emailConfirmed: true,
    type: "seller_mandate_sent",
    emailId: emailResult.data?.id || null,
    providerStatus: emailResult.status || null,
  });
}
