import { renderEmail, mergeEmail, escapeHtml } from "../_shared/emailDocument.js";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const text = (v: unknown) => String(v || "").trim();
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const url = text(Deno.env.get("SUPABASE_URL")); const anon = text(Deno.env.get("SUPABASE_ANON_KEY")); const resend = text(Deno.env.get("RESEND_API_KEY"));
  if (!url || !anon || !resend) return json(500, { error: "Test sending is not configured." });
  const auth = text(req.headers.get("authorization")); const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: userData } = await userDb.auth.getUser(); const user = userData.user; if (!user?.email) return json(401, { error: "Sign in to send a test." });
  const body = await req.json().catch(() => ({})); const organisationId = text(body.organisationId); const senderIdentityId = text(body.senderIdentityId);
  const { data: permitted } = await userDb.rpc("email_campaign_can_send", { p_organisation_id: organisationId }); if (!permitted) return json(403, { error: "You do not have permission to send campaign tests." });
  const { data: identity } = await userDb.from("email_sender_identities").select("display_name,from_email,reply_to_email,verification_status").eq("id", senderIdentityId).eq("organisation_id", organisationId).maybeSingle();
  if (!identity || identity.verification_status !== "verified") return json(400, { error: "Choose a verified sender identity." });
  const recipientEmail = text(body.recipientEmail || user.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return json(400, { error: "Enter a valid test recipient email." });
  let previewValues: Record<string, unknown> = { agency_name: identity.display_name };
  if (body.previewRecipientId) {
    const { data: contact } = await userDb.from("email_marketing_contacts").select("first_name,last_name,full_name").eq("id", body.previewRecipientId).eq("organisation_id", organisationId).maybeSingle();
    if (!contact) return json(400, { error: "Preview recipient is not available in this workspace." });
    previewValues = { ...previewValues, ...contact };
  }
  const output = body.contentJson?.version === 1 && body.contentJson?.mode !== "advanced" ? renderEmail(body.contentJson, { agencyName: identity.display_name, senderEmail: identity.from_email, previewText: body.previewText }) : text(body.html) + `<hr><p>Test email from ${escapeHtml(identity.display_name)}. Recipient unsubscribe links are added on campaign delivery.</p>`;
  const html = mergeEmail(output, previewValues).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/javascript\s*:/gi, "");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "content-type": "application/json" }, body: JSON.stringify({ from: `${identity.display_name} <${identity.from_email}>`, reply_to: identity.reply_to_email, to: [recipientEmail], subject: `[TEST] ${text(body.subject) || "Arch9 email campaign"}`, html }) });
  const result = await response.json().catch(() => ({})); if (!response.ok) return json(502, { error: text(result?.message) || "Provider rejected the test email." });
  return json(200, { deliveredTo: recipientEmail, providerMessageId: result.id });
});
