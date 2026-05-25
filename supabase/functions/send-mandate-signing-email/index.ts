import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleSellerMandateSentEmail } from "../send-email/handlers/sellerMandateSent.ts";
import { corsHeaders, jsonResponse } from "../send-email/utils/http.ts";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const payload = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const type = normalizeText(payload.type).toLowerCase().replaceAll("-", "_");
    if (!["seller_mandate_sent", "seller_mandate"].includes(type)) {
      return jsonResponse(400, { error: "Unsupported mandate signing email type." });
    }
    return await handleSellerMandateSentEmail({
      ...payload,
      type: "seller_mandate_sent",
    } as never);
  } catch (error) {
    console.error("send-mandate-signing-email failed", error);
    return jsonResponse(500, {
      error: "The mandate signing email could not be sent.",
    });
  }
});
