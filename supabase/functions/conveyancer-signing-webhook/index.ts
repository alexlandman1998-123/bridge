import { createClient } from "supabase";

const encoder = new TextEncoder();
function json(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function text(value: unknown) { return String(value ?? "").trim(); }
function hex(bytes: ArrayBuffer) { return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join(""); }
function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  const secret = text(Deno.env.get("CONVEYANCER_SIGNING_WEBHOOK_SECRET"));
  const url = text(Deno.env.get("SUPABASE_URL"));
  const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!secret || !url || !serviceKey) return json({ ok: false, error: "Webhook environment is incomplete." }, 503);

  const timestamp = text(request.headers.get("x-arch9-timestamp"));
  const suppliedSignature = text(request.headers.get("x-arch9-signature")).replace(/^sha256=/i, "").toLowerCase();
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return json({ ok: false, error: "Webhook timestamp is stale." }, 401);
  const rawBody = await request.text();
  if (rawBody.length > 65_536) return json({ ok: false, error: "Webhook payload is too large." }, 413);
  const hmacKey = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expectedSignature = hex(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(`${timestamp}.${rawBody}`)));
  if (!safeEqual(expectedSignature, suppliedSignature)) return json({ ok: false, error: "Webhook signature is invalid." }, 401);

  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { return json({ ok: false, error: "Webhook JSON is invalid." }, 400); }
  const payloadHash = `sha256:${hex(await crypto.subtle.digest("SHA-256", encoder.encode(rawBody)))}`;
  const sourceMetadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
  const metadata = {
    providerStatus: text(sourceMetadata.providerStatus), envelopeReference: text(sourceMetadata.envelopeReference),
    signerCount: Math.max(0, Math.min(100, Number(sourceMetadata.signerCount || 0))),
    completedAt: text(sourceMetadata.completedAt), completionCertificateReference: text(sourceMetadata.completionCertificateReference),
  };
  const objectBucket = text(body.objectBucket);
  const objectPath = text(body.objectPath);
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc("bridge_record_conveyancer_signing_provider_event", { payload: {
    organisationId: text(body.organisationId), attorneyFirmId: text(body.attorneyFirmId), transactionId: text(body.transactionId),
    providerKey: text(body.providerKey), providerEventId: text(body.providerEventId), eventType: text(body.eventType),
    signatureVerified: true, payloadHash, objectBucket: objectBucket && objectPath ? objectBucket : null, objectPath: objectBucket && objectPath ? objectPath : null,
    metadata,
  } });
  if (error) return json({ ok: false, error: error.message, code: error.code || null }, 400);
  return json({ ok: true, eventId: data?.eventId || null, duplicate: Boolean(data?.duplicate), reviewRequired: true });
});
