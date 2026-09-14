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

function normaliseDomain(value: unknown) {
  const domain = text(value).toLowerCase().replace(/\.$/, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) {
    return "";
  }
  return domain;
}

function providerStatus(value: unknown) {
  const status = text(value).toLowerCase();
  if (status === "verified") return "verified";
  if (status === "failed") return "failed";
  return "pending";
}

function records(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((record) => ({
    record: text(record?.record),
    name: text(record?.name),
    type: text(record?.type),
    value: text(record?.value),
    ttl: text(record?.ttl),
    status: text(record?.status),
    priority: Number.isFinite(Number(record?.priority)) ? Number(record.priority) : null,
  })).filter((record) => record.name && record.type && record.value);
}

function domainResponse(domain: Record<string, any>, created: boolean) {
  return {
    created,
    domain: {
      id: domain.id,
      domainName: domain.domain_name,
      status: domain.verification_status,
      records: records(domain.dns_records),
      lastCheckedAt: domain.last_checked_at,
      verifiedAt: domain.verified_at,
      error: domain.last_provider_error || null,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const authorization = text(req.headers.get("authorization"));
  const body = await req.json().catch(() => ({}));
  const organisationId = text(body?.organisationId);
  const domainName = normaliseDomain(body?.domain);
  if (!authorization || !organisationId) return json(401, { error: "A signed-in session and organisation are required." });
  if (!domainName) return json(400, { error: "Enter a valid domain, such as updates.example.com." });

  const url = text(Deno.env.get("SUPABASE_URL"));
  const anonKey = text(Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY"));
  const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const resendKey = text(Deno.env.get("RESEND_API_KEY"));
  if (!url || !anonKey || !serviceKey || !resendKey) return json(500, { error: "Sending-domain setup is not configured." });

  const caller = createClient(url, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "Your session could not be verified." });
  const { data: allowed, error: permissionError } = await caller.rpc("email_campaign_can_send", { p_organisation_id: organisationId });
  if (permissionError || !allowed) return json(403, { error: "You are not allowed to set up sending domains for this organisation." });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const findExisting = async () => {
    const result = await db.from("email_sending_domains")
      .select("id,organisation_id,domain_name,provider_domain_id,verification_status,dns_records,last_checked_at,verified_at,last_provider_error")
      .eq("provider", "resend").eq("domain_name", domainName).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };

  try {
    let domain = await findExisting();
    if (domain && domain.organisation_id !== organisationId) {
      return json(409, { error: "This domain is already claimed by another organisation." });
    }
    if (domain?.provider_domain_id) return json(200, domainResponse(domain, false));

    if (!domain) {
      const reservation = await db.from("email_sending_domains").insert({
        organisation_id: organisationId,
        provider: "resend",
        domain_name: domainName,
        verification_status: "pending",
        created_by: userData.user.id,
      }).select("id,organisation_id,domain_name,provider_domain_id,verification_status,dns_records,last_checked_at,verified_at,last_provider_error").single();
      if (reservation.error?.code === "23505") {
        domain = await findExisting();
        if (domain?.organisation_id === organisationId && domain.provider_domain_id) return json(200, domainResponse(domain, false));
        return json(409, { error: "This domain is already being set up." });
      }
      if (reservation.error || !reservation.data) throw new Error(reservation.error?.message || "Unable to reserve this domain.");
      domain = reservation.data;
    }

    const resendResponse = await fetch("https://api.resend.com/domains", {
      method: "POST",
      headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({ name: domainName }),
    });
    const providerDomain = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok || !text(providerDomain?.id)) {
      const message = text(providerDomain?.message) || "Resend could not create this domain.";
      await db.from("email_sending_domains").update({ verification_status: "failed", last_provider_error: message.slice(0, 500), last_checked_at: new Date().toISOString() }).eq("id", domain.id);
      return json(502, { error: "The email provider could not set up this domain. Check the domain and try again." });
    }

    const detailsResponse = await fetch(`https://api.resend.com/domains/${encodeURIComponent(text(providerDomain.id))}`, {
      headers: { authorization: `Bearer ${resendKey}` },
    });
    const details = detailsResponse.ok ? await detailsResponse.json().catch(() => providerDomain) : providerDomain;
    const now = new Date().toISOString();
    const status = providerStatus(details?.status || providerDomain?.status);
    const updated = await db.from("email_sending_domains").update({
      provider_domain_id: text(providerDomain.id),
      verification_status: status,
      dns_records: records(details?.records || providerDomain?.records),
      last_provider_error: null,
      verification_requested_at: now,
      last_checked_at: now,
      verified_at: status === "verified" ? now : null,
    }).eq("id", domain.id).select("id,domain_name,verification_status,dns_records,last_checked_at,verified_at,last_provider_error").single();
    if (updated.error || !updated.data) throw new Error(updated.error?.message || "Unable to save provider domain details.");
    return json(201, domainResponse(updated.data, true));
  } catch (error) {
    console.error("email-sending-domain-create", error);
    return json(500, { error: "Unable to set up this sending domain." });
  }
});
