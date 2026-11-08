import { supabasePublishableKey, supabaseServiceKey } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient as defaultCreateClient } from "npm:@supabase/supabase-js@2";

export function createWebsiteDomainHandler({ createClient = defaultCreateClient, env = (key: string) => Deno.env.get(key), fetcher = fetch } = {}) {
type Json = Record<string, unknown>;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const hostnamePattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const json = (status: number, body: Json) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function configured() {
  const supabaseUrl = text(env("SUPABASE_URL"));
  const anonKey = text(supabasePublishableKey({ get: env } as typeof Deno.env));
  const serviceKey = text(supabaseServiceKey({ get: env } as typeof Deno.env));
  const vercelToken = text(env("VERCEL_TOKEN"));
  const projectId = text(env("VERCEL_WEBSITE_PROJECT_ID"));
  const teamId = text(env("VERCEL_TEAM_ID"));
  if (!supabaseUrl || !anonKey || !serviceKey || !vercelToken || !projectId) throw new Error("Website domain management is not configured.");
  return { supabaseUrl, anonKey, serviceKey, vercelToken, projectId, teamId };
}

function hostname(value: unknown) {
  return text(value).toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function vercelUrl(path: string, teamId: string) {
  return `https://api.vercel.com${path}${teamId ? `${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}` : ""}`;
}

async function vercel(config: ReturnType<typeof configured>, path: string, init: RequestInit) {
  const response = await fetcher(vercelUrl(path, config.teamId), { ...init, headers: { Authorization: `Bearer ${config.vercelToken}`, "Content-Type": "application/json", ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({})) as Json;
  if (response.status === 404 && ["GET", "DELETE"].includes(init.method || "GET")) return { notFound: true };
  if (!response.ok) throw new Error((text((body.error as Json | undefined)?.message) || "Vercel could not complete the domain request.").split(config.vercelToken).join("[redacted]"));
  return body;
}

async function recordDomainActivity(admin: ReturnType<typeof createClient<any, "public", any>>, values: { siteId: string; organisationId: string; actorUserId: string; action: string; hostname: string }) {
  const result = await admin.from("website_management_events").insert({
    website_site_id: values.siteId,
    organisation_id: values.organisationId,
    actor_user_id: values.actorUserId,
    action: values.action,
    metadata_json: { hostname: values.hostname },
  });
  if (result.error) console.error("Website domain audit event could not be recorded", result.error.message);
}

return async (request: Request) => {
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

    const permission = await userClient.rpc("bridge_is_org_admin", { target_org: access.data.organisation_id });
    if (permission.error || permission.data !== true) return json(403, { error: "Only organisation administrators can manage website domains." });

    if (action === "connect") {
      if (!hostnamePattern.test(domain)) return json(400, { error: "Enter a valid domain, such as example.co.za or www.example.co.za." });
      if (domain.includes("*")) return json(400, { error: "Wildcard domains are not supported because they require nameserver changes." });
      const existing = await admin.from("website_domains").select("id,website_site_id,status,is_primary").eq("hostname", domain).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data && existing.data.website_site_id !== siteId) return json(409, { error: "This domain is already connected to another Arch9 website." });
      if (existing.data && !["pending", "failed", "disabled"].includes(existing.data.status)) return json(409, { error: "This domain is already connected. Check its connection instead of adding it again." });
      let reservedId = existing.data?.id;
      if (!reservedId) {
        const reservation = await admin.from("website_domains").insert({ website_site_id: siteId, hostname: domain, domain_kind: "custom", status: "pending", is_primary: false }).select("id").single();
        if (reservation.error?.code === "23505") return json(409, { error: "This domain is already being connected. Refresh the domain list." });
        if (reservation.error) throw reservation.error;
        reservedId = reservation.data.id;
      }
      const recovered = existing.data ? await vercel(config, `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(domain)}`, { method: "GET" }) : null;
      const result = recovered && !recovered.notFound ? recovered : await vercel(config, `/v9/projects/${encodeURIComponent(config.projectId)}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
      const configuration = await vercel(config, `/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${encodeURIComponent(config.projectId)}`, { method: "GET" });
      const verified = result.verified === true && configuration.misconfigured === false;
      const instructions = { provider: "vercel", verification: result.verification || [], apexName: result.apexName || null, configuration, emailDnsChangesAllowed: false, nameserverChangesAllowed: false };
      const saved = await admin.from("website_domains").update({ website_site_id: siteId, hostname: domain, domain_kind: "custom", status: verified ? "verified" : "pending", is_primary: false, dns_instructions: instructions, verified_at: verified ? new Date().toISOString() : null }).eq("id", reservedId).eq("website_site_id", siteId).select("id, hostname, status, is_primary, dns_instructions").single();
      if (saved.error) throw saved.error;
      await recordDomainActivity(admin, { siteId, organisationId: access.data.organisation_id, actorUserId: user.data.user.id, action: "domain_connected", hostname: domain });
      return json(200, { domain: saved.data });
    }

    if (!uuidPattern.test(domainId)) return json(400, { error: "Choose a valid website domain." });
    const current = await admin.from("website_domains").select("id, hostname, status, is_primary, website_site_id").eq("id", domainId).eq("website_site_id", siteId).maybeSingle();
    if (current.error || !current.data) return json(404, { error: "Website domain not found." });

    if (action === "verify") {
      const result = await vercel(config, `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(current.data.hostname)}/verify`, { method: "POST" });
      const configuration = await vercel(config, `/v6/domains/${encodeURIComponent(current.data.hostname)}/config?projectIdOrName=${encodeURIComponent(config.projectId)}`, { method: "GET" });
      const verified = result.verified === true && configuration.misconfigured === false;
      const update = await admin.from("website_domains").update({ status: current.data.status === "active" ? "active" : verified ? "verified" : "pending", verified_at: verified ? new Date().toISOString() : null, dns_instructions: { provider: "vercel", verification: result.verification || [], apexName: result.apexName || null, configuration, emailDnsChangesAllowed: false, nameserverChangesAllowed: false } }).eq("id", domainId).select("id, hostname, status, is_primary, dns_instructions").single();
      if (update.error) throw update.error;
      await recordDomainActivity(admin, { siteId, organisationId: access.data.organisation_id, actorUserId: user.data.user.id, action: verified ? "domain_verified" : "domain_verification_requested", hostname: current.data.hostname });
      return json(200, { domain: update.data });
    }

    if (action === "make-primary") {
      const proof = await vercel(config, `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(current.data.hostname)}`, { method: "GET" });
      const routing = await vercel(config, `/v6/domains/${encodeURIComponent(current.data.hostname)}/config?projectIdOrName=${encodeURIComponent(config.projectId)}`, { method: "GET" });
      if (proof.verified !== true || routing.misconfigured !== false) return json(409, { error: "This domain is not ready. Check its DNS configuration before making it primary." });
      const promoted = await admin.rpc("website_activate_verified_domain", { p_website_site_id: siteId, p_domain_id: domainId });
      if (promoted.error) throw promoted.error;
      await recordDomainActivity(admin, { siteId, organisationId: access.data.organisation_id, actorUserId: user.data.user.id, action: "domain_primary_changed", hostname: current.data.hostname });
      return json(200, { domain: promoted.data });
    }

    if (current.data.is_primary || !["pending", "failed", "disabled"].includes(current.data.status)) return json(409, { error: "Only an inactive, non-primary domain can be removed here." });
    if (current.data.status === "pending" || current.data.status === "failed" || current.data.status === "disabled") await vercel(config, `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(current.data.hostname)}`, { method: "DELETE" });
    const removed = await admin.rpc("website_remove_unconnected_domain", { p_website_site_id: siteId, p_domain_id: domainId });
    if (removed.error) throw removed.error;
    await recordDomainActivity(admin, { siteId, organisationId: access.data.organisation_id, actorUserId: user.data.user.id, action: "domain_removed", hostname: current.data.hostname });
    return json(200, { removed: true });
  } catch (error) {
    return json(422, { error: error instanceof Error ? error.message : "Website domain management could not be completed." });
  }
};
}
