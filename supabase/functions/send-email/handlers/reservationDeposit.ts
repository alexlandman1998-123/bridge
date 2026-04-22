import { createClient } from "supabase";
import {
  buildReservationDepositEmailHtml,
  buildReservationDepositEmailText,
  buildReservationDepositSubject,
} from "../content/reservationDeposit.ts";
import { buildReservationDepositEmailPayload } from "../services/reservationDepositPayload.ts";
import { logReservationDepositSideEffects } from "../services/reservationDepositLogging.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type {
  ReservationPaymentDetails,
  SendReservationDepositPayload,
  TransactionOnboardingRow,
} from "../types.ts";
import { isMissingColumnError, isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { jsonResponse } from "../utils/http.ts";
import {
  buildReservationPaymentReference,
  normalizeOptionalNumber,
  normalizeReservationPaymentDetails,
  normalizeReservationStatus,
} from "../utils/reservation.ts";
import { normalizeText, pickMostRecentOnboardingRow } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const DEFAULT_RESERVATION_DETAILS: ReservationPaymentDetails = {
  account_holder_name: "",
  bank_name: "",
  account_number: "",
  branch_code: "",
  account_type: "",
  payment_reference_format: "",
  payment_instructions: "",
};

async function fetchDevelopmentReservationDefaults(supabase: any, developmentId: string) {
  if (!developmentId) {
    return {
      reservationAmount: null,
      reservationPaymentDetails: DEFAULT_RESERVATION_DETAILS,
    };
  }

  const settingsQuery = await supabase
    .from("development_settings")
    .select(
      "development_id, reservation_deposit_amount, reservation_deposit_payment_details",
    )
    .eq("development_id", developmentId)
    .maybeSingle();

  if (settingsQuery.error) {
    if (
      isMissingSchemaError(settingsQuery.error) ||
      isMissingTableError(settingsQuery.error, "development_settings") ||
      isMissingColumnError(settingsQuery.error, "reservation_deposit_amount") ||
      isMissingColumnError(settingsQuery.error, "reservation_deposit_payment_details")
    ) {
      return {
        reservationAmount: null,
        reservationPaymentDetails: DEFAULT_RESERVATION_DETAILS,
      };
    }
    throw settingsQuery.error;
  }

  const reservationPaymentDetails = normalizeReservationPaymentDetails(
    settingsQuery.data?.reservation_deposit_payment_details || {},
  );
  const reservationAmount = normalizeOptionalNumber(
    settingsQuery.data?.reservation_deposit_amount,
  );

  return {
    reservationAmount,
    reservationPaymentDetails,
  };
}

async function resolveUploadProofLink({
  supabase,
  transactionId,
  appBaseUrl,
}: {
  supabase: any;
  transactionId: string;
  appBaseUrl: string;
}) {
  if (!transactionId || !appBaseUrl) {
    return "";
  }

  const onboardingQuery = await supabase
    .from("transaction_onboarding")
    .select("id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at")
    .eq("transaction_id", transactionId)
    .eq("is_active", true);

  if (onboardingQuery.error) {
    if (
      isMissingSchemaError(onboardingQuery.error) ||
      isMissingTableError(onboardingQuery.error, "transaction_onboarding")
    ) {
      return "";
    }
    console.error("Onboarding lookup failed for reservation upload link", onboardingQuery.error);
    return "";
  }

  const rows = Array.isArray(onboardingQuery.data)
    ? (onboardingQuery.data as TransactionOnboardingRow[])
    : [];
  const latest = pickMostRecentOnboardingRow(rows);
  const token = normalizeText(latest?.token);
  if (!token) {
    return "";
  }

  return `${appBaseUrl}/client/onboarding/${token}`;
}

export async function handleReservationDepositEmail(
  req: Request,
  payload: SendReservationDepositPayload,
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

  let transactionQuery = await supabase
    .from("transactions")
    .select(
      "id, development_id, unit_id, buyer_id, transaction_reference, reservation_required, reservation_amount, reservation_status, reservation_payment_details, reservation_requested_at, reservation_email_sent_at",
    )
    .eq("id", transactionId)
    .maybeSingle();

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, "transaction_reference") ||
      isMissingColumnError(transactionQuery.error, "reservation_payment_details") ||
      isMissingColumnError(transactionQuery.error, "reservation_requested_at") ||
      isMissingColumnError(transactionQuery.error, "reservation_email_sent_at"))
  ) {
    transactionQuery = await supabase
      .from("transactions")
      .select("id, development_id, unit_id, buyer_id, reservation_required, reservation_amount, reservation_status")
      .eq("id", transactionId)
      .maybeSingle();
  }

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
      type: "reservation_deposit",
      sent: false,
      reason: "not_required",
      transactionId: transaction.id,
      recipientEmail: "",
    });
  }

  const reservationStatus = normalizeReservationStatus(transaction.reservation_status, {
    required: true,
  });

  if (!payload.resend && reservationStatus === "verified") {
    return jsonResponse(200, {
      ok: true,
      type: "reservation_deposit",
      sent: false,
      reason: "already_verified",
      transactionId: transaction.id,
      recipientEmail: "",
    });
  }

  const [buyerQuery, unitQuery, developmentQuery, defaults, uploadProofLink] = await Promise.all([
    transaction.buyer_id
      ? supabase.from("buyers").select("id, name, email").eq("id", transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.unit_id
      ? supabase.from("units").select("id, unit_number").eq("id", transaction.unit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.development_id
      ? supabase.from("developments").select("id, name").eq("id", transaction.development_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fetchDevelopmentReservationDefaults(supabase, transaction.development_id || ""),
    resolveUploadProofLink({
      supabase,
      transactionId: transaction.id,
      appBaseUrl,
    }),
  ]);

  if (buyerQuery.error) {
    return jsonResponse(500, {
      error: buyerQuery.error.message || "Failed to load buyer.",
      code: buyerQuery.error.code || null,
    });
  }
  if (unitQuery.error && !isMissingSchemaError(unitQuery.error)) {
    return jsonResponse(500, {
      error: unitQuery.error.message || "Failed to load unit.",
      code: unitQuery.error.code || null,
    });
  }
  if (developmentQuery.error && !isMissingSchemaError(developmentQuery.error)) {
    return jsonResponse(500, {
      error: developmentQuery.error.message || "Failed to load development.",
      code: developmentQuery.error.code || null,
    });
  }

  const buyerName = normalizeText(buyerQuery.data?.name) || "Client";
  const buyerEmail = normalizeText(buyerQuery.data?.email).toLowerCase();
  if (!buyerEmail) {
    return jsonResponse(200, {
      ok: true,
      type: "reservation_deposit",
      sent: false,
      reason: "missing_buyer_email",
      transactionId: transaction.id,
      recipientEmail: "",
      error: "Buyer email is missing. Capture buyer email before sending reservation deposit email.",
    });
  }

  const transactionReservationAmount = normalizeOptionalNumber(transaction.reservation_amount);
  const resolvedReservationAmount = transactionReservationAmount ?? defaults.reservationAmount;

  if (resolvedReservationAmount === null || resolvedReservationAmount <= 0) {
    return jsonResponse(200, {
      ok: true,
      type: "reservation_deposit",
      sent: false,
      reason: "missing_reservation_amount",
      transactionId: transaction.id,
      recipientEmail: buyerEmail,
      error:
        "Reservation deposit amount is missing. Set transaction reservation amount or development default before sending.",
    });
  }

  const transactionPaymentDetails = normalizeReservationPaymentDetails(
    transaction.reservation_payment_details || {},
  );
  const fallbackPaymentDetails = normalizeReservationPaymentDetails(
    defaults.reservationPaymentDetails || {},
  );
  const paymentDetails: ReservationPaymentDetails = {
    account_holder_name:
      transactionPaymentDetails.account_holder_name || fallbackPaymentDetails.account_holder_name,
    bank_name: transactionPaymentDetails.bank_name || fallbackPaymentDetails.bank_name,
    account_number: transactionPaymentDetails.account_number || fallbackPaymentDetails.account_number,
    branch_code: transactionPaymentDetails.branch_code || fallbackPaymentDetails.branch_code,
    account_type: transactionPaymentDetails.account_type || fallbackPaymentDetails.account_type,
    payment_reference_format:
      transactionPaymentDetails.payment_reference_format || fallbackPaymentDetails.payment_reference_format,
    payment_instructions:
      transactionPaymentDetails.payment_instructions || fallbackPaymentDetails.payment_instructions,
  };

  const missingPaymentFields = [
    !paymentDetails.account_holder_name ? "account_holder_name" : "",
    !paymentDetails.bank_name ? "bank_name" : "",
    !paymentDetails.account_number ? "account_number" : "",
    !paymentDetails.branch_code ? "branch_code" : "",
  ].filter(Boolean);

  if (missingPaymentFields.length) {
    return jsonResponse(200, {
      ok: true,
      type: "reservation_deposit",
      sent: false,
      reason: "missing_payment_details",
      transactionId: transaction.id,
      recipientEmail: buyerEmail,
      error:
        `Reservation payment details are missing (${missingPaymentFields.join(", ")}). ` +
        "Update transaction/development reservation payment settings before sending.",
    });
  }

  const unitNumber = normalizeText(unitQuery.data?.unit_number);
  const unitLabel = unitNumber ? `Unit ${unitNumber}` : "";
  const developmentName = normalizeText(developmentQuery.data?.name);
  const transactionReference = normalizeText(transaction.transaction_reference);

  const paymentReference = buildReservationPaymentReference({
    referenceFormat: paymentDetails.payment_reference_format,
    unitNumber,
    transactionId: transaction.id,
    buyerName,
  });

  const reservationEmailPayload = buildReservationDepositEmailPayload({
    buyerName,
    buyerEmail,
    developmentName,
    unitLabel,
    transactionReference,
    reservationDepositAmount: resolvedReservationAmount,
    paymentReference,
    paymentDetails,
    uploadProofLink,
  });

  const sender =
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Bridge <onboarding@resend.dev>";

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to: buyerEmail,
    subject: buildReservationDepositSubject(reservationEmailPayload),
    html: buildReservationDepositEmailHtml(reservationEmailPayload),
    text: buildReservationDepositEmailText(reservationEmailPayload),
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send reservation deposit email.",
      details: emailResult.error,
    });
  }

  const nextReservationStatus = reservationStatus === "verified" ? "verified" : "pending";
  const requestedAt = normalizeText(transaction.reservation_requested_at) || nowIso;
  const updatePayload = {
    reservation_status: nextReservationStatus,
    reservation_amount: resolvedReservationAmount,
    reservation_payment_details: paymentDetails,
    reservation_requested_at: requestedAt,
    reservation_email_sent_at: nowIso,
    updated_at: nowIso,
  };

  let updateResult = await supabase
    .from("transactions")
    .update(updatePayload)
    .eq("id", transaction.id);

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, "reservation_payment_details") ||
      isMissingColumnError(updateResult.error, "reservation_requested_at") ||
      isMissingColumnError(updateResult.error, "reservation_email_sent_at"))
  ) {
    const fallbackPayload = {
      reservation_status: nextReservationStatus,
      reservation_amount: resolvedReservationAmount,
      updated_at: nowIso,
    };
    updateResult = await supabase
      .from("transactions")
      .update(fallbackPayload)
      .eq("id", transaction.id);
  }

  if (updateResult.error) {
    return jsonResponse(500, {
      error: updateResult.error.message || "Failed to update reservation status after send.",
      code: updateResult.error.code || null,
    });
  }

  const normalizedActorRole = normalizeText(payload.actorRole).toLowerCase() || "system";
  const normalizedActorUserId = normalizeText(payload.actorUserId) || null;
  const source = normalizeText(payload.source) || "reservation_deposit_request";

  await logReservationDepositSideEffects({
    supabase,
    transactionId: transaction.id,
    source,
    forceResend: Boolean(payload.resend),
    requestedAt,
    nowIso,
    reservationAmount: resolvedReservationAmount,
    paymentReference,
    recipientEmail: buyerEmail,
    buyerName,
    actorRole: normalizedActorRole,
    actorUserId: normalizedActorUserId,
    emailId: emailResult.data?.id || null,
    reservationStatus: nextReservationStatus,
  });

  return jsonResponse(200, {
    ok: true,
    type: "reservation_deposit",
    sent: true,
    reason: payload.resend ? "resent" : "sent",
    transactionId: transaction.id,
    recipientEmail: buyerEmail,
    reservationDepositAmount: resolvedReservationAmount,
    formattedReservationDepositAmount: reservationEmailPayload.formattedReservationDepositAmount,
    paymentReference,
    status: nextReservationStatus,
    emailSentAt: nowIso,
    emailId: emailResult.data?.id || null,
  });
}
