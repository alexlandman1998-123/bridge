import { supabasePublishableKey, supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import { ARCH9_CAMPAIGN_DOMAIN } from "../_shared/emailCampaignSender.js";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.9";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Domain callbacks preserve verification; suppressed mail is a terminal outcome.
const requiredEvents = ["email.delivered", "email.bounced", "email.complained", "email.opened", "email.clicked", "email.suppressed", "domain.created", "domain.updated", "domain.deleted"];
const text = (value: unknown) => String(value || "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
});
const normaliseUrl = (value: unknown) => text(value).replace(/\/+$/, "");
const labels = {
  provider: "Resend provider credentials",
  "sender-domain": "Arch9 campaign sender domain verified",
  "campaign-sending": "Arch9 campaign sending enabled",
  "campaign-capacity": "Campaign account budget configured",
  webhook: "Delivery and domain webhook events",
  "webhook-secret": "Webhook signing secret",
  "webhook-auth": "Webhook rejects unsigned requests",
  billing: "Billing acknowledgement",
};
const checksFrom = (values: Record<string, boolean> = {}) => Object.entries(labels).map(([key,label]) => ({ key, label, ok: values[key] === true }));

Deno.serve(withApiCredentials(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const authorization = text(req.headers.get("authorization"));
  const url = normaliseUrl(Deno.env.get("SUPABASE_URL"));
  const anonKey = text(supabasePublishableKey());
  if (!authorization || !url || !anonKey) return json(401, { error: "A signed-in Executive session is required." });
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "Your session could not be verified." });
  const { data: access, error: accessError } = await caller.rpc("arch9_admin_access_level");
  if (accessError || access?.level !== "executive") return json(403, { error: "Executive access is required." });

  const resendKey = text(Deno.env.get("RESEND_API_KEY"));
  const providerId = text(Deno.env.get("ARCH9_CAMPAIGN_RESEND_DOMAIN_ID"));
  const sharedEnabled = Deno.env.get("ARCH9_CAMPAIGN_SENDING_ENABLED") === "true";
  const webhookSecret = text(Deno.env.get("RESEND_WEBHOOK_SECRET"));
  const serviceKey = text(supabaseServiceKey());
  const callbackUrl = `${url}/functions/v1/resend-webhook`;
  const checkedAt = new Date().toISOString();
  const base = { checkedAt, platformSenderDomain: ARCH9_CAMPAIGN_DOMAIN };
  if (!resendKey) return json(200, { ...base, ready: false, checks: checksFrom() });

  const signal = AbortSignal.timeout(10000);
  try {
    const resend = async (path: string) => {
      const response = await fetch(`https://api.resend.com${path}`, { signal, headers: { authorization: `Bearer ${resendKey}` } });
      if (!response.ok) throw new Error("Provider status unavailable.");
      return response.json();
    };
    // Direct domain lookup avoids a first-page search or an unrelated sender.
    const domain = providerId ? await resend(`/domains/${encodeURIComponent(providerId)}`) : null;
    let webhook: any = null;
    let after = "";
    for (let page = 0; page < 10 && !webhook; page += 1) {
      const result = await resend(`/webhooks?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`);
      const rows = Array.isArray(result?.data) ? result.data : [];
      const candidate = rows.find((item: any) => normaliseUrl(item?.endpoint) === callbackUrl && item?.status === "enabled");
      if (candidate?.id) webhook = await resend(`/webhooks/${encodeURIComponent(text(candidate.id))}`);
      if (!result.has_more || !rows.length) break;
      after = text(rows.at(-1)?.id);
      if (!after) break;
    }
    const unsigned = await fetch(callbackUrl, { method: "POST", signal, headers: { "content-type": "application/json" }, body: "{}" });
    await unsigned.body?.cancel();
    let budgetReady = false;
    if (serviceKey) {
      const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: budget, error } = await service.from("email_campaign_account_limits").select("enabled,daily_limit,monthly_limit").eq("singleton", true).maybeSingle();
      budgetReady = !error && budget?.enabled === true && budget.daily_limit > 0 && budget.monthly_limit > 0;
    }
    const subscribed = Array.isArray(webhook?.events) ? webhook.events.map(text) : [];
    const checks = checksFrom({
      provider: true,
      "sender-domain": Boolean(domain) && domain.id === providerId && text(domain.name).toLowerCase() === ARCH9_CAMPAIGN_DOMAIN && domain.status === "verified",
      "campaign-sending": sharedEnabled && Boolean(providerId),
      "campaign-capacity": budgetReady,
      webhook: webhook?.status === "enabled" && normaliseUrl(webhook?.endpoint) === callbackUrl && requiredEvents.every(event => subscribed.includes(event)),
      "webhook-secret": Boolean(webhookSecret) && text(webhook?.signing_secret) === webhookSecret,
      "webhook-auth": unsigned.status === 401,
      billing: text(Deno.env.get("RESEND_BILLING_CONFIRMED")).toLowerCase() === "true",
    });
    return json(200, { ...base, ready: checks.every(check => check.ok), checks });
  } catch {
    return json(502, { ...base, ready: false, checks: checksFrom(), error: "Unable to check the campaign platform configuration." });
  }
}));
