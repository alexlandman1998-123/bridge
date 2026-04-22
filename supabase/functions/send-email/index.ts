import { handleClientOnboardingEmail } from "./handlers/clientOnboarding.ts";
import { handleLegacyTestEmail } from "./handlers/legacyTest.ts";
import { handleOnboardingSubmittedEmail } from "./handlers/onboardingSubmitted.ts";
import { handleReservationDepositEmail } from "./handlers/reservationDeposit.ts";
import type {
  SendClientOnboardingPayload,
  SendLegacyTestPayload,
  SendOnboardingSubmittedPayload,
  SendReservationDepositPayload,
} from "./types.ts";
import { corsHeaders, jsonResponse } from "./utils/http.ts";
import { normalizeText } from "./utils/text.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return jsonResponse(400, { error: "Invalid request body." });
    }

    const type = normalizeText((body as { type?: string }).type).toLowerCase();

    if (type === "client_onboarding") {
      return await handleClientOnboardingEmail(
        req,
        body as SendClientOnboardingPayload,
      );
    }

    if (type === "reservation_deposit") {
      return await handleReservationDepositEmail(
        req,
        body as SendReservationDepositPayload,
      );
    }

    if (type === "onboarding_submitted") {
      return await handleOnboardingSubmittedEmail(
        req,
        body as SendOnboardingSubmittedPayload,
      );
    }

    if ((body as SendLegacyTestPayload).to) {
      return await handleLegacyTestEmail(body as SendLegacyTestPayload);
    }

    return jsonResponse(400, {
      error: "Unknown email request type. Provide { type: 'client_onboarding' | 'onboarding_submitted' | 'reservation_deposit', transactionId }.",
    });
  } catch (err) {
    console.error("Unhandled function error", err);
    return jsonResponse(500, { error: String(err) });
  }
});
