import { handleClientOnboardingEmail } from "./handlers/clientOnboarding.ts";
import { handleLegacyTestEmail } from "./handlers/legacyTest.ts";
import { handleOnboardingSubmittedEmail } from "./handlers/onboardingSubmitted.ts";
import { handleReservationDepositEmail } from "./handlers/reservationDeposit.ts";
import { handleReservationDepositReceivedEmail } from "./handlers/reservationDepositReceived.ts";
import { handleSellerOnboardingEmail } from "./handlers/sellerOnboarding.ts";
import { handleSellerOnboardingSubmittedEmail } from "./handlers/sellerOnboardingSubmitted.ts";
import { handleSellerMandateSentEmail } from "./handlers/sellerMandateSent.ts";
import { handleSellerMandateSignedEmail } from "./handlers/sellerMandateSigned.ts";
import { handleAppointmentEmail } from "./handlers/appointment.ts";
import type {
  SendAppointmentEmailPayload,
  SendClientOnboardingPayload,
  SendLegacyTestPayload,
  SendOnboardingSubmittedPayload,
  SendReservationDepositPayload,
  SendReservationDepositReceivedPayload,
  SendSellerMandateSignedPayload,
  SendSellerMandateSentPayload,
  SendSellerOnboardingPayload,
  SendSellerOnboardingSubmittedPayload,
} from "./types.ts";
import { corsHeaders, jsonResponse } from "./utils/http.ts";
import { normalizeText } from "./utils/text.ts";

type EmailRequestEnvelope = Record<string, unknown>;

function toRecord(value: unknown): EmailRequestEnvelope | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EmailRequestEnvelope)
    : null;
}

function resolveEmailPayload(body: unknown): EmailRequestEnvelope | null {
  const root = toRecord(body);
  if (!root) return null;

  if (normalizeText(root.type)) {
    return root;
  }

  const nestedBody = toRecord(root.body);
  if (nestedBody && normalizeText(nestedBody.type)) {
    return nestedBody;
  }

  const nestedPayload = toRecord(root.payload);
  if (nestedPayload && normalizeText(nestedPayload.type)) {
    return nestedPayload;
  }

  return root;
}

function resolveTransactionId(payload: EmailRequestEnvelope): string {
  return normalizeText(payload.transactionId ?? payload.transaction_id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await req.json();
    const payload = resolveEmailPayload(body);

    if (!payload) {
      return jsonResponse(400, { error: "Invalid request body." });
    }

    const normalizedType = normalizeText(payload.type).toLowerCase();
    const type = normalizedType.replaceAll("-", "_");
    const transactionId = resolveTransactionId(payload);
    const recipient = normalizeText(payload.to).toLowerCase();
    const payloadKeys = Object.keys(payload || {});

    console.log("[send-email] incoming request", {
      resolvedType: type || null,
      hasType: Boolean(type),
      recipient: recipient || null,
      transactionId: transactionId || null,
      payloadKeys,
    });

    if (["client_onboarding", "onboarding", "onboarding_email"].includes(type)) {
      console.log("[send-email] routing template", { route: "client_onboarding", recipient: recipient || null, transactionId: transactionId || null });
      return await handleClientOnboardingEmail(
        req,
        {
          ...(payload as SendClientOnboardingPayload),
          type: "client_onboarding",
          transactionId,
        },
      );
    }

    if (["reservation_deposit", "deposit_request", "reservation"].includes(type)) {
      console.log("[send-email] routing template", { route: "reservation_deposit", recipient: recipient || null, transactionId: transactionId || null });
      return await handleReservationDepositEmail(
        req,
        {
          ...(payload as SendReservationDepositPayload),
          type: "reservation_deposit",
          transactionId,
        },
      );
    }

    if (["reservation_deposit_received", "deposit_received"].includes(type)) {
      console.log("[send-email] routing template", { route: "reservation_deposit_received", recipient: recipient || null, transactionId: transactionId || null });
      return await handleReservationDepositReceivedEmail(
        req,
        {
          ...(payload as SendReservationDepositReceivedPayload),
          type: "reservation_deposit_received",
          transactionId,
        },
      );
    }

    if (["onboarding_submitted", "client_onboarding_submitted"].includes(type)) {
      console.log("[send-email] routing template", { route: "onboarding_submitted", recipient: recipient || null, transactionId: transactionId || null });
      return await handleOnboardingSubmittedEmail(
        req,
        {
          ...(payload as SendOnboardingSubmittedPayload),
          type: "onboarding_submitted",
          transactionId,
        },
      );
    }

    if (["seller_onboarding", "seller_onboarding_link"].includes(type)) {
      console.log("[send-email] routing template", { route: "seller_onboarding", recipient: recipient || null });
      return await handleSellerOnboardingEmail(payload as SendSellerOnboardingPayload);
    }

    if (["seller_onboarding_submitted"].includes(type)) {
      console.log("[send-email] routing template", { route: "seller_onboarding_submitted", recipient: recipient || null });
      return await handleSellerOnboardingSubmittedEmail(payload as SendSellerOnboardingSubmittedPayload);
    }

    if (["seller_mandate_sent", "seller_mandate"].includes(type)) {
      console.log("[send-email] routing template", { route: "seller_mandate_sent", recipient: recipient || null });
      return await handleSellerMandateSentEmail(payload as SendSellerMandateSentPayload);
    }

    if (["seller_mandate_signed"].includes(type)) {
      console.log("[send-email] routing template", { route: "seller_mandate_signed", recipient: recipient || null });
      return await handleSellerMandateSignedEmail(payload as SendSellerMandateSignedPayload);
    }

    if (
      [
        "appointment_scheduled",
        "seller_appointment_scheduled",
        "appointment_updated",
        "appointment_cancelled",
        "appointment_rescheduled",
        "appointment_confirmation_required",
        "appointment_reminder",
        "appointment_documents_required",
      ].includes(type)
    ) {
      const routedType = type === "seller_appointment_scheduled" ? "appointment_scheduled" : type;
      console.log("[send-email] routing template", { route: "appointment", type: routedType, recipient: recipient || null, transactionId: transactionId || null });
      return await handleAppointmentEmail({
        ...(payload as SendAppointmentEmailPayload),
        type: routedType as SendAppointmentEmailPayload["type"],
        transactionId,
      });
    }

    if (["legacy_test", "test_email", "bridge_email_test"].includes(type) && (payload as SendLegacyTestPayload).to) {
      console.log("[send-email] routing template", { route: "legacy_test", recipient: recipient || null });
      return await handleLegacyTestEmail(payload as SendLegacyTestPayload);
    }

    if (!type) {
      return jsonResponse(400, {
        error: "Missing email type. The send-email function requires an explicit template type.",
        supportedTypes: [
          "client_onboarding",
          "onboarding_submitted",
          "reservation_deposit",
          "reservation_deposit_received",
          "seller_onboarding",
          "seller_onboarding_submitted",
          "seller_mandate_sent",
          "seller_mandate_signed",
          "appointment_scheduled",
          "appointment_updated",
          "appointment_cancelled",
          "appointment_rescheduled",
          "appointment_confirmation_required",
          "appointment_reminder",
          "appointment_documents_required",
          "legacy_test",
        ],
      });
    }

    return jsonResponse(400, {
      error: "Unknown email request type. Legacy test fallback is disabled for untyped/unknown requests.",
      receivedType: type,
      supportedTypes: [
        "client_onboarding",
        "onboarding_submitted",
        "reservation_deposit",
        "reservation_deposit_received",
        "seller_onboarding",
        "seller_onboarding_submitted",
        "seller_mandate_sent",
        "seller_mandate_signed",
        "appointment_scheduled",
        "appointment_updated",
        "appointment_cancelled",
        "appointment_rescheduled",
        "appointment_confirmation_required",
        "appointment_reminder",
        "appointment_documents_required",
        "legacy_test",
      ],
    });
  } catch (err) {
    console.error("Unhandled function error", err);
    return jsonResponse(500, { error: String(err) });
  }
});
