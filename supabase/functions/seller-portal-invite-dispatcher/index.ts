import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type Job = { id: string; delivery_payload: Record<string, unknown> };

function text(value: unknown) { return String(value || "").trim(); }
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "POST is required." });
  const url = text(Deno.env.get("SUPABASE_URL"));
  const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const bearer = text(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey) return json(500, { error: "Dispatcher configuration is missing." });
  if (bearer !== serviceKey) return json(403, { error: "Service-role authorization is required." });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const limit = Math.max(1, Math.min(Number(body.limit) || 25, 100));
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const claim = await client.rpc("bridge_claim_private_listing_seller_portal_invites", { p_limit: limit, p_outbox_id: null });
  if (claim.error) return json(500, { error: claim.error.message });
  const results = [];
  for (const job of (claim.data || []) as Job[]) {
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-email`, {
        method: "POST",
        headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "content-type": "application/json" },
        body: JSON.stringify(job.delivery_payload), signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      const providerMessageId = text(payload.deliveryId || payload.providerMessageId || (payload.data as Record<string, unknown>)?.deliveryId);
      if (!response.ok || payload.error) throw new Error(text(payload.error) || `Email service returned ${response.status}.`);
      await client.rpc("bridge_complete_private_listing_seller_portal_invite", {
        p_outbox_id: job.id, p_sent: true, p_provider_message_id: providerMessageId || null, p_error_message: null,
      });
      results.push({ id: job.id, status: "sent", providerMessageId: providerMessageId || null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Seller portal email delivery failed.";
      const completion = await client.rpc("bridge_complete_private_listing_seller_portal_invite", {
        p_outbox_id: job.id, p_sent: false, p_provider_message_id: null, p_error_message: message,
      });
      results.push({ id: job.id, status: completion.data?.status || "failed", error: message });
    }
  }
  return json(200, { ok: true, claimed: (claim.data || []).length, results });
});
