import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const escapeHtml = (value: unknown) => String(value || "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
const page = (title: string, body: string, status = 200) => new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><main><p class="eyebrow">ARCH9 EMAIL PREFERENCES</p><h1>${escapeHtml(title)}</h1>${body}</main><style>body{margin:0;background:#f6f7fb;color:#182230;font:16px system-ui,-apple-system,sans-serif}main{max-width:560px;margin:8vh auto;background:#fff;border:1px solid #e6e8ee;border-radius:18px;padding:36px;box-shadow:0 18px 48px #1018280d}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;color:#667085}h1{letter-spacing:-.03em}label{display:block;padding:15px 0;border-top:1px solid #eaecf0;cursor:pointer}small{display:block;color:#667085;margin:5px 0 0 27px}button{background:#182230;color:#fff;border:0;border-radius:9px;padding:12px 17px;font-weight:700;cursor:pointer;margin-top:22px}</style></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

Deno.serve(async (req) => {
  if (!["GET", "POST"].includes(req.method)) return page("Method not allowed", "<p>Please use the link in your email.</p>", 405);
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return page("Invalid link", "<p>This preference link is incomplete.</p>", 400);
  const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  const { data: preference } = await db.from("contact_marketing_preferences").select("organisation_id,email").eq("unsubscribe_token", token).maybeSingle();
  if (!preference) return page("Invalid link", "<p>This preference link is no longer available.</p>", 404);
  const { data: types } = await db.from("email_subscription_types").select("id,slug,name,description").eq("organisation_id", preference.organisation_id).eq("is_active", true).order("display_order");
  if (req.method === "POST") {
    const form = await req.formData();
    const selected = new Set(form.getAll("subscription").map(String));
    const activeIds = new Set((types || []).map((type) => type.id));
    const now = new Date().toISOString();
    for (const type of types || []) {
      const subscribed = selected.has(type.id) && activeIds.has(type.id);
      await db.from("contact_email_subscriptions").upsert({ organisation_id: preference.organisation_id, subscription_type_id: type.id, email: preference.email, status: subscribed ? "subscribed" : "unsubscribed", source: "preference_centre", consent_captured_at: subscribed ? now : null, unsubscribed_at: subscribed ? null : now }, { onConflict: "organisation_id,subscription_type_id,email" });
    }
    if (selected.size) {
      await db.from("contact_marketing_preferences").update({ marketing_consent_status: "opted_in", consent_source: "preference_centre", consent_captured_at: now, unsubscribed_at: null }).eq("unsubscribe_token", token);
      await db.from("email_suppressions").delete().eq("organisation_id", preference.organisation_id).eq("email", preference.email).eq("reason", "unsubscribe");
    } else {
      await db.from("contact_marketing_preferences").update({ marketing_consent_status: "opted_out", unsubscribed_at: now }).eq("unsubscribe_token", token);
      await db.from("email_suppressions").upsert({ organisation_id: preference.organisation_id, email: preference.email, reason: "unsubscribe", source: "preference_centre" }, { onConflict: "organisation_id,email" });
    }
    return page("Preferences saved", `<p>Your choices for <strong>${escapeHtml(preference.email)}</strong> have been updated.</p>`);
  }
  const { data: subscriptions } = await db.from("contact_email_subscriptions").select("subscription_type_id,status").eq("organisation_id", preference.organisation_id).eq("email", preference.email);
  const subscribedIds = new Set((subscriptions || []).filter((item) => item.status === "subscribed").map((item) => item.subscription_type_id));
  const choices = (types || []).map((type) => `<label><input type="checkbox" name="subscription" value="${escapeHtml(type.id)}" ${subscribedIds.has(type.id) ? "checked" : ""}> <strong>${escapeHtml(type.name)}</strong><small>${escapeHtml(type.description)}</small></label>`).join("");
  return page("Choose what you receive", `<p>Manage marketing email for <strong>${escapeHtml(preference.email)}</strong>. Untick every option to stop all marketing email.</p><form method="post">${choices || "<p>No email categories are currently available.</p>"}<button type="submit">Save preferences</button></form>`);
});
