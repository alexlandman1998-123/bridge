import { refreshPlatformCampaignSender } from "../_shared/emailCampaignPlatformSender.ts";
import { refreshSendingDomain } from "../_shared/emailSendingDomain.ts";
import { supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
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

Deno.serve(withApiCredentials(async (req: Request) => {
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
  const serviceKey = text(supabaseServiceKey());
  if (!url || !serviceKey) return response(500, { error: "Webhook storage is not configured." });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const providerEventId = text(req.headers.get("svix-id"));
  const eventType = text(payload.type).toLowerCase();
  const providerMessageId = text(payload.data?.email_id || payload.data?.id);

  // Apply domain events before audit deduplication so a provider retry can
  // repair failed storage. Re-read current state to handle out-of-order events.
  if (["domain.updated", "domain.created", "domain.deleted"].includes(eventType)) {
    const { data: domain, error } = await supabase.from("email_sending_domains")
      .select("id,domain_name,provider_domain_id,verification_status").eq("provider", "resend")
      .eq("provider_domain_id", text(payload.data?.id)).maybeSingle();
    if (error) return response(500, { error: "Unable to load sending domain." });
    if (!domain) {
      const platformId = text(Deno.env.get("ARCH9_CAMPAIGN_RESEND_DOMAIN_ID"));
      if (!platformId || text(payload.data?.id) !== platformId) return response(200, { received: true, ignored: true });
      try {
        if (eventType === "domain.deleted") {
          const result = await supabase.rpc("email_campaign_apply_platform_status", { p_provider_domain_id: platformId, p_status: "failed", p_enabled: Deno.env.get("ARCH9_CAMPAIGN_SENDING_ENABLED") === "true" });
          if (result.error) throw result.error;
        } else await refreshPlatformCampaignSender({ db: supabase, env: key => Deno.env.get(key), resendKey: text(Deno.env.get("RESEND_API_KEY")) });
        return response(200, { received: true, platformDomain: true });
      } catch { return response(502, { error: "Unable to refresh Arch9 campaign verification." }); }
    }
    try {
      if (eventType === "domain.deleted") {
        const result = await supabase.rpc("email_apply_domain_status", { p_domain_id: domain.id, p_status: "failed", p_records: null, p_error: "Domain removed from the email provider. Add it again to reconnect." });
        if (result.error) throw result.error;
      } else {
        await refreshSendingDomain({ db: supabase, domain, resendKey: text(Deno.env.get("RESEND_API_KEY")) });
      }
      return response(200, { received: true, domain: true });
    } catch { return response(502, { error: "Unable to refresh domain verification." }); }
  }

  // Apply campaign receipts before shared audit deduplication. The RPC stores
  // unmatched early events and atomically applies event, recipient and safety
  // suppression changes. Any storage error asks Resend to retry the whole event.
  let campaignProcessed = false;
  if (providerMessageId && ["email.sent", "email.delivered", "email.delivery_delayed", "email.opened", "email.clicked", "email.bounced", "email.complained", "email.failed", "email.suppressed"].includes(eventType)) {
    const receipt = await supabase.rpc("email_campaign_record_provider_event", {
      p_event_id: providerEventId, p_provider_id: providerMessageId,
      p_event_type: eventType, p_payload: payload,
    });
    if (receipt.error) return response(500, { error: "Campaign delivery receipt could not be recorded." });
    campaignProcessed = receipt.data === true;
  }

  // Persist calendar confirmations before the shared audit dedupe. A retried
  // webhook can repair a failed queue update; early provider events are retained.
  if (providerMessageId && ["email.delivered","email.bounced","email.complained","email.suppressed"].includes(eventType)) {
    const calendarReceipt = await supabase.rpc("record_calendar_provider_receipt", {
      p_event_id: providerEventId, p_provider_id: providerMessageId, p_event_type: eventType,
    });
    if (calendarReceipt.error && !["PGRST202","42883"].includes(calendarReceipt.error.code)) {
      return response(500, { error: "Calendar delivery receipt could not be recorded." });
    }
  }

  const audit = await supabase.from("notification_provider_webhook_events").insert({
    provider: "resend",
    provider_event_id: providerEventId,
    event_type: eventType || "unknown",
    provider_message_id: providerMessageId || null,
    payload_json: payload,
    processing_status: "received",
  }).select("id").single();
  if (audit.error?.code === "23505") {
    if (campaignProcessed) {
      const repaired = await supabase.from("notification_provider_webhook_events").update({ processing_status: "processed", processing_error: null, processed_at: new Date().toISOString() })
        .eq("provider", "resend").eq("provider_event_id", providerEventId);
      if (repaired.error) return response(500, { error: "Campaign audit could not be confirmed." });
    }
    return response(200, { received: true, duplicate: true, campaign: campaignProcessed });
  }
  if (audit.error) return response(500, { error: audit.error.message });
  if (campaignProcessed) {
    const recorded = await supabase.from("notification_provider_webhook_events").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("id", audit.data.id);
    if (recorded.error) return response(500, { error: "Campaign audit could not be confirmed." });
    return response(200, { received: true, processed: true, campaign: true });
  }

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
}));
