import { refreshPlatformCampaignSender } from "../_shared/emailCampaignPlatformSender.ts";
import { refreshSendingDomain } from "../_shared/emailSendingDomain.ts";
import { supabasePublishableKey, supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const text = (value: unknown) => String(value || "").trim();
Deno.serve(withApiCredentials(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const authorization = req.headers.get("authorization") || "";
  const organisationId = String((await req.json().catch(() => ({})))?.organisationId || "").trim();
  if (!authorization || !organisationId) return json(400, { error: "Organisation and signed-in session are required." });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = supabasePublishableKey() || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceKey = supabaseServiceKey() || "";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!url || !anonKey || !serviceKey || !resendKey) return json(500, { error: "Sender verification is not configured." });
  const caller = createClient(url, anonKey, { global: { headers: { authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: allowed } = await caller.rpc("email_campaign_can_send", { p_organisation_id: organisationId });
  if (!allowed) return json(403, { error: "You are not allowed to verify senders for this organisation." });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: domainRows, error: domainError } = await db.from("email_sending_domains")
    .select("id,domain_name,provider_domain_id,verification_status")
    .eq("organisation_id", organisationId)
    .eq("provider", "resend");
  if (domainError) return json(500, { error: domainError.message });

  let domainsVerified = 0;
  let customDomainCheckError = "";
  try {
    for (const domain of domainRows || []) {
      try { if (await refreshSendingDomain({ db, domain, resendKey }) === "verified") domainsVerified += 1; }
      catch { customDomainCheckError = "Some custom domains could not be checked. Their campaigns must wait for verification."; }
    }
    let platformSender;
    try { platformSender = await refreshPlatformCampaignSender({ db, env: (key) => Deno.env.get(key), resendKey }); }
    catch { platformSender = { email: "noreply@updates.arch9.co.za", ready: false, error: "Arch9 campaign sending could not be checked." }; }
    const activated = await db.rpc("email_activate_verified_organisation", { p_organisation_id: organisationId });
    if (activated.error) throw new Error("Sending readiness could not be checked.");
    const { data: identities, error } = await db.from("email_sender_identities").select("id,verification_status")
      .eq("organisation_id", organisationId).eq("provider", "resend");
    if (error) throw new Error("Unable to load sender status.");
    return json(200, { verified: (identities || []).filter((i) => i.verification_status === "verified").length,
      checked: (identities || []).length, domainsVerified, domainsChecked: (domainRows || []).length, platformSender, customDomainCheckError });
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : "Unable to check sending domains." });
  }
}));
