import type { ProviderConfig } from "./calendarProviderTransport.ts";
export function calendarProviderConfig(): ProviderConfig {
  return {
    googleClientId: Deno.env.get("ARCH9_GOOGLE_CALENDAR_CLIENT_ID") || "",
    googleClientSecret: Deno.env.get("ARCH9_GOOGLE_CALENDAR_CLIENT_SECRET") ||
      "",
    microsoftClientId: Deno.env.get("ARCH9_MICROSOFT_CALENDAR_CLIENT_ID") || "",
    microsoftClientSecret:
      Deno.env.get("ARCH9_MICROSOFT_CALENDAR_CLIENT_SECRET") || "",
    microsoftTenant: Deno.env.get("ARCH9_MICROSOFT_CALENDAR_TENANT") ||
      "common",
    appUrl: Deno.env.get("ARCH9_APP_URL") || "",
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    encryptionKey: Deno.env.get("CALENDAR_PROVIDER_ENCRYPTION_KEY") || "",
  };
}
