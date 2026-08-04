import { sendViaResendApi } from "../services/resend.ts";
import type { SendCommercialLandlordOnboardingPayload } from "../types.ts";
import {
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "../content/bridgeEmailLayout.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function buildMessageCopy(
  payload: SendCommercialLandlordOnboardingPayload,
) {
  const messageKind = normalizeText(payload.messageKind).toLowerCase() ||
    "initial_request";
  const landlordName = normalizeText(payload.landlordName) || "Landlord";
  const brokerageName = normalizeText(payload.brokerageName) ||
    "Arch9 Commercial";
  const brokerName = normalizeText(payload.brokerName) || "Your broker";
  const secureLink = normalizeText(
    payload.secureLink || payload.onboardingLink || payload.actionLink,
  );
  const missingFields = Array.isArray(payload.missingFields)
    ? payload.missingFields.filter(Boolean)
    : [];
  const missingDocuments = Array.isArray(payload.missingDocuments)
    ? payload.missingDocuments.filter(Boolean)
    : [];
  const completionPercentage = Number(payload.completionPercentage || 0);

  if (messageKind === "completion_confirmation") {
    return {
      subject: `${landlordName} onboarding received by ${brokerageName}`,
      headline: "Landlord onboarding received",
      body:
        `Thank you. ${brokerageName} has received the landlord onboarding information for ${landlordName}. Your broker will review the submission and follow up only if anything else is needed.`,
      closing:
        `Broker contact: ${brokerName}${payload.brokerEmail ? ` · ${payload.brokerEmail}` : ""}${payload.brokerPhone ? ` · ${payload.brokerPhone}` : ""}`,
      secureLink,
    };
  }

  if (messageKind === "missing_information") {
    return {
      subject: `Additional landlord onboarding information needed for ${brokerageName}`,
      headline: "A few onboarding items still need attention",
      body:
        `Your landlord onboarding has been received, but a few items are still outstanding. Please use the secure link below to finish the remaining information or upload the remaining documents.`,
      checklist: [
        ...missingFields.map((field) => `Field: ${field}`),
        ...missingDocuments.map((document) => `Document: ${document}`),
      ],
      closing:
        `${brokerName} will continue working with you once the remaining items are in.`,
      secureLink,
    };
  }

  if (messageKind === "reminder") {
    return {
      subject: `Reminder: complete your landlord onboarding for ${brokerageName}`,
      headline: "Landlord onboarding reminder",
      body:
        `This is a quick reminder to complete the landlord onboarding pack for ${landlordName}. The secure link below will take you straight back to the saved draft.`,
      closing:
        `${brokerName} is available if you need help with any of the portfolio, mandate, or document details.`,
      secureLink,
    };
  }

  return {
    subject: `Complete your landlord onboarding for ${brokerageName}`,
    headline: "Complete your landlord onboarding",
    body:
      `Please complete the landlord onboarding pack for ${landlordName}. We will capture the legal entity, asset managers, property managers, portfolio details, properties, vacancies, mandate context, and supporting documents your broker needs to structure the account correctly.`,
    closing:
      `${brokerName} is your broker contact for this onboarding.${payload.brokerEmail ? ` Reply to ${payload.brokerEmail}` : ""}${payload.brokerPhone ? ` or call ${payload.brokerPhone}` : ""}`,
    secureLink,
    progressLabel: completionPercentage > 0
      ? `${completionPercentage}% of the onboarding pack is already complete.`
      : "",
  };
}

function buildHtml(
  payload: SendCommercialLandlordOnboardingPayload,
  branding: Awaited<ReturnType<typeof resolveEmailBranding>>,
) {
  const copy = buildMessageCopy(payload);
  const secureLink = normalizeText(copy.secureLink);
  const checklist = Array.isArray(copy.checklist) ? copy.checklist : [];
  const contentHtml = [
    renderBridgeIntroParagraphs([
      copy.body,
      copy.progressLabel || "",
    ]),
    checklist.length
      ? `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
           <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Outstanding items</p>
           ${renderBridgeBullets(checklist)}
         </div>`
      : "",
    secureLink
      ? renderBridgeCta("Open Secure Onboarding", secureLink, {
        primaryColor: branding.primaryColor,
      })
      : "",
    renderBridgeIntroParagraphs([copy.closing || ""]),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: copy.body,
    title: copy.headline,
    greeting:
      `Hi ${normalizeText(payload.recipientName) || normalizeText(payload.landlordName) || "there"},`,
    contentHtml,
    securityTitle: "Secure Commercial Onboarding",
    securityBody:
      "Your onboarding information and documents are handled through Arch9 so your broker can review them securely.",
    helpBody:
      "Need help? Reply to this email or contact your broker directly.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
}

function buildText(payload: SendCommercialLandlordOnboardingPayload) {
  const copy = buildMessageCopy(payload);
  return [
    copy.headline,
    "",
    copy.body,
    copy.progressLabel || "",
    Array.isArray(copy.checklist) && copy.checklist.length
      ? `Outstanding items:\n${copy.checklist.map((item) => `- ${item}`).join("\n")}`
      : "",
    copy.secureLink ? `Secure onboarding link: ${copy.secureLink}` : "",
    copy.closing || "",
  ].filter(Boolean).join("\n\n");
}

export async function handleCommercialLandlordOnboardingEmail(
  payload: SendCommercialLandlordOnboardingPayload,
) {
  const to = normalizeText(payload.to).toLowerCase();
  if (!to) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const fromAddress = normalizeText(
    Deno.env.get("BRIDGE_FROM_EMAIL") || Deno.env.get("FROM_EMAIL") ||
      Deno.env.get("ARCH9_RESEND_FROM_EMAIL") ||
      Deno.env.get("RESEND_FROM_EMAIL") ||
      "Arch9 Commercial <onboarding@resend.dev>",
  );
  const replyTo = normalizeText(payload.brokerEmail) || undefined;
  const copy = buildMessageCopy(payload);
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    defaults: {
      organisationName: normalizeText(payload.brokerageName) ||
        "Arch9 Commercial",
      supportEmail: normalizeText(payload.brokerEmail),
      supportPhone: normalizeText(payload.brokerPhone),
      replyTo,
    },
  });

  const delivery = await sendViaResendApi({
    apiKey: resendApiKey,
    from: formatEmailSender(
      fromAddress,
      branding.fromName || branding.organisationName,
    ),
    to,
    subject: copy.subject,
    html: buildHtml(payload, branding),
    text: buildText(payload),
    replyTo,
  });

  if (!delivery.ok) {
    return jsonResponse(502, {
      error: "Commercial landlord onboarding email delivery failed.",
      details: delivery.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    messageId: delivery.data?.id || null,
    subject: copy.subject,
  });
}
