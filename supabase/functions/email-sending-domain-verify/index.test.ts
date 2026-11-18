let handler: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((fn: typeof handler) => { handler = fn; }) as typeof Deno.serve;
await import('./index.ts'); Deno.serve = serve;
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
for (const scenario of ['verified', 'pending', 'failed', 'denied', 'foreign', 'missing-provider', 'outage', 'network-failure']) Deno.test(`manual domain verification: ${scenario}`, async () => {
  const settings = { SUPABASE_URL: 'https://fixture.test', SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_fixture"}', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_fixture"}', RESEND_API_KEY: 'fixture' };
  const prior = new Map(Object.keys(settings).map(k => [k, Deno.env.get(k)]));
  const original = globalThis.fetch, calls: { url: string; method: string }[] = [], writes: any[] = [];
  try {
    for (const [k, v] of Object.entries(settings)) Deno.env.set(k, v);
    globalThis.fetch = (async (input: any, init: any = {}) => {
      const url = String(input), method = init.method || 'GET'; calls.push({ url, method });
      if (url.includes('/auth/v1/user')) return Response.json({ id: 'user' });
      if (url.includes('/rpc/email_domain_can_manage')) return Response.json(scenario !== 'denied');
      if (url.includes('/rest/v1/email_sending_domains')) {
        assert(url.includes('organisation_id=eq.org') || method === 'PATCH', 'Lookup must be tenant scoped');
        if (method === 'PATCH') return Response.json(null);
        return Response.json(scenario === 'foreign' ? null : { id: 'domain', domain_name: 'updates.example.test', provider_domain_id: scenario === 'missing-provider' ? null : 'provider', verification_status: scenario === 'verified' ? 'verified' : 'pending' });
      }
      if (url.includes('/rpc/')) { writes.push(JSON.parse(init.body)); return Response.json(null); }
      if (url.startsWith('https://api.resend.com/')) {
        if (scenario === 'network-failure') throw new TypeError('Network unavailable');
        if (scenario === 'outage') return Response.json({ message: 'Provider unavailable' }, { status: 503 });
        if (method === 'POST') return Response.json({ id: 'provider' });
        return Response.json({ id: 'provider', name: 'updates.example.test', status: scenario === 'failed' ? 'failed' : scenario === 'pending' ? 'pending' : 'verified', records: [] });
      }
      throw new Error(`Unexpected fixture request ${url}`);
    }) as typeof fetch;
    const response = await handler(new Request('https://edge.test', { method: 'POST', headers: { authorization: 'Bearer fixture' }, body: JSON.stringify({ organisationId: 'org', domainId: 'domain' }) }));
    const body = await response.json();
    if (['denied', 'foreign', 'missing-provider'].includes(scenario)) {
      assert(response.status === ({ denied: 403, foreign: 404, 'missing-provider': 409 } as any)[scenario], 'Reject inaccessible/incomplete domain');
      assert(!calls.some(c => c.url.startsWith('https://api.resend.com')), 'Rejected checks must not contact provider');
    } else if (scenario === 'outage' || scenario === 'network-failure') assert(response.status === 502, 'Provider failure must be visible');
    else {
      assert(response.status === 200 && body.domain.status === scenario, 'Return actual verification status');
      assert(writes.some(w => w.p_status === scenario), 'Persist current proof atomically');
      if (scenario === 'verified') assert(!calls.some(c => c.method === 'POST' && c.url.endsWith('/verify')), 'Do not restart verified domain');
    }
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of prior) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
  }
});
