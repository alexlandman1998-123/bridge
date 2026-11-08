import { supabaseServiceKey } from "../_shared/apiCredentials.ts";
import { campaignDestination, verifyCampaignDestination } from "../_shared/emailCampaignTracking.ts";
const html = (status: number, title: string, message: string) => new Response(`<!doctype html><title>${title}</title><main style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:32px"><h1>${title}</h1><p>${message}</p></main>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const value = (input: string | null) => String(input || "").trim();
type Dependencies = { createClient: any; env: (key: string) => string | undefined; defer?: (task: Promise<unknown>) => void; report?: (message: string) => void };

export function createCampaignTrackingHandler({ createClient, env, defer, report = console.warn }: Dependencies) {
  // Cache only destinations already authorised by the database; never trust a
  // browser-provided fallback URL. Entries expire and the isolate cache is bounded.
  const legacyDestinations = new Map<string, { target: string; expires: number }>();
  return async (req: Request) => {
    if (req.method !== "GET") return html(405, "Method not allowed", "Use a link from an email campaign.");
    const url = new URL(req.url);
    const linkToken = value(url.searchParams.get("l")), recipientId = value(url.searchParams.get("r")), recipientToken = value(url.searchParams.get("t"));
    if (!linkToken || linkToken.length > 128 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientId) || !recipientToken || recipientToken.length > 128) return html(400, "Invalid link", "This tracking link is incomplete.");
    const serviceKey = supabaseServiceKey({ get: env } as typeof Deno.env) || '';
    const db = createClient(env("SUPABASE_URL") || "", serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const args = { p_link_token: linkToken, p_recipient_id: recipientId, p_recipient_token: recipientToken };
    const signed = await verifyCampaignDestination(env('EMAIL_CAMPAIGN_LINK_SIGNING_SECRET') || serviceKey, url);
    let target = signed?.u || null;
    if (!target) {
      const cacheKey = `${linkToken}:${recipientId}:${recipientToken}`;
      const cached = legacyDestinations.get(cacheKey);
      try {
        const resolved = await db.rpc('email_campaign_resolve_link', args);
        if (resolved.error) throw resolved.error;
        target = campaignDestination(resolved.data);
        if (target) {
          if (legacyDestinations.size >= 1000) legacyDestinations.delete(legacyDestinations.keys().next().value!);
          legacyDestinations.set(cacheKey, { target, expires: Date.now() + 5 * 60_000 });
        }
      } catch {
        target = cached && cached.expires > Date.now() ? cached.target : null;
        if (!target) return html(503, 'Temporarily unavailable', 'This link could not be resolved. Please try again shortly.');
      }
    }
    if (!target) return html(404, "Invalid link", "This tracking link is no longer available.");
    const record = (async () => {
      try {
        const result = await db.rpc('email_campaign_record_click_v2', { ...args, p_metadata: {
          userAgent: (req.headers.get('user-agent') || '').slice(0, 512),
          purpose: [req.headers.get('purpose'), req.headers.get('sec-purpose'), req.headers.get('x-purpose')].filter(Boolean).join(' ').slice(0, 80),
        } });
        if (result.error) throw result.error;
        if (signed?.a) {
          const attributed = await db.rpc('marketing_record_link_click', { p_token: signed.a, p_metadata: {
            userAgent: (req.headers.get('user-agent') || '').slice(0,512), purpose: [req.headers.get('purpose'),req.headers.get('sec-purpose')].filter(Boolean).join(' ').slice(0,80),
          } });
          if (attributed.error) throw attributed.error;
        }
      } catch { report('email_campaign_tracking.event_write_failed'); }
    })();
    if (defer) defer(record);
    else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([record, new Promise(resolve => { timer = setTimeout(resolve, 200); })]);
      clearTimeout(timer);
    }
    return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store", 'referrer-policy': 'no-referrer' } });
  };
}
