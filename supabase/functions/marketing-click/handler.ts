import { campaignDestination } from '../_shared/emailCampaignTracking.ts';
type Dependencies = { db: any; defer?: (task: Promise<unknown>) => void; report?: (message: string) => void };
export function createMarketingClickHandler({ db, defer, report = console.warn }: Dependencies) {
  const cache = new Map<string, { url: string; firstParty: boolean; expires: number }>();
  return async (request: Request) => {
    const fail = (status: number, message: string) => new Response(message, { status, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } });
    if (request.method !== 'GET') return fail(405, 'Use a link from your campaign.');
    const token = new URL(request.url).searchParams.get('token') || '';
    if (!/^[a-zA-Z0-9_-]{20,128}$/.test(token)) return fail(400, 'This campaign link is incomplete.');
    let resolved: { url: string; firstParty: boolean } | null = null;
    try {
      const result = await db.rpc('marketing_resolve_attribution_link', { p_token: token });
      if (result.error) throw result.error;
      const url = campaignDestination(result.data?.url);
      if (!url) return fail(404, 'This campaign link is no longer available.');
      resolved = { url, firstParty: result.data.firstParty === true };
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(token, { ...resolved, expires: Date.now() + 300_000 });
    } catch {
      const stored = cache.get(token);
      if (stored && stored.expires > Date.now()) resolved = stored;
      else return fail(503, 'This link is temporarily unavailable. Please try again shortly.');
    }
    const destination = new URL(resolved.url);
    if (resolved.firstParty) destination.searchParams.set('arch9_attribution', token);
    const record = (async () => {
      try {
        const result = await db.rpc('marketing_record_link_click', { p_token: token, p_metadata: {
          userAgent: (request.headers.get('user-agent') || '').slice(0,512),
          purpose: [request.headers.get('purpose'),request.headers.get('sec-purpose')].filter(Boolean).join(' ').slice(0,80),
        } });
        if (result.error) throw result.error;
      } catch { report('marketing_click.event_write_failed'); }
    })();
    if (defer) defer(record);
    else { let timer: ReturnType<typeof setTimeout> | undefined; await Promise.race([record,new Promise(resolve => {timer=setTimeout(resolve,200);})]); clearTimeout(timer); }
    return new Response(null,{status:302,headers:{location:destination.href,'cache-control':'no-store','referrer-policy':'no-referrer'}});
  };
}
