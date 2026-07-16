import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function normalizeText(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Request-ID": crypto.randomUUID(),
    },
  });
}

async function parseRequest(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 8192) throw new Error("request_too_large");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > 8192) throw new Error("request_too_large");
  const parsed = raw ? JSON.parse(raw) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_request");
  return parsed as JsonRecord;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed.", code: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, { error: "This quote service is temporarily unavailable.", code: "service_unavailable" });
  }

  let body: JsonRecord;
  try {
    body = await parseRequest(req);
  } catch (error) {
    const tooLarge = normalizeText((error as Error)?.message) === "request_too_large";
    return jsonResponse(tooLarge ? 413 : 400, {
      error: tooLarge ? "The request was too large." : "The request was invalid.",
      code: tooLarge ? "request_too_large" : "invalid_request",
    });
  }

  const action = normalizeText(body.action, 20).toLowerCase();
  const token = normalizeText(body.token, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return jsonResponse(404, { error: "This quote link is unavailable.", code: "quote_unavailable" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "resolve") {
    const { data, error } = await supabase.rpc("resolve_attorney_quote_public_link", { p_token: token });
    if (error) {
      console.error("[attorney-quote-decision] resolve failed", { code: error.code, message: error.message });
      return jsonResponse(500, { error: "We could not load this quote right now.", code: "resolve_failed" });
    }
    if (!data) return jsonResponse(404, { error: "This quote link is unavailable or has expired.", code: "quote_unavailable" });
    return jsonResponse(200, { quote: data });
  }

  if (action !== "decide") {
    return jsonResponse(400, { error: "The requested action is invalid.", code: "invalid_action" });
  }

  const decision = normalizeText(body.decision, 20).toLowerCase();
  const reason = normalizeText(body.reason, 1000);
  if (!new Set(["accepted", "declined"]).has(decision)) {
    return jsonResponse(400, { error: "Choose a valid quote decision.", code: "invalid_decision" });
  }
  if (decision === "declined" && !reason) {
    return jsonResponse(400, { error: "Please tell the firm why you are declining this quote.", code: "reason_required" });
  }

  const { data, error } = await supabase.rpc("decide_attorney_quote_public_link", {
    p_token: token,
    p_decision: decision,
    p_reason: reason || null,
  });
  if (error) {
    const unavailable = /unavailable|expired|no longer available/i.test(error.message || "");
    console.error("[attorney-quote-decision] decision failed", { code: error.code, message: error.message });
    return jsonResponse(unavailable ? 409 : 500, {
      error: unavailable ? "This quote is no longer available for a decision." : "We could not record your decision right now.",
      code: unavailable ? "quote_unavailable" : "decision_failed",
    });
  }

  return jsonResponse(200, { accepted: data?.success === true, state: data?.state || decision });
});
