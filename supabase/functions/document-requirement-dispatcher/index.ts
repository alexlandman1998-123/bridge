import { supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { handleRequirementDelivery } from "../_shared/documentRequirementDelivery.ts";
Deno.serve(withApiCredentials(request => {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = supabaseServiceKey() || "";
  return handleRequirementDelivery(request, {
    serviceRoleKey: key, apiKey: Deno.env.get("RESEND_API_KEY") || "",
    appUrl: Deno.env.get("ARCH9_APP_URL") || "https://app.arch9.co.za",
    enabled: !["false", "0", "off", "disabled"].includes((Deno.env.get("DOCUMENT_REQUEST_EMAILS_ENABLED") || "true").toLowerCase()),
    client: url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null,
  });
}));
