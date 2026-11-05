import { supabaseServiceKey } from "../_shared/apiCredentials.ts";
const html = (status: number, title: string, message: string) => new Response(`<!doctype html><title>${title}</title><main style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:32px"><h1>${title}</h1><p>${message}</p></main>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const value = (input: string | null) => String(input || "").trim();

export function createCampaignTrackingHandler({ createClient, env }: { createClient: any; env: (key: string) => string | undefined }) {
return async (req: Request) => {
  if (req.method !== "GET") return html(405, "Method not allowed", "Use a link from an email campaign.");
  const url = new URL(req.url);
  const linkToken = value(url.searchParams.get("l"));
  const recipientId = value(url.searchParams.get("r"));
  const recipientToken = value(url.searchParams.get("t"));
  if (!linkToken || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientId) || !recipientToken) return html(400, "Invalid link", "This tracking link is incomplete.");
  const db = createClient(env("SUPABASE_URL") || "", supabaseServiceKey({ get: env } as typeof Deno.env) || "", { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: target, error } = await db.rpc("email_campaign_record_click", {
    p_link_token: linkToken, p_recipient_id: recipientId, p_recipient_token: recipientToken,
  });
  if (error) return html(503, "Temporarily unavailable", "This link could not be recorded. Please try again shortly.");
  if (typeof target !== "string" || !/^https?:\/\//i.test(target)) return html(404, "Invalid link", "This tracking link is no longer available.");
  return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
};
}
