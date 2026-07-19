import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function text(value: unknown) {
  return String(value || "").trim();
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function verifySvixSignature(req: Request, rawBody: string, secret: string) {
  const eventId = text(req.headers.get("svix-id"));
  const timestamp = text(req.headers.get("svix-timestamp"));
  const signatureHeader = text(req.headers.get("svix-signature"));
  if (!eventId || !timestamp || !signatureHeader || !secret) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = decodeBase64(encodedSecret);
  } catch {
    return false;
  }
  const keyData = new Uint8Array(keyBytes.length);
  keyData.set(keyBytes);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData.buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new TextEncoder().encode(`${eventId}.${timestamp}.${rawBody}`);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, signed));
  return signatureHeader.split(" ").some((candidate) => {
    const [version, signature] = candidate.split(",", 2);
    if (version !== "v1" || !signature) return false;
    try {
      return constantTimeEqual(expected, decodeBase64(signature));
    } catch {
      return false;
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, { error: "Method not allowed." });
  const rawBody = await req.text();
  const webhookSecret = text(Deno.env.get("RESEND_WEBHOOK_SECRET"));
  if (!await verifySvixSignature(req, rawBody, webhookSecret)) {
    return response(401, { error: "Invalid webhook signature." });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return response(400, { error: "Invalid JSON body." });
  }

  const url = text(Deno.env.get("SUPABASE_URL"));
  const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !serviceKey) return response(500, { error: "Webhook storage is not configured." });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const providerEventId = text(req.headers.get("svix-id"));
  const eventType = text(payload.type).toLowerCase();
  const providerMessageId = text(payload.data?.email_id || payload.data?.id);

  const audit = await supabase.from("notification_provider_webhook_events").insert({
    provider: "resend",
    provider_event_id: providerEventId,
    event_type: eventType || "unknown",
    provider_message_id: providerMessageId || null,
    payload_json: payload,
    processing_status: "received",
  }).select("id").single();
  if (audit.error?.code === "23505") return response(200, { received: true, duplicate: true });
  if (audit.error) return response(500, { error: audit.error.message });

  if (!providerMessageId || ![
    "email.delivered", "email.bounced", "email.complained", "email.suppressed",
  ].includes(eventType)) {
    await supabase.from("notification_provider_webhook_events").update({
      processing_status: "ignored", processed_at: new Date().toISOString(),
    }).eq("id", audit.data.id);
    return response(200, { received: true, ignored: true });
  }

  const notification = await supabase
    .from("notification_events")
    .select("id, organisation_id, recipient_email, communication_delivery_id, automation_key")
    .eq("provider", "resend")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (notification.error || !notification.data || notification.data.automation_key !== "transaction_progress_changed") {
    await supabase.from("notification_provider_webhook_events").update({
      processing_status: "ignored", processed_at: new Date().toISOString(),
      processing_error: notification.error?.message || "No matching transaction progress notification.",
    }).eq("id", audit.data.id);
    return response(200, { received: true, ignored: true });
  }

  const delivered = eventType === "email.delivered";
  const failureReason = delivered ? null : eventType.replace("email.", "resend_");
  const now = new Date().toISOString();
  await supabase.from("notification_events").update({
    status: delivered ? "delivered" : "failed",
    delivered_at: delivered ? now : null,
    failed_at: delivered ? null : now,
    error_message: failureReason,
    last_dispatch_error: failureReason,
    next_dispatch_attempt_at: null,
  }).eq("id", notification.data.id);

  if (notification.data.communication_delivery_id) {
    await supabase.from("communication_deliveries").update({
      status: delivered ? "delivered" : "failed",
      delivered_at: delivered ? now : null,
      failed_at: delivered ? null : now,
      error_message: failureReason,
      updated_at: now,
    }).eq("id", notification.data.communication_delivery_id);
  }

  if (!delivered && notification.data.organisation_id && notification.data.recipient_email) {
    const preferencePatch: Record<string, unknown> = {
      organisation_id: notification.data.organisation_id,
      recipient_email: text(notification.data.recipient_email).toLowerCase(),
      email_enabled: false,
      whatsapp_enabled: false,
      disabled_reason: failureReason,
      updated_at: now,
    };
    if (eventType === "email.bounced") preferencePatch.bounced_at = now;
    if (eventType === "email.complained") preferencePatch.complained_at = now;
    if (eventType === "email.suppressed") preferencePatch.suppressed_at = now;
    await supabase.from("notification_recipient_preferences").upsert(
      preferencePatch,
      { onConflict: "organisation_id,recipient_email" },
    );
  }

  await supabase.from("notification_provider_webhook_events").update({
    processing_status: "processed", processed_at: now,
  }).eq("id", audit.data.id);
  return response(200, { received: true, processed: true, status: delivered ? "delivered" : "failed" });
});
