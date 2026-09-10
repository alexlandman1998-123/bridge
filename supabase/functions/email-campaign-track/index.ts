import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const html = (status: number, title: string, message: string) => new Response(`<!doctype html><title>${title}</title><main style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:32px"><h1>${title}</h1><p>${message}</p></main>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const value = (input: string | null) => String(input || "").trim();

Deno.serve(async (req) => {
  if (req.method !== "GET") return html(405, "Method not allowed", "Use a link from an email campaign.");
  const url = new URL(req.url);
  const linkToken = value(url.searchParams.get("l"));
  const recipientId = value(url.searchParams.get("r"));
  const recipientToken = value(url.searchParams.get("t"));
  if (!linkToken || !recipientId || !recipientToken) return html(400, "Invalid link", "This tracking link is incomplete.");
  const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  const { data: recipient } = await db.from("email_campaign_recipients").select("id,campaign_id,organisation_id,tracking_token").eq("id", recipientId).eq("tracking_token", recipientToken).maybeSingle();
  const { data: link } = await db.from("email_campaign_links").select("campaign_id,target_url").eq("tracking_token", linkToken).maybeSingle();
  if (!recipient || !link || recipient.campaign_id !== link.campaign_id || !/^https?:\/\//i.test(link.target_url)) return html(404, "Invalid link", "This tracking link is no longer available.");
  // Every redirect is a distinct engagement event; analytics aggregate unique
  // recipient IDs separately from raw clicks.
  await db.from("email_events").insert({ organisation_id: recipient.organisation_id, campaign_id: recipient.campaign_id, recipient_id: recipient.id, provider: "arch9", provider_event_id: `click:${crypto.randomUUID()}`, event_type: "clicked", url: link.target_url, payload: { source: "campaign_redirect" } });
  await db.from("email_campaign_recipients").update({ status: "clicked", clicked_at: new Date().toISOString() }).eq("id", recipient.id).in("status", ["sent", "delivered", "opened", "clicked"]);
  return Response.redirect(link.target_url, 302);
});
