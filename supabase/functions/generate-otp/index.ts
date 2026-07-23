import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "x-legal-renderer-contract": "phase2-canonical-otp-pdf-v1",
    },
  });
}

// Retired permanently. This endpoint created an unbound DOCX and could never
// prove that the file reviewed by the parties was the file later signed. OTP
// rendering now happens through generate-mandate's packet-bound native PDF
// path, which seals C4 → D1 → D2 → D3 before it returns.
Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed.", errorCode: "METHOD_NOT_ALLOWED" });
  }
  return jsonResponse(410, {
    success: false,
    error: "The legacy OTP DOCX renderer is retired. Reissue this offer through the canonical packet-bound PDF workflow.",
    errorCode: "OTP_LEGACY_RENDERER_RETIRED",
    retryable: false,
    requiredAction: "CREATE_OR_REISSUE_CANONICAL_OTP_PDF",
  });
});
