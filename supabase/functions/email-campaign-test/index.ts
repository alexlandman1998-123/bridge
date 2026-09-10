import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const text = (v: unknown) => String(v || "").trim();
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const url = text(Deno.env.get("SUPABASE_URL")); const anon = text(Deno.env.get("SUPABASE_ANON_KEY")); const resend = text(Deno.env.get("RESEND_API_KEY"));
  if (!url || !anon || !resend) return json(500, { error: "Test sending is not configured." });
  const auth = text(req.headers.get("authorization")); const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: userData } = await userDb.auth.getUser(); const user = userData.user; if (!user?.email) return json(401, { error: "Sign in to send a test." });
  const body = await req.json().catch(() => ({})); const organisationId = text(body.organisationId); const senderIdentityId = text(body.senderIdentityId);
  const { data: permitted } = await userDb.rpc("email_campaign_can_send", { p_organisation_id: organisationId }); if (!permitted) return json(403, { error: "You do not have permission to send campaign tests." });
  const { data: identity } = await userDb.from("email_sender_identities").select("display_name,from_email,reply_to_email,verification_status").eq("id", senderIdentityId).eq("organisation_id", organisationId).maybeSingle();
  if (!identity || identity.verification_status !== "verified") return json(400, { error: "Choose a verified sender identity." });
  const html = text(body.html).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/javascript\s*:/gi, "");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "content-type": "application/json" }, body: JSON.stringify({ from: `${identity.display_name} <${identity.from_email}>`, reply_to: identity.reply_to_email, to: [user.email], subject: `[TEST] ${text(body.subject) || "Arch9 email campaign"}`, html }) });
  const result = await response.json().catch(() => ({})); if (!response.ok) return json(502, { error: text(result?.message) || "Provider rejected the test email." });
  return json(200, { deliveredTo: user.email, providerMessageId: result.id });
});
