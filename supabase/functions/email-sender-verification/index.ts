import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const text = (value: unknown) => String(value || "").trim();
const providerStatus = (value: unknown) => {
  const status = text(value).toLowerCase();
  if (status === "verified") return "verified";
  if (status === "failed") return "failed";
  return "pending";
};
const records = (value: unknown) => Array.isArray(value)
  ? value.map((record: any) => ({
    record: text(record?.record),
    name: text(record?.name),
    type: text(record?.type),
    value: text(record?.value),
    ttl: text(record?.ttl),
    status: text(record?.status),
    priority: Number.isFinite(Number(record?.priority)) ? Number(record.priority) : null,
  })).filter((record) => record.name && record.type && record.value)
  : [];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const authorization = req.headers.get("authorization") || "";
  const organisationId = String((await req.json().catch(() => ({})))?.organisationId || "").trim();
  if (!authorization || !organisationId) return json(400, { error: "Organisation and signed-in session are required." });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!url || !anonKey || !serviceKey || !resendKey) return json(500, { error: "Sender verification is not configured." });
  const caller = createClient(url, anonKey, { global: { headers: { authorization } }, auth: { persistSession: false } });
  const { data: allowed } = await caller.rpc("email_campaign_can_send", { p_organisation_id: organisationId });
  if (!allowed) return json(403, { error: "You are not allowed to verify senders for this organisation." });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: domainRows, error: domainError } = await db.from("email_sending_domains")
    .select("id,domain_name,provider_domain_id")
    .eq("organisation_id", organisationId)
    .eq("provider", "resend");
  if (domainError) return json(500, { error: domainError.message });

  const now = new Date().toISOString();
  const domainStatuses = new Map<string, string>();
  let domainsVerified = 0;
  for (const domain of domainRows || []) {
    if (!domain.provider_domain_id) {
      domainStatuses.set(String(domain.domain_name || "").toLowerCase(), "failed");
      await db.from("email_sending_domains").update({
        verification_status: "failed",
        last_provider_error: "The provider domain ID is missing. Set up this domain again.",
        last_checked_at: now,
      }).eq("id", domain.id);
      continue;
    }
    const response = await fetch(`https://api.resend.com/domains/${encodeURIComponent(domain.provider_domain_id)}`, {
      headers: { authorization: `Bearer ${resendKey}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      await db.from("email_sending_domains").update({
        verification_status: "failed",
        last_provider_error: text(payload?.message || "Resend domain check failed.").slice(0, 500),
        last_checked_at: now,
      }).eq("id", domain.id);
      domainStatuses.set(String(domain.domain_name || "").toLowerCase(), "failed");
      continue;
    }
    const status = providerStatus(payload?.status);
    if (status === "verified") domainsVerified += 1;
    domainStatuses.set(String(domain.domain_name || "").toLowerCase(), status);
    await db.from("email_sending_domains").update({
      verification_status: status,
      dns_records: records(payload?.records),
      last_provider_error: null,
      last_checked_at: now,
      verified_at: status === "verified" ? now : null,
    }).eq("id", domain.id);
  }

  const { data: identities, error } = await db.from("email_sender_identities").select("id,domain_name").eq("organisation_id", organisationId).eq("provider", "resend");
  if (error) return json(500, { error: error.message });
  let verified = 0;
  for (const identity of identities || []) {
    const status = domainStatuses.get(String(identity.domain_name || "").toLowerCase());
    const nextStatus = status === "verified" ? "verified" : status === "pending" ? "pending" : "failed";
    if (nextStatus === "verified") verified += 1;
    await db.from("email_sender_identities").update({ verification_status: nextStatus, verified_at: nextStatus === "verified" ? now : null, last_verified_at: now }).eq("id", identity.id);
  }
  return json(200, { verified, checked: (identities || []).length, domainsVerified, domainsChecked: (domainRows || []).length });
});
