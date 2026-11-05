import { refreshSendingDomain } from "../_shared/emailSendingDomain.ts";
import { supabasePublishableKey, supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "content-type": "application/json" },
});
const text = (value: unknown) => String(value || "").trim();
Deno.serve(withApiCredentials(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const authorization = text(req.headers.get("authorization"));
  const body = await req.json().catch(() => ({}));
  const organisationId = text(body?.organisationId);
  const domainId = text(body?.domainId);
  if (!authorization || !organisationId || !domainId) return json(401, { error: "A signed-in session, organisation and sending domain are required." });

  const url = text(Deno.env.get("SUPABASE_URL"));
  const anonKey = text(supabasePublishableKey() || Deno.env.get("SUPABASE_PUBLISHABLE_KEY"));
  const serviceKey = text(supabaseServiceKey());
  const resendKey = text(Deno.env.get("RESEND_API_KEY"));
  if (!url || !anonKey || !serviceKey || !resendKey) return json(500, { error: "Sending-domain verification is not configured." });

  const caller = createClient(url, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "Your session could not be verified." });
  const { data: allowed, error: permissionError } = await caller.rpc("email_campaign_can_send", { p_organisation_id: organisationId });
  if (permissionError || !allowed) return json(403, { error: "You are not allowed to verify sending domains for this organisation." });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: domain, error: domainError } = await db.from("email_sending_domains")
    .select("id,domain_name,provider_domain_id,dns_records,verification_status")
    .eq("id", domainId)
    .eq("organisation_id", organisationId)
    .eq("provider", "resend")
    .maybeSingle();
  if (domainError) return json(500, { error: "Unable to load this sending domain." });
  if (!domain) return json(404, { error: "Sending domain not found." });
  if (!domain.provider_domain_id) return json(409, { error: "This domain has not finished provider setup. Set it up again before verifying." });

  if (domain.verification_status === "disabled") return json(409, { error: "This domain is disabled." });
  // A verified domain only needs a read, never a new asynchronous verification cycle.
  if (domain.verification_status === "verified") {
    try { const status = await refreshSendingDomain({ db, domain, resendKey }); return json(200, { domain: { id: domain.id, status } }); }
    catch { return json(502, { error: "Unable to refresh the sending domain. Try again shortly." }); }
  }
  const now = new Date().toISOString();
  const verifyResponse = await fetch(`https://api.resend.com/domains/${encodeURIComponent(domain.provider_domain_id)}/verify`, {
    method: "POST",
    headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
  });
  const verifyPayload = await verifyResponse.json().catch(() => ({}));
  if (!verifyResponse.ok) {
    const message = text(verifyPayload?.message || "Resend could not start domain verification.");
    await db.from("email_sending_domains").update({
      verification_status: "failed",
      last_provider_error: message.slice(0, 500),
      last_checked_at: now,
    }).eq("id", domain.id);
    return json(502, { error: "The email provider could not verify this domain. Check the DNS records and try again." });
  }

  try {
    const requested = await db.from("email_sending_domains").update({ verification_requested_at: now }).eq("id", domain.id);
    if (requested.error) throw requested.error;
    const status = await refreshSendingDomain({ db, domain, resendKey });
    return json(200, { domain: { id: domain.id, domainName: domain.domain_name, status } });
  } catch {
    return json(502, { error: "Verification started but its status could not be saved. Recheck shortly." });
  }
}));
