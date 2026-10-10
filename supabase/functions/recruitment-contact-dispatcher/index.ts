import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { dispatchRecruitmentContacts } from "./handler.ts";

Deno.serve((request) => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  return dispatchRecruitmentContacts(request, {
    key,
    apiKey: Deno.env.get("RESEND_API_KEY") || "",
    admin: key && url
      ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      : null,
  });
});
