import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { handleLeadAgentEmailDispatcher } from "../_shared/leadAgentEmailDispatch.ts";

Deno.serve((request) => {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return handleLeadAgentEmailDispatcher(request, {
    serviceRoleKey: key,
    apiKey: Deno.env.get("RESEND_API_KEY") || "",
    appUrl: Deno.env.get("ARCH9_APP_URL") || "https://app.arch9.co.za",
    enabled: !["false", "0", "off", "disabled"].includes(
      (Deno.env.get("LEAD_OPERATIONS_EMAILS_ENABLED") || "true").toLowerCase(),
    ),
    clientEnabled: !["false", "0", "off", "disabled"].includes(
      (Deno.env.get("LEAD_INTRO_EMAILS_ENABLED") || "true").trim()
        .toLowerCase(),
    ),
    client: url && key
      ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      : null,
  });
});
