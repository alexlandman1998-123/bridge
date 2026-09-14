import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "content-type": "application/json" },
});
const text = (value: unknown) => String(value || "").trim();
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

  const authorization = text(req.headers.get("authorization"));
  const body = await req.json().catch(() => ({}));
  const organisationId = text(body?.organisationId);
  const domainId = text(body?.domainId);
  if (!authorization || !organisationId || !domainId) return json(401, { error: "A signed-in session, organisation and sending domain are required." });

  const url = text(Deno.env.get("SUPABASE_URL"));
  const anonKey = text(Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY"));
  const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const resendKey = text(Deno.env.get("RESEND_API_KEY"));
  if (!url || !anonKey || !serviceKey || !resendKey) return json(500, { error: "Sending-domain verification is not configured." });

  const caller = createClient(url, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "Your session could not be verified." });
  const { data: allowed, error: permissionError } = await caller.rpc("email_campaign_can_send", { p_organisation_id: organisationId });
  if (permissionError || !allowed) return json(403, { error: "You are not allowed to verify sending domains for this organisation." });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: domain, error: domainError } = await db.from("email_sending_domains")
    .select("id,domain_name,provider_domain_id,dns_records")
    .eq("id", domainId)
    .eq("organisation_id", organisationId)
    .eq("provider", "resend")
    .maybeSingle();
  if (domainError) return json(500, { error: "Unable to load this sending domain." });
  if (!domain) return json(404, { error: "Sending domain not found." });
  if (!domain.provider_domain_id) return json(409, { error: "This domain has not finished provider setup. Set it up again before verifying." });

  const now = new Date().toISOString();
  const verifyResponse = await fetch(`https://api.resend.com/domains/${encodeURIComponent(domain.provider_domain_id)}/verify`, {
    method: "POST",
    headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
  });
  const verifyPayload = await verifyResponse.json().catch(() => ({}));
  if (!verifyResponse.ok) {
    const message = text(verifyPayload?.message || "Resend could not start domain verification.");
    await db.from("email_sending_domains").update({
      verification_status: "failed",
      last_provider_error: message.slice(0, 500),
      last_checked_at: now,
    }).eq("id", domain.id);
    return json(502, { error: "The email provider could not verify this domain. Check the DNS records and try again." });
  }

  const detailsResponse = await fetch(`https://api.resend.com/domains/${encodeURIComponent(domain.provider_domain_id)}`, {
    headers: { authorization: `Bearer ${resendKey}` },
  });
  const details = detailsResponse.ok ? await detailsResponse.json().catch(() => ({})) : {};
  // Resend verifies asynchronously and marks the domain pending while that
  // cycle runs. Keep senders disabled until a subsequent provider refresh
  // confirms the verified state.
  const status = "pending";
  const { error: updateError } = await db.from("email_sending_domains").update({
    verification_status: status,
    dns_records: detailsResponse.ok ? records(details?.records) : domain.dns_records,
    verification_requested_at: now,
    last_checked_at: now,
    verified_at: null,
    last_provider_error: detailsResponse.ok ? null : "Resend accepted verification but domain status could not be refreshed yet.",
  }).eq("id", domain.id);
  if (updateError) return json(500, { error: "The provider verification started, but Arch9 could not save its status." });

  const { error: identityError } = await db.from("email_sender_identities").update({
    verification_status: status,
    verified_at: null,
    last_verified_at: now,
  }).eq("email_sending_domain_id", domain.id);
  if (identityError) return json(500, { error: "The provider verification started, but linked senders could not be refreshed." });

  return json(200, {
    domain: {
      id: domain.id,
      domainName: domain.domain_name,
      status,
      records: records(details?.records),
    },
  });
});
