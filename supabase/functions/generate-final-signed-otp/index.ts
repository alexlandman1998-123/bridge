import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

const FINALISER_CONTRACT = "h4-v1";
const OTP_FINALISATION_DISABLED_ERROR_CODE = "OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "x-legal-finalizer-contract": FINALISER_CONTRACT,
    },
  });
}

/**
 * Phase 0 containment.
 *
 * This endpoint previously rebuilt an Offer to Purchase from placeholders and
 * signature assets. That creates a new document rather than finalising the
 * exact PDF the parties reviewed, so it must never be used for a legal final
 * artifact. It remains deployed only to return a deterministic, auditable
 * error to old callers until OTP is moved onto the canonical PDF finaliser.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response(405, {
      success: false,
      error: "Method not allowed.",
      errorCode: "METHOD_NOT_ALLOWED",
    });
  }

  return response(503, {
    success: false,
    error: "OTP finalisation is disabled because the legacy path reconstructs a different document instead of finalising the exact reviewed PDF. Reissue the OTP through the canonical PDF workflow.",
    errorCode: OTP_FINALISATION_DISABLED_ERROR_CODE,
    retryable: false,
    requiredAction: "REISSUE_CANONICAL_OTP_PDF",
  });
});
