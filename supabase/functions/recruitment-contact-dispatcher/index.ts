import { supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { dispatchRecruitmentContacts } from "./handler.ts";

Deno.serve(withApiCredentials((request) => {
  const key = supabaseServiceKey() || "";
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
}));
