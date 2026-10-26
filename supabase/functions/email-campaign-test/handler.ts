import { refreshSendingDomain } from "../_shared/emailSendingDomain.ts";
import { supabasePublishableKey, supabaseServiceKey } from "../_shared/apiCredentials.ts";
import { inspectEmailHtml, renderCampaignDelivery } from "../_shared/emailContent.js";
import { checkCampaignContent } from "../_shared/emailCampaignContentCheck.ts";
const text = (v: unknown) => String(v || "").trim();
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
export function createCampaignTestHandler({ createClient, env, fetcher = fetch }: { createClient: any; env: (key: string) => string | undefined; fetcher?: typeof fetch }) {
return async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const url = text(env("SUPABASE_URL")); const anon = text(supabasePublishableKey({ get: env } as typeof Deno.env)); const resend = text(env("RESEND_API_KEY"));
  if (!url || !anon || !resend) return json(500, { error: "Test sending is not configured." });
  const auth = text(req.headers.get("authorization")); const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: userData } = await userDb.auth.getUser(); const user = userData?.user; if (!user?.email) return json(401, { error: "Sign in to send a test." });
  const body = await req.json().catch(() => ({})); const organisationId = text(body.organisationId); const senderIdentityId = text(body.senderIdentityId);
  const { data: permitted } = await userDb.rpc("email_campaign_can_send", { p_organisation_id: organisationId }); if (!permitted) return json(403, { error: "You do not have permission to send campaign tests." });
  const { data: identity } = await userDb.from("email_sender_identities").select("id,display_name,from_email,reply_to_email,verification_status,sending_paused_at,email_sending_domain_id").eq("id", senderIdentityId).eq("organisation_id", organisationId).maybeSingle();
  if (!identity || identity.verification_status !== "verified" || identity.sending_paused_at) return json(400, { error: "Choose a verified, active sender identity." });
  const recipientEmail = text(body.recipientEmail || user.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return json(400, { error: "Enter a valid test recipient email." });
  const serviceKey = text(supabaseServiceKey({ get: env } as typeof Deno.env));
  if (!serviceKey) return json(500, { error: "Test sending is not configured." });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: domain, error: domainError } = await db.from("email_sending_domains").select("id,domain_name,provider_domain_id,verification_status")
    .eq("id", identity.email_sending_domain_id).eq("organisation_id", organisationId).maybeSingle();
  if (domainError || !domain) return json(400, { error: "This sender needs a connected sending domain." });
  try {
    if (await refreshSendingDomain({ db, domain, resendKey: resend, fetcher }) !== "verified") return json(400, { error: "Your sending domain is not verified yet." });
  } catch { return json(502, { error: "Unable to confirm domain verification. Try again shortly." }); }
  if (body.setupTest && recipientEmail !== user.email.toLowerCase()) return json(400, { error: "Setup tests can only be sent to your signed-in email address." });
  const reserveTest = () => db.rpc("email_reserve_send", { p_organisation_id: organisationId, p_identity_id: senderIdentityId,
    p_key: `test:${crypto.randomUUID()}`, p_actor_id: user.id, p_test: true });
  if (body.setupTest) {
    const reservation = await reserveTest();
    if (reservation.error || !reservation.data) return json(429, { error: "Test sending is paused or a limit was reached. You can send five tests per hour, within your agency's daily limit." });
    const result = await fetcher("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${identity.display_name} <${identity.from_email}>`, reply_to: identity.reply_to_email, to: [user.email],
        subject: "Your agency email is ready", html: "<p>Your agency's sending domain is connected to Arch9.</p><p>Reply to this email to check that replies reach your agency inbox.</p>",
        text: "Your agency's sending domain is connected to Arch9. Reply to this email to check that replies reach your agency inbox." }) });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok || !payload.id) return json(502, { error: "The provider could not accept your test email. Try again shortly." });
    return json(200, { deliveredTo: user.email, providerMessageId: payload.id });
  }
  let previewValues: Record<string, unknown> = { agency_name: identity.display_name };
  if (body.previewRecipientId) {
    const { data: contact } = await userDb.from("email_marketing_contacts").select("first_name,last_name,full_name").eq("id", body.previewRecipientId).eq("organisation_id", organisationId).maybeSingle();
    if (!contact) return json(400, { error: "Preview recipient is not available in this workspace." });
    previewValues = { ...previewValues, ...contact };
  }
  const campaign = { organisation_id: organisationId, content_json: body.contentJson, html: body.html };
  const context = { agencyName: identity.display_name, senderEmail: identity.from_email, previewText: body.previewText };
  const report = await checkCampaignContent({ db: userDb, campaign, supabaseUrl: url, fetcher, context });
  if (!report.ready) return json(400, { error: report.errors[0], contentCheck: { ready: false, errors: report.errors, warnings: report.warnings } });
  const output = renderCampaignDelivery(campaign, context, previewValues, true);
  const finalCheck = inspectEmailHtml(output.html);
  if (!finalCheck.ready) return json(400, { error: finalCheck.errors[0] });
  const reservation = await reserveTest();
  if (reservation.error || !reservation.data) return json(429, { error: "Test sending is paused or a sending limit was reached. Try again later." });
  const response = await fetcher("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "content-type": "application/json" }, body: JSON.stringify({ from: `${identity.display_name} <${identity.from_email}>`, reply_to: identity.reply_to_email, to: [recipientEmail], subject: `[TEST] ${text(body.subject) || "Arch9 email campaign"}`, html: output.html, text: output.text }) });
  const result = await response.json().catch(() => ({})); if (!response.ok) return json(502, { error: text(result?.message) || "Provider rejected the test email." });
  return json(200, { deliveredTo: recipientEmail, providerMessageId: result.id });
};
}
