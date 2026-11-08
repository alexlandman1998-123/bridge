import { supabaseServiceKey } from "../_shared/apiCredentials.ts";
const page = (title: string, message: string, status = 200, confirm = false) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:32px"><h1>${title}</h1><p>${message}</p>${confirm ? '<form method="post"><button name="confirm" value="unsubscribe" type="submit" style="padding:12px 20px">Unsubscribe</button></form>' : ''}</main>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'referrer-policy': 'no-referrer' } });
export function createUnsubscribeHandler({ createClient, env }: { createClient: any; env: (key: string) => string | undefined }) {
  return async (req: Request) => {
    if (!["GET", "POST"].includes(req.method)) return page("Method not allowed", "Please use your email link.", 405);
    const url = new URL(req.url), token = url.searchParams.get("token") || "";
    if (!token || token.length > 256) return page("Invalid link", "This unsubscribe link is incomplete.", 400);
    // Link scanners and previews must never change consent by fetching a URL.
    if (req.method === 'GET') return page('Unsubscribe', 'Stop marketing emails from this organisation.', 200, true);
    if (Number(req.headers.get('content-length') || 0) > 4096) return page('Invalid request', 'Please use your email link.', 400);
    const raw = await req.text().catch(() => '');
    if (new TextEncoder().encode(raw).length > 4096) return page('Invalid request', 'Please use your email link.', 400);
    const body = new URLSearchParams(raw), oneClick = body.get('List-Unsubscribe') === 'One-Click';
    if (!oneClick && body.get('confirm') !== 'unsubscribe') return page('Confirm unsubscribe', 'Use the button below to unsubscribe.', 400, true);
    const db = createClient(env("SUPABASE_URL") || "", supabaseServiceKey({ get: env } as typeof Deno.env) || "", { auth: { persistSession: false, autoRefreshToken: false } });
    const recipientId = url.searchParams.get('r') || '';
    try {
      const { data, error } = await db.rpc('email_campaign_change_preferences', {
        p_token: token, p_selected: [],
        p_recipient_id: /^[0-9a-f-]{36}$/i.test(recipientId) ? recipientId : null,
        p_recipient_token: (url.searchParams.get('t') || '').slice(0, 128) || null,
        p_source: oneClick ? 'mailbox_one_click' : 'campaign_unsubscribe',
      });
      if (error) return page("Temporarily unavailable", "Your unsubscribe could not be saved. Please try again shortly.", 503);
      if (!data) return page("Invalid link", "This unsubscribe link is no longer available.", 404);
      return page("You’re unsubscribed", "You will no longer receive marketing emails from this organisation.");
    } catch { return page('Temporarily unavailable', 'Your unsubscribe could not be saved. Please try again shortly.', 503); }
  };
}
