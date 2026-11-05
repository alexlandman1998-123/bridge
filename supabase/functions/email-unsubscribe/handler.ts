import { supabaseServiceKey } from "../_shared/apiCredentials.ts";
const page = (title: string, message: string, status = 200) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:32px"><h1>${title}</h1><p>${message}</p></main>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
export function createUnsubscribeHandler({ createClient, env }: { createClient: any; env: (key: string) => string | undefined }) {
return async (req: Request) => {
  if (!["GET", "POST"].includes(req.method)) return page("Method not allowed", "Please use your email link.", 405);
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return page("Invalid link", "This unsubscribe link is incomplete.", 400);
  const db = createClient(env("SUPABASE_URL") || "", supabaseServiceKey({ get: env } as typeof Deno.env) || "", { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("email_campaign_apply_preferences", { p_token: token, p_selected: [] });
  if (error) return page("Temporarily unavailable", "Your unsubscribe could not be saved. Please try again shortly.", 503);
  if (!data) return page("Invalid link", "This unsubscribe link is no longer available.", 404);
  return page("You’re unsubscribed", "You will no longer receive marketing emails from this organisation.");
};
}
