import { supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {verifyWebhookSignature} from "../_shared/whatsappWebhookSignature.js";
import { runWhatsAppWebhookRecovery } from "../_shared/whatsappWebhookRecovery.js";

type JsonRecord = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeJson(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function jsonResponse(status: number, body: JsonRecord, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function createSupabaseClient() {
  const url = text(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = text(supabaseServiceKey());
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(withApiCredentials(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });

  const supabase = createSupabaseClient();
  if (!supabase) {
    return jsonResponse(500, { error: "Missing webhook storage credentials." });
  }

  if (req.method === "GET") {
    const query = new URL(req.url).searchParams;
    const hubMode = text(query.get("hub.mode"));
    const hubToken = text(query.get("hub.verify_token"));
    const hubChallenge = text(query.get("hub.challenge"));
    const expectedVerifyToken = text(
      Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    );
    if (
      hubMode === "subscribe" && expectedVerifyToken &&
      hubToken === expectedVerifyToken
    ) {
      return new Response(hubChallenge || "", { status: 200 });
    }
    return jsonResponse(403, { error: "Webhook verification failed." });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  if(Number(req.headers.get('content-length')||0)>20*1024*1024)return jsonResponse(413,{error:'Webhook too large.'});
  const reader=req.body?.getReader();let rawBody='';let size=0;
  const decoder=new TextDecoder();
  if(reader)try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>20*1024*1024)return jsonResponse(413,{error:'Webhook too large.'});rawBody+=decoder.decode(chunk.value,{stream:true});}rawBody+=decoder.decode();}finally{await reader.cancel();}
  if (!rawBody) {
    return jsonResponse(400, { error: "Empty webhook payload." });
  }
  const signature = text(req.headers.get("x-hub-signature-256"));
  const webhookSecret = text(Deno.env.get("WHATSAPP_WEBHOOK_APP_SECRET")) ||
    text(Deno.env.get("META_APP_SECRET"));
  if (!webhookSecret) {
    return jsonResponse(500, {
      error: "Webhook secret is not configured.",
    });
  }
  const signatureVerified = await verifyWebhookSignature(
    rawBody,
    signature,
    webhookSecret,
  );
  if (!signatureVerified) {
    return jsonResponse(401, { error: "Invalid webhook signature." });
  }

  let payload: JsonRecord = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: "Invalid webhook JSON." });
  }

  // Persist verified ingress before applying any business side effects. A crash
  // or provider retry can safely resume the same idempotent event.
  const hash = await sha256Hex(rawBody);
  const saved = await supabase.rpc('whatsapp_webhook_enqueue', {p_hash:hash,p_payload:payload});
  if(saved.error) return jsonResponse(503,{error:'Webhook storage unavailable. Retry required.'});
  try {
    const result = await runWhatsAppWebhookRecovery(supabase,{hash,limit:3});
    return jsonResponse(result.failed?503:200,{received:true,...result});
  } catch { return jsonResponse(503,{error:'Verified event saved. Processing will retry.'}); }
}));
