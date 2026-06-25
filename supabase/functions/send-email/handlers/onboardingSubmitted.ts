import { createClient } from "supabase";
import {
  buildOnboardingSubmittedEmailHtml,
  buildOnboardingSubmittedEmailText,
  buildOnboardingSubmittedSubject,
  buildClientPortalLinkEmailHtml,
  buildClientPortalLinkEmailText,
  buildClientPortalLinkSubject,
} from "../content/onboardingSubmitted.ts";
import {
  logOnboardingSubmittedEmailSideEffects,
  notifyOwnerOnOnboardingSubmitted,
} from "../services/onboardingSubmittedLogging.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
import { buildOnboardingSubmittedEmailPayload } from "../services/onboardingSubmittedPayload.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendOnboardingSubmittedPayload } from "../types.ts";
import { isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const AUTH_MODEL = "token_scoped_client_portal_link";

function normalizeUuidText(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") return "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

export async function handleOnboardingSubmittedEmail(
  req: Request,
  payload: SendOnboardingSubmittedPayload,
) {
  const requestedType = normalizeText(payload.type).toLowerCase();
  const isClientPortalLinkEmail = requestedType === "client_portal_link";
  const transactionId = normalizeText(payload.transactionId);
  if (!transactionId) {
    return jsonResponse(400, { error: "Missing required field: transactionId" });
  }

  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.",
    });
  }

  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const appBaseUrl = resolveAppBaseUrl(req);
  if (!appBaseUrl) {
    return jsonResponse(200, {
      ok: true,
      type: "onboarding_submitted",
      sent: false,
      reason: "missing_app_base_url",
      transactionId,
      recipientEmail: "",
      error:
        "Unable to resolve client app URL. Set CLIENT_APP_URL (or PUBLIC_APP_URL) before sending onboarding submitted emails.",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();

  const transactionQuery = await supabase
    .from("transactions")
    .select("id, buyer_id, development_id, unit_id, transaction_reference")
    .eq("id", transactionId)
    .maybeSingle();

  if (transactionQuery.error) {
    return jsonResponse(500, {
      error: transactionQuery.error.message || "Failed to load transaction.",
      code: transactionQuery.error.code || null,
    });
  }

  const transaction = transactionQuery.data;
  if (!transaction) {
    return jsonResponse(404, { error: "Transaction not found." });
  }
  const buyerId = normalizeUuidText(transaction.buyer_id);
  const developmentId = normalizeUuidText(transaction.development_id);
  const unitId = normalizeUuidText(transaction.unit_id);

  const [buyerQuery, developmentQuery, unitQuery, portalLinkQuery] = await Promise.all([
    buyerId
      ? supabase
          .from("buyers")
          .select("id, name, email")
          .eq("id", buyerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    developmentId
      ? supabase
          .from("developments")
          .select("id, name")
          .eq("id", developmentId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    unitId
      ? supabase
          .from("units")
          .select("id, unit_number")
          .eq("id", unitId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("client_portal_links")
      .select("id, transaction_id, buyer_id, token, is_active, created_at, updated_at")
      .eq("transaction_id", transaction.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (buyerQuery.error) {
    return jsonResponse(500, {
      error: buyerQuery.error.message || "Failed to load buyer.",
      code: buyerQuery.error.code || null,
    });
  }

  if (developmentQuery.error && !isMissingSchemaError(developmentQuery.error)) {
    return jsonResponse(500, {
      error: developmentQuery.error.message || "Failed to load development.",
      code: developmentQuery.error.code || null,
    });
  }

  if (unitQuery.error && !isMissingSchemaError(unitQuery.error)) {
    return jsonResponse(500, {
      error: unitQuery.error.message || "Failed to load unit.",
      code: unitQuery.error.code || null,
    });
  }

  if (
    portalLinkQuery.error &&
    !isMissingSchemaError(portalLinkQuery.error) &&
    !isMissingTableError(portalLinkQuery.error, "client_portal_links")
  ) {
    return jsonResponse(500, {
      error: portalLinkQuery.error.message || "Failed to load client portal link.",
      code: portalLinkQuery.error.code || null,
    });
  }

  const buyerName = normalizeText(buyerQuery.data?.name) || "Client";
  const buyerEmail = normalizeText(buyerQuery.data?.email).toLowerCase();
  const resolvedTransactionId = normalizeText(transaction.id);
  const developmentName = normalizeText(developmentQuery.data?.name);
  const unitNumber = normalizeText(unitQuery.data?.unit_number);
  const unitLabel = unitNumber ? `Unit ${unitNumber}` : "";
  const transactionReference = normalizeText(transaction.transaction_reference);

  async function notifyOwnerIfPossible() {
    try {
      await notifyOwnerOnOnboardingSubmitted({
        supabase,
        transactionId: resolvedTransactionId,
        buyerName,
        developmentName,
        unitLabel,
        transactionReference,
      });
    } catch (notificationError) {
      console.error("Owner onboarding notification failed", notificationError);
    }
  }

  if (!buyerEmail) {
    await notifyOwnerIfPossible();
    return jsonResponse(200, {
      ok: true,
      type: "onboarding_submitted",
      sent: false,
      reason: "missing_buyer_email",
      transactionId: transaction.id,
      recipientEmail: "",
      error: "Buyer email is missing. Capture buyer email before sending onboarding submitted email.",
    });
  }

  const clientPortalToken = normalizeText(portalLinkQuery.data?.token);
  const portalLinkBuyerId = normalizeUuidText(portalLinkQuery.data?.buyer_id);
  const transactionBuyerId = buyerId;
  const portalBuyerAligned =
    !portalLinkBuyerId || !transactionBuyerId || portalLinkBuyerId === transactionBuyerId;

  if (!portalBuyerAligned) {
    await notifyOwnerIfPossible();
    return jsonResponse(200, {
      ok: true,
      type: "onboarding_submitted",
      sent: false,
      reason: "portal_buyer_mismatch",
      transactionId: transaction.id,
      recipientEmail: buyerEmail,
      error:
        "Client portal link buyer does not match the transaction buyer. Regenerate or correct the client portal link before sending onboarding submitted email.",
    });
  }

  if (!clientPortalToken) {
    await notifyOwnerIfPossible();
    return jsonResponse(200, {
      ok: true,
      type: "onboarding_submitted",
      sent: false,
      reason: "missing_client_portal_link",
      transactionId: transaction.id,
      recipientEmail: buyerEmail,
      error:
        "Client portal link is missing for this transaction. Create an active client portal link before sending onboarding submitted email.",
    });
  }

  const clientPortalLink = `${appBaseUrl}/client/${clientPortalToken}`;

  const payloadModel = buildOnboardingSubmittedEmailPayload({
    buyerName,
    buyerEmail,
    developmentName,
    unitLabel,
    transactionReference,
    clientPortalLink,
  });

  const emailSubject = isClientPortalLinkEmail
    ? buildClientPortalLinkSubject()
    : buildOnboardingSubmittedSubject();

  const emailHtml = isClientPortalLinkEmail
    ? buildClientPortalLinkEmailHtml(payloadModel)
    : buildOnboardingSubmittedEmailHtml(payloadModel);

  const emailText = isClientPortalLinkEmail
    ? buildClientPortalLinkEmailText(payloadModel)
    : buildOnboardingSubmittedEmailText(payloadModel);
  const communicationType = isClientPortalLinkEmail
    ? "client_portal_link"
    : "onboarding_submitted";

  let authProfileExists = false;
  const authProfileQuery = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", buyerEmail)
    .limit(1)
    .maybeSingle();
  if (authProfileQuery.error) {
    if (!isMissingSchemaError(authProfileQuery.error) && !isMissingTableError(authProfileQuery.error, "profiles")) {
      console.warn("Profile lookup failed for onboarding_submitted email auth validation", authProfileQuery.error);
    }
  } else {
    authProfileExists = Boolean(authProfileQuery.data?.id);
  }

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";

  const delivery = await prepareEmailDelivery(payload as Record<string, unknown>, {
    communicationType,
    recipient: buyerEmail,
    recipientRole: "buyer",
    subject: emailSubject,
    messagePreview: emailText,
    context: {
      transactionId: resolvedTransactionId,
      metadata: {
        clientPortalToken,
        portalBuyerAligned,
      },
    },
  });

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to: buyerEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });

  if (!emailResult.ok) {
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage:
        emailResult.error?.message ||
        "Failed to send onboarding submitted email.",
    });
    await notifyOwnerIfPossible();
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send onboarding submitted email.",
      details: emailResult.error,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  await logOnboardingSubmittedEmailSideEffects({
    supabase,
    transactionId: transaction.id,
    buyerEmail,
    buyerName,
    developmentName,
    unitLabel,
    transactionReference,
    clientPortalLink,
    emailId: emailResult.data?.id || null,
    nowIso,
    authProfileExists,
    authModel: AUTH_MODEL,
    portalBuyerAligned,
  });

  return jsonResponse(200, {
    ok: true,
    type: isClientPortalLinkEmail ? "client_portal_link" : "onboarding_submitted",
    sent: true,
    reason: payload.resend ? "resent" : "sent",
    transactionId: transaction.id,
    recipientEmail: buyerEmail,
    clientPortalLink,
    transactionReference,
    authModel: AUTH_MODEL,
    authProfileExists,
    portalBuyerAligned,
    emailId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
    emailSentAt: nowIso,
  });
}
