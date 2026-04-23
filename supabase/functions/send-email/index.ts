import { handleClientOnboardingEmail } from "./handlers/clientOnboarding.ts";
import { handleLegacyTestEmail } from "./handlers/legacyTest.ts";
import { handleOnboardingSubmittedEmail } from "./handlers/onboardingSubmitted.ts";
import { handleReservationDepositEmail } from "./handlers/reservationDeposit.ts";
import { handleReservationDepositReceivedEmail } from "./handlers/reservationDepositReceived.ts";
import type {
  SendClientOnboardingPayload,
  SendLegacyTestPayload,
  SendOnboardingSubmittedPayload,
  SendReservationDepositPayload,
  SendReservationDepositReceivedPayload,
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

    if (["client_onboarding", "onboarding", "onboarding_email"].includes(type)) {
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
      return await handleOnboardingSubmittedEmail(
        req,
        {
          ...(payload as SendOnboardingSubmittedPayload),
          type: "onboarding_submitted",
          transactionId,
        },
      );
    }

    if ((payload as SendLegacyTestPayload).to) {
      return await handleLegacyTestEmail(payload as SendLegacyTestPayload);
    }

    return jsonResponse(400, {
      error: "Unknown email request type. Provide { type: 'client_onboarding' | 'onboarding_submitted' | 'reservation_deposit' | 'reservation_deposit_received', transactionId }.",
    });
  } catch (err) {
    console.error("Unhandled function error", err);
    return jsonResponse(500, { error: String(err) });
  }
});
