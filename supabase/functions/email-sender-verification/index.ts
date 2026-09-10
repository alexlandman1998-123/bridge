import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const authorization = req.headers.get("authorization") || "";
  const organisationId = String((await req.json().catch(() => ({})))?.organisationId || "").trim();
  if (!authorization || !organisationId) return json(400, { error: "Organisation and signed-in session are required." });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!url || !anonKey || !serviceKey || !resendKey) return json(500, { error: "Sender verification is not configured." });
  const caller = createClient(url, anonKey, { global: { headers: { authorization } }, auth: { persistSession: false } });
  const { data: allowed } = await caller.rpc("email_campaign_can_send", { p_organisation_id: organisationId });
  if (!allowed) return json(403, { error: "You are not allowed to verify senders for this organisation." });
  const response = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${resendKey}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return json(502, { error: payload?.message || "Resend domain check failed." });
  const domains = new Map((payload?.data || []).map((domain: any) => [String(domain.name || "").toLowerCase(), String(domain.status || "").toLowerCase()]));
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: identities, error } = await db.from("email_sender_identities").select("id,domain_name").eq("organisation_id", organisationId).eq("provider", "resend");
  if (error) return json(500, { error: error.message });
  const now = new Date().toISOString(); let verified = 0;
  for (const identity of identities || []) {
    const status = domains.get(String(identity.domain_name || "").toLowerCase());
    const nextStatus = status === "verified" ? "verified" : status ? "pending" : "failed";
    if (nextStatus === "verified") verified += 1;
    await db.from("email_sender_identities").update({ verification_status: nextStatus, verified_at: nextStatus === "verified" ? now : null, last_verified_at: now }).eq("id", identity.id);
  }
  return json(200, { verified, checked: (identities || []).length });
});
