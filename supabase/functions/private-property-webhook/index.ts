import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type Json = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
const json = (status: number, body: Json) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const db = () => {
  const url = text(Deno.env.get("SUPABASE_URL")), key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
};

function bytes(value: string) { return new TextEncoder().encode(value); }
function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let different = 0; for (let index = 0; index < left.length; index += 1) different |= left[index] ^ right[index];
  return different === 0;
}
function signatureBytes(value: string) {
  const candidate = value.replace(/^sha256=/i, "").trim();
  if (/^[0-9a-f]{64}$/i.test(candidate)) return Uint8Array.from(candidate.match(/.{2}/g)!.map((item) => parseInt(item, 16)));
  try { return Uint8Array.from(atob(candidate), (character) => character.charCodeAt(0)); } catch { return new Uint8Array(); }
}
async function validSignature(raw: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes(raw)));
  return timingSafeEqual(expected, signatureBytes(signature));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const raw = await request.text();
  let payload: Json;
  try { payload = JSON.parse(raw) as Json; } catch { return json(400, { error: "invalid_json" }); }
  const agencyId = text(payload.agencyId || payload.agencyAccountNumber);
  const providerLeadId = text(payload.leadId);
  if (!agencyId || !providerLeadId) return json(400, { error: "missing_private_property_identifiers" });
  const client = db(); if (!client) return json(500, { error: "webhook_storage_not_configured" });

  const configResult = await client.from("private_property_agency_configs")
    .select("id,organisation_id,branch_guid,metadata_json,enabled,status,go_live_approved_at")
    .eq("environment", "production").eq("enabled", true).in("status", ["approved", "active"]);
  if (configResult.error) return json(500, { error: "configuration_lookup_failed" });
  const config = (configResult.data || []).find((row: Json) => text((row.metadata_json as Json)?.private_property_agency_id) === agencyId);
  if (!config || !config.go_live_approved_at) return json(404, { error: "private_property_agency_not_configured" });
  const metadata = (config.metadata_json || {}) as Json;
  const secretName = text(metadata.private_property_webhook_secret_name);
  const secret = secretName ? text(Deno.env.get(secretName)) : "";
  if (!secret) return json(503, { error: "webhook_secret_not_configured" });
  if (!await validSignature(raw, text(request.headers.get("x-signature")), secret)) return json(401, { error: "invalid_signature" });

  const event = await client.from("private_property_webhook_events").insert({ organisation_id: config.organisation_id, agency_id: agencyId, provider_lead_id: providerLeadId, message_type: text(payload.messageType), payload_json: payload }).select("id,status").single();
  if (event.error?.code === "23505") return json(200, { received: true, status: "duplicate" });
  if (event.error) return json(500, { error: "event_record_failed" });
  try {
    const listingReference = text(payload.listingExternalReference || payload.listingId);
    let listingId: string | null = null;
    if (listingReference) {
      const sync = await client.from("private_property_listing_syncs").select("private_listing_id")
        .eq("environment", "production").eq("branch_guid", config.branch_guid)
        .or(`property_id.eq.${listingReference},private_property_ref.eq.${listingReference}`).maybeSingle();
      listingId = text(sync.data?.private_listing_id) || null;
    }
    const ingested = await client.rpc("private_property_ingest_lead", {
      p_organisation_id: config.organisation_id, p_external_reference: `PP:${providerLeadId}`,
      p_name: text(payload.leadName), p_email: text(payload.leadEmail), p_phone: text(payload.leadPhoneNumber || payload.leadPhone),
      p_message: text(payload.leadMessage), p_listing_id: listingId, p_raw_payload: payload,
    });
    if (ingested.error) throw new Error(ingested.error.message);
    await client.from("private_property_webhook_events").update({ status: "processed", lead_id: ingested.data, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", event.data.id);
    return json(200, { received: true, status: "processed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead processing failed.";
    await client.from("private_property_webhook_events").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", event.data.id);
    return json(500, { error: "lead_processing_failed" });
  }
});
