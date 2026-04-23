import { createClient } from "supabase";
import {
  buildReservationDepositReceivedEmailHtml,
  buildReservationDepositReceivedEmailText,
  buildReservationDepositReceivedSubject,
} from "../content/reservationDepositReceived.ts";
import { logReservationDepositReceivedSideEffects } from "../services/reservationDepositReceivedLogging.ts";
import { buildReservationDepositReceivedEmailPayload } from "../services/reservationDepositReceivedPayload.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendReservationDepositReceivedPayload } from "../types.ts";
import { isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeReservationStatus } from "../utils/reservation.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

export async function handleReservationDepositReceivedEmail(
  req: Request,
  payload: SendReservationDepositReceivedPayload,
) {
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();

  const transactionQuery = await supabase
    .from("transactions")
    .select(
      "id, buyer_id, development_id, unit_id, transaction_reference, reservation_required, reservation_status",
    )
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

  if (!transaction.reservation_required) {
    return jsonResponse(200, {
      ok: true,
      type: "reservation_deposit_received",
      sent: false,
      reason: "not_required",
      transactionId: transaction.id,
      recipientEmail: "",
    });
  }

  const reservationStatus = normalizeReservationStatus(transaction.reservation_status, {
    required: true,
  });
  if (reservationStatus !== "verified") {
    return jsonResponse(200, {
      ok: true,
      type: "reservation_deposit_received",
      sent: false,
      reason: "not_verified",
      transactionId: transaction.id,
      recipientEmail: "",
      error: "Reservation deposit is not marked as verified yet.",
    });
  }

  const [buyerQuery, developmentQuery, unitQuery, portalLinkQuery] = await Promise.all([
    transaction.buyer_id
      ? supabase
          .from("buyers")
          .select("id, name, email")
          .eq("id", transaction.buyer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.development_id
      ? supabase
          .from("developments")
          .select("id, name")
          .eq("id", transaction.development_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.unit_id
      ? supabase
          .from("units")
          .select("id, unit_number")
          .eq("id", transaction.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("client_portal_links")
      .select("id, token, is_active, transaction_id")
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
  if (!buyerEmail) {
    return jsonResponse(200, {
      ok: true,
      type: "reservation_deposit_received",
      sent: false,
      reason: "missing_buyer_email",
      transactionId: transaction.id,
      recipientEmail: "",
      error: "Buyer email is missing. Capture buyer email before sending reservation payment confirmation.",
    });
  }

  const developmentName = normalizeText(developmentQuery.data?.name);
  const unitNumber = normalizeText(unitQuery.data?.unit_number);
  const unitLabel = unitNumber ? `Unit ${unitNumber}` : "";
  const transactionReference = normalizeText(transaction.transaction_reference);
  const clientPortalToken = normalizeText(portalLinkQuery.data?.token);

  let clientPortalLink = "";
  if (appBaseUrl && clientPortalToken) {
    clientPortalLink = `${appBaseUrl}/client/${clientPortalToken}`;
  } else if (appBaseUrl) {
    clientPortalLink = `${appBaseUrl}/client-access`;
  }

  const payloadModel = buildReservationDepositReceivedEmailPayload({
    buyerName,
    buyerEmail,
    developmentName,
    unitLabel,
    transactionReference,
    clientPortalLink,
  });

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to: buyerEmail,
    subject: buildReservationDepositReceivedSubject(),
    html: buildReservationDepositReceivedEmailHtml(payloadModel),
    text: buildReservationDepositReceivedEmailText(payloadModel),
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send reservation payment confirmation email.",
      details: emailResult.error,
    });
  }

  await logReservationDepositReceivedSideEffects({
    supabase,
    transactionId: transaction.id,
    recipientEmail: buyerEmail,
    emailId: emailResult.data?.id || null,
    nowIso,
    source: normalizeText(payload.source) || "reservation_payment_received",
  });

  return jsonResponse(200, {
    ok: true,
    type: "reservation_deposit_received",
    sent: true,
    reason: payload.resend ? "resent" : "sent",
    transactionId: transaction.id,
    recipientEmail: buyerEmail,
    clientPortalLink,
    transactionReference,
    emailId: emailResult.data?.id || null,
    emailSentAt: nowIso,
  });
}
