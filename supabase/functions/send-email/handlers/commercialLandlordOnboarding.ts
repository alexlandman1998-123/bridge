import { sendViaResendApi } from "../services/resend.ts";
import type { SendCommercialLandlordOnboardingPayload } from "../types.ts";
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
) {
  const copy = buildMessageCopy(payload);
  const secureLink = normalizeText(copy.secureLink);
  const checklist = Array.isArray(copy.checklist) ? copy.checklist : [];
  return `
    <div style="background:#f4f7fb;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#102236;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ee;border-radius:24px;padding:32px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7d93;">Arch9 Commercial</p>
        <h1 style="margin:0;font-size:28px;line-height:1.15;font-weight:700;color:#102236;">${copy.headline}</h1>
        <p style="margin:16px 0 0;font-size:15px;line-height:1.8;color:#4a5a6f;">${copy.body}</p>
        ${copy.progressLabel ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#4a5a6f;">${copy.progressLabel}</p>` : ""}
        ${checklist.length ? `
          <div style="margin-top:20px;border:1px solid #fde68a;background:#fffbeb;border-radius:18px;padding:18px 20px;">
            <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#8a5a00;">Outstanding items</p>
            <ul style="margin:0;padding-left:18px;color:#6a4a00;font-size:14px;line-height:1.7;">
              ${checklist.map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
        ${secureLink ? `
          <div style="margin-top:24px;">
            <a href="${secureLink}" style="display:inline-block;background:#102b46;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:16px;font-size:14px;font-weight:700;">Open secure onboarding</a>
          </div>
          <p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#6b7d93;">If the button does not open, copy this secure link into your browser:<br /><a href="${secureLink}" style="color:#1267a3;word-break:break-all;">${secureLink}</a></p>
        ` : ""}
        <div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:18px;">
          <p style="margin:0;font-size:14px;line-height:1.8;color:#4a5a6f;">${copy.closing || ""}</p>
        </div>
      </div>
    </div>
  `;
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
      "Arch9 Commercial <commercial@updates.arch9.co>",
  );
  const replyTo = normalizeText(payload.brokerEmail) || undefined;
  const copy = buildMessageCopy(payload);

  const delivery = await sendViaResendApi({
    apiKey: resendApiKey,
    from: fromAddress,
    to,
    subject: copy.subject,
    html: buildHtml(payload),
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
