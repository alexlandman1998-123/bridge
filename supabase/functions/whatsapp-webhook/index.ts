import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

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

function hexDecode(value: string) {
  if (value.length % 2 !== 0) throw new Error("Invalid hex signature.");
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
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

async function verifyWebhookSignature(
  body: string,
  signatureHeader: string,
  secret: string,
) {
  const normalized = text(signatureHeader);
  if (!normalized || !normalized.startsWith("sha256=")) {
    return false;
  }
  const provided = normalized.replace(/^sha256=/i, "");
  const key = new TextEncoder().encode(secret);
  const expected = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(body),
  );
  const expectedHex = Array.from(new Uint8Array(expected)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const actualBytes = hexDecode(provided);
  const expectedBytes = hexDecode(expectedHex);
  return constantTimeEqual(actualBytes, expectedBytes);
}

function createSupabaseClient() {
  const url = text(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapMetaStatus(status: string) {
  const normalized = text(status).toLowerCase();
  if (normalized === "read") return "read";
  if (normalized === "delivered") return "delivered";
  if (normalized === "sent") return "sent";
  if (normalized === "failed") return "failed";
  return "";
}

function extractFailureReason(item: JsonRecord) {
  if (Array.isArray(item.errors) && item.errors.length > 0) {
    const first = item.errors[0] as JsonRecord;
    return text(first.code) ? `${text(first.code)}:${text(first.title)}` : text(first.error_data?.code);
  }
  return text(item.error);
}

function readStatusTimestamp(item: JsonRecord, status: string) {
  const normalizedStatus = text(status).toLowerCase();
  const statusValue = normalizedStatus || text(item.status).toLowerCase();
  const timestamp = text(item.timestamp);
  let eventAt = new Date().toISOString();
  const unixSeconds = Number(timestamp);
  if (Number.isFinite(unixSeconds) && unixSeconds > 0) {
    const candidate = new Date(unixSeconds * 1000);
    if (!Number.isNaN(candidate.getTime())) {
      eventAt = candidate.toISOString();
    }
  }
  if (statusValue === "failed") {
    return {
      status: "failed",
      failed_at: eventAt,
      error_message: extractFailureReason(item),
      updated_at: new Date().toISOString(),
    };
  }
  const now = new Date().toISOString();
  if (statusValue === "read") return { status: "read", read_at: eventAt, updated_at: now };
  if (statusValue === "delivered") return {
    status: "delivered",
    delivered_at: eventAt,
    updated_at: now,
  };
  return { status: normalizedStatus || "sent", sent_at: eventAt, updated_at: now };
}

Deno.serve(async (req) => {
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

  const rawBody = await req.text();
  if (!rawBody) {
    return jsonResponse(400, { error: "Empty webhook payload." });
  }
  const signature = text(req.headers.get("x-hub-signature-256"));
  const webhookSecret = text(Deno.env.get("WHATSAPP_WEBHOOK_APP_SECRET"));
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

  const webhookEventId = text(req.headers.get("x-hub-signature-id")) ||
    text((payload.entry as JsonRecord[])?.[0]?.id) ||
    text(req.headers.get("x-request-id")) ||
    await sha256Hex(rawBody);

  const auditInsert = await supabase.from("notification_provider_webhook_events")
    .insert({
      provider: "meta",
      provider_event_id: webhookEventId || "unknown",
      event_type: "message_status",
      provider_message_id: null,
      payload_json: payload,
      processing_status: "received",
    })
    .select("id")
    .single();

  if (auditInsert.error && text(auditInsert.error?.code) === "23505") {
    return jsonResponse(200, { received: true, duplicate: true });
  }
  if (auditInsert.error) {
    return jsonResponse(500, { error: "Failed to record webhook payload." });
  }

  const entries = Array.isArray(payload.entry) ? payload.entry as JsonRecord[] : [];
  let processed = false;
  let lastError = "";
  let providerMessageId = "";
  const now = new Date().toISOString();

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes)
      ? entry.changes as JsonRecord[]
      : [];
    for (const change of changes) {
      const statuses = Array.isArray((change as JsonRecord).value?.statuses)
        ? (change as JsonRecord).value.statuses as JsonRecord[]
        : [];
      for (const statusItem of statuses) {
        const mappedStatus = mapMetaStatus(text(statusItem.status));
        providerMessageId = text(statusItem.id);
        if (!providerMessageId || !mappedStatus) {
          continue;
        }

        const patch = readStatusTimestamp(statusItem, mappedStatus);
        const deliveryQuery = await supabase
          .from("communication_deliveries")
          .update(patch)
          .eq("provider", "meta")
          .eq("channel", "whatsapp")
          .eq("provider_message_id", providerMessageId)
          .select("id, notification_event_id")
          .maybeSingle();

        if (deliveryQuery.error || !deliveryQuery.data) {
          lastError = "No matching delivery found for webhook message id.";
          continue;
        }

        if (deliveryQuery.data.notification_event_id) {
          const eventPatch: JsonRecord = {
            status: patch.status,
            updated_at: now,
          };
          if (patch.sent_at) eventPatch.sent_at = patch.sent_at;
          if (patch.delivered_at) eventPatch.delivered_at = patch.delivered_at;
          if (patch.read_at) eventPatch.read_at = patch.read_at;
          if (patch.failed_at) eventPatch.failed_at = patch.failed_at;
          if (patch.error_message) eventPatch.error_message = patch.error_message;
          await supabase.from("notification_events")
            .update(eventPatch)
            .eq("id", deliveryQuery.data.notification_event_id);
        }
        processed = true;
      }
    }
  }

  await supabase
    .from("notification_provider_webhook_events")
    .update({
      processing_status: processed ? "processed" : "ignored",
      processed_at: now,
      processing_error: lastError || null,
    })
    .eq("id", auditInsert.data.id);

  return jsonResponse(200, {
    received: true,
    processed,
    providerMessageId: providerMessageId || null,
    error: lastError || null,
  });
});
