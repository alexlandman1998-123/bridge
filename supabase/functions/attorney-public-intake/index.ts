import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SERVICE_TYPES = new Set([
  "transfer_quote",
  "property_transfer",
  "bond_registration",
  "bond_cancellation",
  "property_legal_advice",
  "general_enquiry",
]);

const SOURCE_CHANNELS = new Set([
  "instagram",
  "facebook",
  "linkedin",
  "website",
  "whatsapp",
  "email",
  "qr",
  "referral",
  "manual",
  "other",
]);

const MAX_REQUEST_BYTES = 72 * 1024;
const SHORT_WINDOW_MS = 10 * 60 * 1000;
const LONG_WINDOW_MS = 60 * 60 * 1000;
const SHORT_WINDOW_LIMIT = 5;
const LONG_WINDOW_LIMIT = 15;
const RUNTIME_VERSION = "attorney-public-intake-phase5-20260716";

function jsonResponse(status: number, body: JsonRecord, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Request-ID": crypto.randomUUID(),
      ...extraHeaders,
    },
  });
}

function normalizeText(value: unknown, maxLength = 5000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeKey(value: unknown) {
  return normalizeText(value, 120).toLowerCase();
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function sanitizeSource(value: unknown) {
  const source = normalizeKey(value);
  return SOURCE_CHANNELS.has(source) ? source : "other";
}

function sanitizeCampaign(value: unknown) {
  const campaign = normalizeText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return campaign || null;
}

function sanitizeUtm(value: unknown) {
  const input = asRecord(value);
  const output: JsonRecord = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const safeValue = normalizeText(input[key], 160);
    if (safeValue) output[key] = safeValue;
  }
  return output;
}

function clientIp(req: Request) {
  const forwarded = normalizeText(req.headers.get("x-forwarded-for"), 300).split(",")[0]?.trim();
  return normalizeText(req.headers.get("cf-connecting-ip"), 100) ||
    normalizeText(req.headers.get("x-real-ip"), 100) ||
    forwarded ||
    "unknown";
}

async function sha256UrlSafe(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function publicError(error: unknown) {
  const message = normalizeText((error as { message?: string })?.message, 500).toLowerCase();
  if (message.includes("rate limit")) return { status: 429, code: "rate_limited", message: "Too many enquiries were sent from this connection. Please try again later." };
  if (message.includes("service type")) return { status: 400, code: "invalid_service", message: "Please choose an available service." };
  if (message.includes("privacy consent")) return { status: 400, code: "consent_required", message: "Please accept the privacy consent to continue." };
  if (message.includes("email")) return { status: 400, code: "invalid_email", message: "Please enter a valid email address." };
  if (message.includes("phone")) return { status: 400, code: "invalid_phone", message: "Please enter a valid mobile number." };
  if (message.includes("contact name")) return { status: 400, code: "invalid_name", message: "Please enter your first name." };
  if (message.includes("idempotency")) return { status: 400, code: "invalid_request", message: "Please refresh the page and try again." };
  if (message.includes("payload") || message.includes("campaign") || message.includes("policy version")) {
    return { status: 400, code: "invalid_request", message: "Some submitted information was invalid. Please review the form." };
  }
  return { status: 500, code: "submission_failed", message: "We could not send your enquiry right now. Please try again shortly." };
}

function requestMetadata(req: Request) {
  let referrerHost = "";
  try {
    const referrer = normalizeText(req.headers.get("referer"), 500);
    referrerHost = referrer ? new URL(referrer).hostname : "";
  } catch {
    referrerHost = "";
  }
  return {
    user_agent: normalizeText(req.headers.get("user-agent"), 500) || null,
    language: normalizeText(req.headers.get("accept-language"), 120) || null,
    referrer_host: referrerHost || null,
  };
}

const INTAKE_CONTEXT_VALUES = Object.freeze({
  journey_key: new Set(["transfer_calculator", "transfer_quote", "buying_home", "selling_property", "bond_registration", "bond_cancellation", "property_advice"]),
  practice_key: new Set(["litigation", "family_law", "contract_law", "trusts_estates", "notarial", "general_enquiry"]),
  goal: new Set(["calculate_transfer_duty", "request_transfer_quote"]),
  finance_type: new Set(["bond", "cash", "unsure"]),
  existing_bond: new Set(["yes", "no", "unsure"]),
  cancellation_reason: new Set(["selling_property", "bond_paid_off", "refinancing", "other"]),
  cancellation_notice: new Set(["yes", "no", "unsure"]),
  preferred_contact: new Set(["phone", "email", "whatsapp"]),
});

function sanitizeIntakeContext(value: unknown) {
  const source = asRecord(value);
  const context: JsonRecord = {};
  for (const [key, allowed] of Object.entries(INTAKE_CONTEXT_VALUES)) {
    const normalized = normalizeKey(source[key]);
    if (allowed.has(normalized)) context[key] = normalized;
  }
  for (const key of ["matter_stage", "timing"]) {
    const normalized = normalizeKey(source[key]);
    if (normalized && normalized.length <= 80 && /^[a-z0-9][a-z0-9_-]*$/.test(normalized)) context[key] = normalized;
  }
  const bankName = normalizeText(source.bank_name, 160);
  if (bankName) context.bank_name = bankName;
  return context;
}

async function parseRequest(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) throw new Error("request_too_large");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) throw new Error("request_too_large");
  const parsed = raw ? JSON.parse(raw) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as JsonRecord;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed.", code: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, { error: "Public intake is temporarily unavailable.", code: "service_unavailable" });
  }

  let requestBody: JsonRecord;
  try {
    requestBody = await parseRequest(req);
  } catch (error) {
    const tooLarge = normalizeText((error as Error)?.message) === "request_too_large";
    return jsonResponse(tooLarge ? 413 : 400, {
      error: tooLarge ? "The request was too large." : "The request body was invalid.",
      code: tooLarge ? "request_too_large" : "invalid_request",
    });
  }

  const action = normalizeKey(requestBody.action);
  const slug = normalizeKey(requestBody.slug);
  if (action !== "health" && (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
    return jsonResponse(400, { error: "This intake link is invalid.", code: "invalid_link" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "health") {
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return jsonResponse(400, { error: "This intake link is invalid.", code: "invalid_link" });
    }
    if (slug) {
      const { data, error } = await supabase.rpc("resolve_attorney_public_intake", { p_slug: slug });
      if (error) {
        console.error("[attorney-public-intake] health resolve failed", { code: error.code, message: error.message });
        return jsonResponse(503, { healthy: false, code: "database_unavailable", runtime_version: RUNTIME_VERSION });
      }
      const intake = Array.isArray(data) ? data[0] : data;
      return jsonResponse(200, {
        healthy: Boolean(intake),
        code: intake ? "ready" : "intake_unavailable",
        runtime_version: RUNTIME_VERSION,
        intake_active: Boolean(intake),
      });
    }
    const { error } = await supabase.from("public_intake_links").select("id").limit(1);
    if (error) {
      console.error("[attorney-public-intake] health database check failed", { code: error.code, message: error.message });
      return jsonResponse(503, { healthy: false, code: "database_unavailable", runtime_version: RUNTIME_VERSION });
    }
    return jsonResponse(200, { healthy: true, code: "ready", runtime_version: RUNTIME_VERSION });
  }

  if (action === "resolve") {
    const { data, error } = await supabase.rpc("resolve_attorney_public_intake", { p_slug: slug });
    if (error) {
      console.error("[attorney-public-intake] resolve failed", { code: error.code, message: error.message });
      return jsonResponse(500, { error: "We could not load this intake page.", code: "resolve_failed" });
    }
    const intake = Array.isArray(data) ? data[0] : data;
    if (!intake) return jsonResponse(404, { error: "This intake link is unavailable.", code: "intake_unavailable" });
    return jsonResponse(200, { intake });
  }

  if (action !== "submit") {
    return jsonResponse(400, { error: "The requested action is invalid.", code: "invalid_action" });
  }

  const payload = asRecord(requestBody.payload);
  const idempotencyKey = normalizeText(requestBody.idempotency_key, 128);
  const serviceType = normalizeKey(payload.service_type);
  if (!SERVICE_TYPES.has(serviceType)) {
    return jsonResponse(400, { error: "Please choose an available service.", code: "invalid_service" });
  }

  // Honeypot submissions receive a generic success without writing personal data.
  if (normalizeText(payload.company_website, 300)) {
    return jsonResponse(200, { accepted: true, duplicate: false, code: "accepted" });
  }

  const ipHashSecret = Deno.env.get("ATTORNEY_INTAKE_IP_HASH_SECRET") || serviceRoleKey;
  const ipHash = await sha256UrlSafe(`${ipHashSecret}:${clientIp(req)}`);

  const linkResult = await supabase
    .from("public_intake_links")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .is("disabled_at", null)
    .maybeSingle();

  if (linkResult.error) {
    console.error("[attorney-public-intake] link lookup failed", { code: linkResult.error.code, message: linkResult.error.message });
    return jsonResponse(500, { error: "We could not process this enquiry right now.", code: "submission_failed" });
  }
  if (!linkResult.data?.id) {
    return jsonResponse(404, { error: "This intake link is unavailable.", code: "intake_unavailable" });
  }

  const now = Date.now();
  const rateRows = await supabase
    .from("public_intake_submissions")
    .select("created_at")
    .eq("intake_link_id", linkResult.data.id)
    .eq("ip_hash", ipHash)
    .gte("created_at", new Date(now - LONG_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(LONG_WINDOW_LIMIT);

  if (rateRows.error) {
    console.error("[attorney-public-intake] rate lookup failed", { code: rateRows.error.code, message: rateRows.error.message });
    return jsonResponse(500, { error: "We could not process this enquiry right now.", code: "submission_failed" });
  }

  const recentRows = rateRows.data || [];
  const shortCount = recentRows.filter((row: { created_at: string }) => new Date(row.created_at).getTime() >= now - SHORT_WINDOW_MS).length;
  if (shortCount >= SHORT_WINDOW_LIMIT || recentRows.length >= LONG_WINDOW_LIMIT) {
    return jsonResponse(429, {
      error: "Too many enquiries were sent from this connection. Please try again later.",
      code: "rate_limited",
      retry_after_seconds: shortCount >= SHORT_WINDOW_LIMIT ? 600 : 3600,
    }, { "Retry-After": shortCount >= SHORT_WINDOW_LIMIT ? "600" : "3600" });
  }

  const commandPayload = {
    first_name: normalizeText(payload.first_name, 120),
    last_name: normalizeText(payload.last_name, 120) || null,
    email: normalizeText(payload.email, 254).toLowerCase() || null,
    phone: normalizeText(payload.phone, 40) || null,
    service_type: serviceType,
    property_address: normalizeText(payload.property_address, 1000) || null,
    property_value: normalizeText(payload.property_value, 40) || null,
    party_role: normalizeKey(payload.party_role) || "unknown",
    message: normalizeText(payload.message, 5000) || null,
    privacy_consent: payload.privacy_consent === true,
    privacy_policy_version: normalizeText(payload.privacy_policy_version, 80),
    source_channel: sanitizeSource(payload.source_channel),
    campaign_code: sanitizeCampaign(payload.campaign_code),
    utm: sanitizeUtm(payload.utm),
    intake_context: sanitizeIntakeContext(payload.intake_context),
  };

  const intakeContext = commandPayload.intake_context;

  const { data, error } = await supabase.rpc("submit_attorney_public_intake", {
    p_slug: slug,
    p_idempotency_key: idempotencyKey,
    p_payload: commandPayload,
    p_ip_hash: ipHash,
    p_request_metadata: { ...requestMetadata(req), intake_context: intakeContext },
  });

  if (error) {
    console.error("[attorney-public-intake] submission failed", { code: error.code, message: error.message });
    const safeError = publicError(error);
    return jsonResponse(safeError.status, { error: safeError.message, code: safeError.code });
  }

  const result = asRecord(data);
  if (result.code === "intake_unavailable") {
    return jsonResponse(404, { error: "This intake link is unavailable.", code: "intake_unavailable" });
  }

  return jsonResponse(200, {
    accepted: result.accepted === true,
    duplicate: result.duplicate === true,
    code: normalizeText(result.code, 80) || "accepted",
  });
});
