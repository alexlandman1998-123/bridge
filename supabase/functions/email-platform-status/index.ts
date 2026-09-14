import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const requiredEvents = ["email.delivered", "email.bounced", "email.complained", "email.opened", "email.clicked"];
const text = (value: unknown) => String(value || "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "content-type": "application/json" },
});
const normaliseUrl = (value: unknown) => text(value).replace(/\/+$/, "");

type Check = { key: string; label: string; ok: boolean };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const authorization = text(req.headers.get("authorization"));
  const url = text(Deno.env.get("SUPABASE_URL"));
  const anonKey = text(Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY"));
  if (!authorization || !url || !anonKey) return json(401, { error: "A signed-in Executive session is required." });

  const caller = createClient(url, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "Your session could not be verified." });
  const { data: access, error: accessError } = await caller.rpc("arch9_admin_access_level");
  if (accessError || access?.level !== "executive") return json(403, { error: "Executive access is required." });

  const resendKey = text(Deno.env.get("RESEND_API_KEY"));
  const senderAddress = text(Deno.env.get("ARCH9_RESEND_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL"));
  const webhookSecret = text(Deno.env.get("RESEND_WEBHOOK_SECRET"));
  const senderDomain = senderAddress.includes("@") ? senderAddress.split("@").pop()!.toLowerCase() : "";
  const callbackUrl = `${normaliseUrl(url)}/functions/v1/resend-webhook`;
  const checkedAt = new Date().toISOString();

  if (!resendKey || !senderDomain) {
    const checks: Check[] = [
      { key: "provider", label: "Resend provider credentials", ok: false },
      { key: "sender-domain", label: "Platform sender domain verified", ok: false },
      { key: "webhook", label: "Delivery webhook and events", ok: false },
      { key: "webhook-secret", label: "Webhook signing secret", ok: false },
      { key: "webhook-auth", label: "Webhook rejects unsigned requests", ok: false },
      { key: "billing", label: "Billing acknowledgement", ok: false },
    ];
    return json(200, { ready: false, checkedAt, platformSenderDomain: senderDomain || null, checks });
  }

  try {
    const resend = async (path: string) => {
      const response = await fetch(`https://api.resend.com${path}`, { headers: { authorization: `Bearer ${resendKey}` } });
      if (!response.ok) throw new Error("Resend request failed.");
      return response.json().catch(() => ({}));
    };
    const [domains, webhooks, unsignedWebhookResponse] = await Promise.all([
      resend("/domains"),
      resend("/webhooks"),
      fetch(callbackUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    ]);
    const domain = (Array.isArray(domains?.data) ? domains.data : []).find((item: any) => text(item?.name).toLowerCase() === senderDomain);
    const webhook = (Array.isArray(webhooks?.data) ? webhooks.data : []).find((item: any) => normaliseUrl(item?.endpoint) === callbackUrl && item?.enabled !== false);
    const webhookDetails = webhook?.id ? await resend(`/webhooks/${encodeURIComponent(text(webhook.id))}`) : {};
    const subscribedEvents = Array.isArray(webhookDetails?.events) ? webhookDetails.events.map(text) : [];
    const allEventsSubscribed = requiredEvents.every((event) => subscribedEvents.includes(event));
    const checks: Check[] = [
      { key: "provider", label: "Resend provider credentials", ok: true },
      { key: "sender-domain", label: "Platform sender domain verified", ok: text(domain?.status).toLowerCase() === "verified" },
      { key: "webhook", label: "Delivery webhook and events", ok: Boolean(webhook) && allEventsSubscribed },
      { key: "webhook-secret", label: "Webhook signing secret", ok: Boolean(webhookSecret) && text(webhookDetails?.signing_secret) === webhookSecret },
      { key: "webhook-auth", label: "Webhook rejects unsigned requests", ok: unsignedWebhookResponse.status === 401 },
      { key: "billing", label: "Billing acknowledgement", ok: text(Deno.env.get("RESEND_BILLING_CONFIRMED")).toLowerCase() === "true" },
    ];
    return json(200, { ready: checks.every((check) => check.ok), checkedAt, platformSenderDomain: senderDomain, checks });
  } catch {
    const checks: Check[] = [
      { key: "provider", label: "Resend provider credentials", ok: false },
      { key: "sender-domain", label: "Platform sender domain verified", ok: false },
      { key: "webhook", label: "Delivery webhook and events", ok: false },
      { key: "webhook-secret", label: "Webhook signing secret", ok: false },
      { key: "webhook-auth", label: "Webhook rejects unsigned requests", ok: false },
      { key: "billing", label: "Billing acknowledgement", ok: false },
    ];
    return json(502, { ready: false, checkedAt, platformSenderDomain: senderDomain, checks, error: "Unable to check the Resend platform configuration." });
  }
});
