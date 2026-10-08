// Pinned dependency follows the existing Edge Function entrypoint pattern.
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.49.9";
import { handleCalendarProviderConnection } from "../_shared/calendarProviderRuntime.ts";
import { calendarProviderConfig } from "../_shared/calendarProviderConfig.ts";
Deno.serve((request) => {
  const config = calendarProviderConfig(),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!config.supabaseUrl || !secret) {
    return new Response("Calendar connections are not configured.", {
      status: 503,
    });
  }
  const service = createClient(config.supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return handleCalendarProviderConnection(request, {
    config,
    service,
    user: async (token) => {
      const { data, error } = await service.auth.getUser(token);
      return error ? null : data.user;
    },
  });
});
