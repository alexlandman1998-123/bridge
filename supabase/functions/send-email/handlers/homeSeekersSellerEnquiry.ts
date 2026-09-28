import {
  buildHomeSeekersSellerAgencyEmail,
  buildHomeSeekersSellerClientEmail,
  type HomeSeekersSellerEnquiry,
} from "../content/homeSeekersSellerEnquiry.ts";
import { sendViaResendApi } from "../services/resend.ts";
import { assessControlledTestRecipient } from "../utils/controlledTestRecipient.ts";
import { jsonResponse } from "../utils/http.ts";

export const HOME_SEEKERS_ORGANISATION_ID =
  "2958d402-368e-43c9-b728-0098e10505f1";

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function email(value: unknown) {
  const normalized = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function hasVerifiedServiceRole(request: Request) {
  // Supabase verifies the bearer JWT before invoking this function.
  const token = /^Bearer (.+)$/.exec(
    request.headers.get("authorization") || "",
  )?.[1];
  if (!token) return false;
  try {
    const claims = JSON.parse(
      atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
    );
    return claims?.role === "service_role";
  } catch {
    return false;
  }
}

export function isHomeSeekersSellerEnquiry({
  eventKind,
  organisationId,
  leadCategory,
}: {
  eventKind: string;
  organisationId: string;
  leadCategory: string;
}) {
  return eventKind === "new_website_enquiry_principal" &&
    organisationId === HOME_SEEKERS_ORGANISATION_ID &&
    leadCategory.toLowerCase() === "seller";
}

export function homeSeekersSellerDetails({
  sellerName,
  sellerEmail,
  sellerPhone,
  propertyAddress,
  enquiryMessage,
  leadUrl,
}: {
  sellerName: string;
  sellerEmail?: string;
  sellerPhone?: string;
  propertyAddress?: string;
  enquiryMessage?: string;
  leadUrl?: string;
}): HomeSeekersSellerEnquiry {
  const message = text(enquiryMessage, 1500);
  const addressFromMessage =
    /^Property address:\s*(.+)$/is.exec(message)?.[1]?.trim() || "";
  return {
    sellerName: text(sellerName, 160),
    sellerEmail: email(sellerEmail),
    sellerPhone: text(sellerPhone, 64),
    propertyAddress: text(propertyAddress || addressFromMessage, 300),
    message: addressFromMessage ? "" : message,
    leadUrl: text(leadUrl, 600),
  };
}

export function arch9ConciergeSender(configuredSender: string) {
  const address = email(
    /<([^>]+)>/.exec(configuredSender)?.[1] || configuredSender,
  ) || "no-reply@arch9.co.za";
  return `Arch9 Concierge <${address}>`;
}

export async function sendHomeSeekersSellerEnquiryEmails({
  apiKey,
  configuredSender,
  agencyTo,
  sellerTo,
  details,
  idempotencyKey,
}: {
  apiKey: string;
  configuredSender: string;
  agencyTo: string;
  sellerTo: string;
  details: HomeSeekersSellerEnquiry;
  idempotencyKey: string;
}) {
  const from = arch9ConciergeSender(configuredSender);
  const agency = buildHomeSeekersSellerAgencyEmail(details);
  const agencyResult = await sendViaResendApi({
    apiKey,
    from,
    to: email(agencyTo),
    subject: agency.subject,
    html: agency.html,
    text: agency.text,
    replyTo: "info@homeseeker.co.za",
    idempotencyKey: `${idempotencyKey}:agency`,
    timeoutMs: 10_000,
  });
  if (!agencyResult.ok) {
    return { ok: false as const, stage: "agency", error: agencyResult.error };
  }

  const recipient = email(sellerTo);
  const controlledRecipient = assessControlledTestRecipient({
    email: recipient,
  });
  if (!recipient || controlledRecipient.suppressed) {
    return {
      ok: true as const,
      agencyResponse: agencyResult.data,
      sellerSkipped: recipient
        ? controlledRecipient.reason
        : "missing_seller_email",
    };
  }

  const seller = buildHomeSeekersSellerClientEmail(details);
  const sellerResult = await sendViaResendApi({
    apiKey,
    from,
    to: recipient,
    subject: seller.subject,
    html: seller.html,
    text: seller.text,
    replyTo: "info@homeseeker.co.za",
    idempotencyKey: `${idempotencyKey}:seller`,
    timeoutMs: 10_000,
  });
  if (!sellerResult.ok) {
    return { ok: false as const, stage: "seller", error: sellerResult.error };
  }

  return {
    ok: true as const,
    agencyResponse: agencyResult.data,
    sellerResponse: sellerResult.data,
  };
}

/** A service-role-only preview. The recipient allowlist is removed after the test. */
export async function handleHomeSeekersSellerEmailPreview(
  request: Request,
  payload: Record<string, unknown>,
) {
  if (!hasVerifiedServiceRole(request)) {
    return jsonResponse(403, {
      error: "Preview requires service role access.",
    });
  }

  const allowedRecipient = email(
    Deno.env.get("HOME_SEEKERS_SELLER_PREVIEW_RECIPIENT"),
  );
  const recipient = email(payload.to);
  const sellerRecipient = email(payload.sellerEmail);
  if (
    !allowedRecipient || recipient !== allowedRecipient ||
    sellerRecipient !== allowedRecipient
  ) {
    return jsonResponse(403, { error: "Preview recipient is not allowed." });
  }

  const previewId = text(payload.previewId, 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(previewId)) {
    return jsonResponse(400, { error: "A valid previewId is required." });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey) {
    return jsonResponse(500, { error: "Email delivery is not configured." });
  }

  const result = await sendHomeSeekersSellerEnquiryEmails({
    apiKey,
    configuredSender: Deno.env.get("ARCH9_RESEND_FROM_EMAIL") ||
      Deno.env.get("RESEND_FROM_EMAIL") || "",
    agencyTo: recipient,
    sellerTo: sellerRecipient,
    details: {
      sellerName: text(payload.sellerName, 160) || "Alex",
      sellerEmail: sellerRecipient,
      propertyAddress: text(payload.propertyAddress, 300),
      message:
        "Design preview only. No real seller enquiry or follow-up is required.",
      preview: true,
    },
    idempotencyKey: `home-seekers-seller-preview:${previewId}`,
  });
  if (!result.ok) {
    return jsonResponse(502, {
      error: "Preview email delivery failed.",
      stage: result.stage,
      details: result.error,
    });
  }
  return jsonResponse(200, {
    ok: true,
    agencyProviderResponse: result.agencyResponse,
    sellerProviderResponse: "sellerResponse" in result
      ? result.sellerResponse
      : null,
  });
}
