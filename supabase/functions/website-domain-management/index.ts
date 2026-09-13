import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type Json = Record<string, unknown>;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const hostnamePattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const json = (status: number, body: Json) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function configured() {
  const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
  const anonKey = text(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const vercelToken = text(Deno.env.get("VERCEL_TOKEN"));
  const projectId = text(Deno.env.get("VERCEL_WEBSITE_PROJECT_ID"));
  const teamId = text(Deno.env.get("VERCEL_TEAM_ID"));
  if (!supabaseUrl || !anonKey || !serviceKey || !vercelToken || !projectId) throw new Error("Website domain management is not configured.");
  return { supabaseUrl, anonKey, serviceKey, vercelToken, projectId, teamId };
}

function hostname(value: unknown) {
  return text(value).toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function vercelUrl(path: string, teamId: string) {
  return `https://api.vercel.com${path}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`;
}

async function vercel(config: ReturnType<typeof configured>, path: string, init: RequestInit) {
  const response = await fetch(vercelUrl(path, config.teamId), { ...init, headers: { Authorization: `Bearer ${config.vercelToken}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(text((body.error as Json | undefined)?.message) || "Vercel could not complete the domain request.");
  return body;
}

async function recordDomainActivity(admin: ReturnType<typeof createClient>, values: { siteId: string; organisationId: string; actorUserId: string; action: string; hostname: string }) {
  const result = await admin.from("website_management_events").insert({
    website_site_id: values.siteId,
    organisation_id: values.organisationId,
    actor_user_id: values.actorUserId,
    action: values.action,
    metadata_json: { hostname: values.hostname },
  });
  if (result.error) console.error("Website domain audit event could not be recorded", result.error.message);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const config = configured();
    const token = text(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "Sign in before managing a domain." });
    const admin = createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const user = await admin.auth.getUser(token);
    if (user.error || !user.data.user) return json(401, { error: "Your session could not be verified." });
    const payload = await request.json().catch(() => ({})) as Json;
    const action = text(payload.action);
    const siteId = text(payload.siteId);
    const domainId = text(payload.domainId);
    const domain = hostname(payload.hostname);
    if (!uuidPattern.test(siteId) || !["connect", "verify", "make-primary", "remove"].includes(action)) return json(400, { error: "Choose a valid website domain action." });

    const userClient = createClient(config.supabaseUrl, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const access = await userClient.from("website_sites").select("id, organisation_id").eq("id", siteId).maybeSingle();
    if (access.error || !access.data) return json(403, { error: "You do not have permission to manage this website domain." });

    if (action === "connect") {
      if (!hostnamePattern.test(domain)) return json(400, { error: "Enter a valid domain, such as example.co.za or www.example.co.za." });
      if (domain.includes("*")) return json(400, { error: "Wildcard domains are not supported because they require nameserver changes." });
      const existing = await admin.from("website_domains").select("website_site_id").eq("hostname", domain).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data && existing.data.website_site_id !== siteId) return json(409, { error: "This domain is already connected to another Arch9 website." });
      const result = await vercel(config, `/v9/projects/${encodeURIComponent(config.projectId)}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
      const verified = result.verified === true;
      const instructions = { provider: "vercel", verification: result.verification || [], emailDnsChangesAllowed: false, nameserverChangesAllowed: false };
      const saved = await admin.from("website_domains").upsert({ website_site_id: siteId, hostname: domain, domain_kind: "custom", status: verified ? "verified" : "pending", is_primary: false, dns_instructions: instructions, verified_at: verified ? new Date().toISOString() : null }, { onConflict: "hostname" }).select("id, hostname, status, is_primary, dns_instructions").single();
      if (saved.error) throw saved.error;
      await recordDomainActivity(admin, { siteId, organisationId: access.data.organisation_id, actorUserId: user.data.user.id, action: "domain_connected", hostname: domain });
      return json(200, { domain: saved.data });
    }

    if (!uuidPattern.test(domainId)) return json(400, { error: "Choose a valid website domain." });
    const current = await admin.from("website_domains").select("id, hostname, status, is_primary, website_site_id").eq("id", domainId).eq("website_site_id", siteId).maybeSingle();
    if (current.error || !current.data) return json(404, { error: "Website domain not found." });

    if (action === "verify") {
      const result = await vercel(config, `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(current.data.hostname)}/verify`, { method: "POST" });
      const verified = result.verified === true;
      const update = await admin.from("website_domains").update({ status: verified ? "verified" : "pending", verified_at: verified ? new Date().toISOString() : null, dns_instructions: { provider: "vercel", verification: result.verification || [], emailDnsChangesAllowed: false, nameserverChangesAllowed: false } }).eq("id", domainId).select("id, hostname, status, is_primary, dns_instructions").single();
      if (update.error) throw update.error;
      await recordDomainActivity(admin, { siteId, organisationId: access.data.organisation_id, actorUserId: user.data.user.id, action: verified ? "domain_verified" : "domain_verification_requested", hostname: current.data.hostname });
      return json(200, { domain: update.data });
    }

    if (action === "make-primary") {
      const promoted = await admin.rpc("website_activate_verified_domain", { p_website_site_id: siteId, p_domain_id: domainId });
      if (promoted.error) throw promoted.error;
      await recordDomainActivity(admin, { siteId, organisationId: access.data.organisation_id, actorUserId: user.data.user.id, action: "domain_primary_changed", hostname: current.data.hostname });
      return json(200, { domain: promoted.data });
    }

    if (current.data.status === "pending" || current.data.status === "failed" || current.data.status === "disabled") await vercel(config, `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(current.data.hostname)}`, { method: "DELETE" });
    const removed = await admin.rpc("website_remove_unconnected_domain", { p_website_site_id: siteId, p_domain_id: domainId });
    if (removed.error) throw removed.error;
    await recordDomainActivity(admin, { siteId, organisationId: access.data.organisation_id, actorUserId: user.data.user.id, action: "domain_removed", hostname: current.data.hostname });
    return json(200, { removed: true });
  } catch (error) {
    return json(422, { error: error instanceof Error ? error.message : "Website domain management could not be completed." });
  }
});
