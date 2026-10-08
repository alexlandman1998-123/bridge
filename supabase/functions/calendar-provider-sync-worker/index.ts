// Pinned dependency follows the existing Edge Function entrypoint pattern.
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.49.9";
import { dispatchCalendarProviderConnection } from "../_shared/calendarProviderRuntime.ts";
import { type Data } from "../_shared/calendarProviderTransport.ts";
import { calendarProviderConfig } from "../_shared/calendarProviderConfig.ts";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "POST is required." });
  }
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json(403, { error: "Worker authorization required." });
  }
  const config = calendarProviderConfig();
  if (!config.supabaseUrl || !config.encryptionKey || !config.appUrl) {
    return json(503, { error: "Calendar worker configuration is incomplete." });
  }
  const service = createClient(config.supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const input = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(input.limit) || 5, 5));
  const connections = await service.rpc("claim_calendar_provider_connections", {
    p_limit: limit,
  });
  if (connections.error) {
    return json(500, { error: "Calendar connections could not be claimed." });
  }
  const results = await Promise.allSettled(
    (connections.data || []).map((connection: Data) =>
      dispatchCalendarProviderConnection(connection, {
        config,
        service,
        user: () => Promise.resolve(null),
      }, 10)
    ),
  );
  return json(results.some((r) => r.status === "rejected") ? 500 : 200, {
    claimed: results.length,
    completed: results.filter((r) => r.status === "fulfilled").length,
  });
});
