import { deliverCampaignTest } from "../_shared/emailCampaignTestDelivery.ts";
import { campaignSenderDetails } from "../_shared/emailCampaignSender.js";
import { refreshPlatformCampaignSender } from "../_shared/emailCampaignPlatformSender.ts";
import { refreshSendingDomain } from "../_shared/emailSendingDomain.ts";
import { supabasePublishableKey, supabaseServiceKey } from "../_shared/apiCredentials.ts";
import { inspectEmailHtml, renderCampaignDelivery } from "../_shared/emailContent.js";
import { checkCampaignContent } from "../_shared/emailCampaignContentCheck.ts";
const text = (v: unknown) => String(v || "").trim();
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
export function createCampaignTestHandler({ createClient, env, fetcher = fetch, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) }: { createClient: any; env: (key: string) => string | undefined; fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void> }) {
return async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const url = text(env("SUPABASE_URL")); const anon = text(supabasePublishableKey({ get: env } as typeof Deno.env)); const resend = text(env("RESEND_API_KEY"));
  if (!url || !anon || !resend) return json(500, { error: "Test sending is not configured." });
  const auth = text(req.headers.get("authorization")); const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData } = await userDb.auth.getUser(); const user = userData?.user; if (!user?.email) return json(401, { error: "Sign in to send a test." });
  const body = await req.json().catch(() => ({})); const organisationId = text(body.organisationId); const senderIdentityId = text(body.senderIdentityId);
  const requestKey = text(body.requestId);
  if (!/^[a-f0-9]{64}$/.test(requestKey)) return json(400, { error: "Refresh Arch9 before sending a test. A protected request ID is required." });
  const { data: permitted } = await userDb.rpc("email_campaign_can_send", { p_organisation_id: organisationId }); if (!permitted) return json(403, { error: "You do not have permission to send campaign tests." });
  const { data: identity } = await userDb.from("email_sender_identities").select("id,display_name,from_email,reply_to_email,verification_status,sending_paused_at,email_sending_domain_id,sender_mode").eq("id", senderIdentityId).eq("organisation_id", organisationId).maybeSingle();
  if (!identity || identity.verification_status !== "verified" || identity.sending_paused_at) return json(400, { error: "Choose a verified, active sender identity." });
  const recipientEmail = text(body.recipientEmail || user.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return json(400, { error: "Enter a valid test recipient email." });
  const serviceKey = text(supabaseServiceKey({ get: env } as typeof Deno.env));
  if (!serviceKey) return json(500, { error: "Test sending is not configured." });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let sender;
  try { sender = campaignSenderDetails({ ...identity, reply_to_email: body.setupTest ? identity.reply_to_email : body.replyToEmail || identity.reply_to_email }); }
  catch { return json(400, { error: "The selected sender configuration is invalid." }); }
  try {
    if (identity.sender_mode === "arch9") {
      const platform = await refreshPlatformCampaignSender({ db, env, resendKey: resend, fetcher });
      if (!platform.ready) return json(400, { error: "Arch9 campaign sending is not enabled and verified yet." });
    } else {
      const { data: domain, error: domainError } = await db.from("email_sending_domains").select("id,domain_name,provider_domain_id,verification_status")
        .eq("id", identity.email_sending_domain_id).eq("organisation_id", organisationId).maybeSingle();
      if (domainError || !domain) return json(400, { error: "This sender needs a connected sending domain." });
      if (await refreshSendingDomain({ db, domain, resendKey: resend, fetcher }) !== "verified") return json(400, { error: "Your sending domain is not verified yet." });
    }
  } catch { return json(502, { error: "Unable to confirm domain verification. Try again shortly." }); }
  if (body.setupTest && recipientEmail !== user.email.toLowerCase()) return json(400, { error: "Setup tests can only be sent to your signed-in email address." });
  const sendTest = async (payload: Record<string, unknown>) => {
    const result = await deliverCampaignTest({ db, organisationId, actorId: user.id, identityId: senderIdentityId, requestKey, payload, recipientEmail, resendKey: resend, fetcher, sleep });
    return json(result.status, result.body);
  };
  if (body.setupTest) {
    return sendTest({ from: sender.from, reply_to: sender.replyTo, to: [recipientEmail],
      subject: identity.sender_mode === "arch9" ? "Your Arch9 campaign sender is ready" : "Your agency email is ready",
      html: "<p>Your campaign sender is connected to Arch9.</p><p>Reply to this email to check that replies reach your agency inbox.</p>",
      text: "Your campaign sender is connected to Arch9. Reply to this email to check that replies reach your agency inbox." });
  }
  let previewValues: Record<string, unknown> = { agency_name: identity.display_name };
  if (body.previewRecipientId) {
    const { data: contact } = await userDb.from("email_marketing_contacts").select("first_name,last_name,full_name").eq("id", body.previewRecipientId).eq("organisation_id", organisationId).maybeSingle();
    if (!contact) return json(400, { error: "Preview recipient is not available in this workspace." });
    previewValues = { ...previewValues, ...contact };
  }
  const campaign = { organisation_id: organisationId, content_json: body.contentJson, html: body.html };
  const context = { agencyName: identity.display_name, senderEmail: sender.address, previewText: body.previewText };
  const report = await checkCampaignContent({ db: userDb, campaign, supabaseUrl: url, fetcher, context });
  if (!report.ready) return json(400, { error: report.errors[0], contentCheck: { ready: false, errors: report.errors, warnings: report.warnings } });
  const output = renderCampaignDelivery(campaign, context, previewValues, true);
  const finalCheck = inspectEmailHtml(output.html);
  if (!finalCheck.ready) return json(400, { error: finalCheck.errors[0] });
  return sendTest({ from: sender.from, reply_to: sender.replyTo, to: [recipientEmail], subject: `[TEST] ${text(body.subject) || "Arch9 email campaign"}`, html: output.html, text: output.text });
};
}
