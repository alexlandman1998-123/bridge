import { inspectEmailHtml, renderCampaignDelivery } from "../_shared/emailContent.js";
import { checkCampaignContent } from "../_shared/emailCampaignContentCheck.ts";
const text = (v: unknown) => String(v || "").trim();
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
export function createCampaignTestHandler({ createClient, env, fetcher = fetch }: { createClient: any; env: (key: string) => string | undefined; fetcher?: typeof fetch }) {
return async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const url = text(env("SUPABASE_URL")); const anon = text(env("SUPABASE_ANON_KEY")); const resend = text(env("RESEND_API_KEY"));
  if (!url || !anon || !resend) return json(500, { error: "Test sending is not configured." });
  const auth = text(req.headers.get("authorization")); const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: userData } = await userDb.auth.getUser(); const user = userData.user; if (!user?.email) return json(401, { error: "Sign in to send a test." });
  const body = await req.json().catch(() => ({})); const organisationId = text(body.organisationId); const senderIdentityId = text(body.senderIdentityId);
  const { data: permitted } = await userDb.rpc("email_campaign_can_send", { p_organisation_id: organisationId }); if (!permitted) return json(403, { error: "You do not have permission to send campaign tests." });
  const { data: identity } = await userDb.from("email_sender_identities").select("display_name,from_email,reply_to_email,verification_status,sending_paused_at").eq("id", senderIdentityId).eq("organisation_id", organisationId).maybeSingle();
  if (!identity || identity.verification_status !== "verified" || identity.sending_paused_at) return json(400, { error: "Choose a verified, active sender identity." });
  const recipientEmail = text(body.recipientEmail || user.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return json(400, { error: "Enter a valid test recipient email." });
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
  const response = await fetcher("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "content-type": "application/json" }, body: JSON.stringify({ from: `${identity.display_name} <${identity.from_email}>`, reply_to: identity.reply_to_email, to: [recipientEmail], subject: `[TEST] ${text(body.subject) || "Arch9 email campaign"}`, html: output.html, text: output.text }) });
  const result = await response.json().catch(() => ({})); if (!response.ok) return json(502, { error: text(result?.message) || "Provider rejected the test email." });
  return json(200, { deliveredTo: recipientEmail, providerMessageId: result.id });
};
}
