import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const page = (title: string, message: string, status = 200) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:32px"><h1>${title}</h1><p>${message}</p></main>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return page("Invalid link", "This unsubscribe link is incomplete.", 400);
  const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  const { data } = await db.from("contact_marketing_preferences").select("organisation_id,email").eq("unsubscribe_token", token).maybeSingle();
  if (!data) return page("Invalid link", "This unsubscribe link is no longer available.", 404);
  const now = new Date().toISOString();
  await db.from("contact_marketing_preferences").update({ marketing_consent_status: "opted_out", unsubscribed_at: now }).eq("unsubscribe_token", token);
  await db.from("contact_email_subscriptions").update({ status: "unsubscribed", unsubscribed_at: now, source: "one_click_unsubscribe" }).eq("organisation_id", data.organisation_id).eq("email", data.email);
  await db.from("email_suppressions").upsert({ organisation_id: data.organisation_id, email: data.email, reason: "unsubscribe", source: "hosted_unsubscribe" }, { onConflict: "organisation_id,email" });
  await db.from("email_campaign_recipients").update({ status: "unsubscribed" }).eq("organisation_id", data.organisation_id).eq("email", data.email).in("status", ["queued", "sent", "delivered", "opened", "clicked"]);
  return page("You’re unsubscribed", "You will no longer receive marketing emails from this organisation.");
});
