#!/usr/bin/env node

const requiredEvents = [
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
];

const text = (value) => String(value || "").trim();
const normaliseUrl = (value) => text(value).replace(/\/$/, "");
const fail = (message) => {
  console.error(`Email platform readiness failed: ${message}`);
  process.exitCode = 1;
};

const resendKey = text(process.env.RESEND_API_KEY);
const supabaseUrl = normaliseUrl(process.env.SUPABASE_URL);
const senderAddress = text(
  process.env.ARCH9_RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL,
).toLowerCase();
const webhookSecret = text(process.env.RESEND_WEBHOOK_SECRET);
const billingConfirmed = text(process.env.RESEND_BILLING_CONFIRMED).toLowerCase() === "true";
const callback = `${supabaseUrl}/functions/v1/resend-webhook`;
const dryRun = process.argv.includes("--dry-run");

const missing = [
  ["RESEND_API_KEY", resendKey],
  ["SUPABASE_URL", supabaseUrl],
  ["ARCH9_RESEND_FROM_EMAIL or RESEND_FROM_EMAIL", senderAddress],
  ["RESEND_WEBHOOK_SECRET", webhookSecret],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  fail(`missing ${missing.join(", ")}.`);
} else if (!senderAddress.includes("@")) {
  fail("the configured platform sender is not an email address.");
} else if (dryRun) {
  console.log(JSON.stringify({
    configured: true,
    billingConfirmed,
    expectedWebhookEndpoint: callback,
    requiredEvents,
  }, null, 2));
} else {
  const resend = async (path) => {
    const response = await fetch(`https://api.resend.com${path}`, {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message || `Resend returned HTTP ${response.status}.`);
    return body;
  };

  try {
    const [domainsResponse, webhooksResponse, endpointResponse] = await Promise.all([
      resend("/domains"),
      resend("/webhooks"),
      fetch(callback, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    ]);
    const senderDomain = senderAddress.slice(senderAddress.lastIndexOf("@") + 1);
    const verifiedDomain = (domainsResponse.data || []).find((domain) =>
      text(domain.name).toLowerCase() === senderDomain && text(domain.status).toLowerCase() === "verified",
    );
    if (!verifiedDomain) throw new Error(`the platform sender domain ${senderDomain} is not verified in Resend.`);

    const webhook = (webhooksResponse.data || []).find((candidate) =>
      normaliseUrl(candidate.endpoint) === callback && text(candidate.status).toLowerCase() === "enabled",
    );
    if (!webhook?.id) throw new Error("no enabled Resend webhook is registered for the production callback.");

    const webhookResponse = await resend(`/webhooks/${encodeURIComponent(webhook.id)}`);
    const events = new Set(webhookResponse.events || webhook.events || []);
    const missingEvents = requiredEvents.filter((event) => !events.has(event));
    if (missingEvents.length) throw new Error(`the Resend webhook is missing ${missingEvents.join(", ")}.`);
    if (text(webhookResponse.signing_secret) !== webhookSecret) {
      throw new Error("the deployed webhook signing secret does not match Resend.");
    }
    if (endpointResponse.status !== 401) {
      throw new Error(`the webhook must reject unsigned requests (received HTTP ${endpointResponse.status}).`);
    }
    if (!billingConfirmed) {
      throw new Error("set RESEND_BILLING_CONFIRMED=true only after confirming the active Resend billing plan in its dashboard.");
    }
    console.log(JSON.stringify({
      ready: true,
      senderDomain,
      webhookEndpoint: callback,
      webhookId: webhook.id,
      billingConfirmed: true,
      events: requiredEvents,
    }, null, 2));
  } catch (error) {
    fail(error instanceof Error ? error.message : "unexpected readiness error.");
  }
}
