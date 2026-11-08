// Signed-in verification endpoint with local provider/REST fixtures only.
let handler: (req: Request) => Promise<Response>;
const originalServe = Deno.serve;
Deno.serve = ((fn: typeof handler) => { handler = fn; }) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = originalServe;
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };

Deno.test('a custom-domain check failure does not block the independent platform sender check', async () => {
  const settings = { SUPABASE_URL: 'https://verification.example.test', SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_fixture' }), SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_fixture' }), RESEND_API_KEY: 'fixture-resend', ARCH9_CAMPAIGN_SENDING_ENABLED: 'true', ARCH9_CAMPAIGN_RESEND_DOMAIN_ID: 'platform-domain' };
  const previous = new Map(Object.keys(settings).map(key => [key, Deno.env.get(key)]));
  const originalFetch = globalThis.fetch;
  const writes: any[] = [];
  try {
    for (const [key,value] of Object.entries(settings)) Deno.env.set(key,value);
    globalThis.fetch = (async (input: any, options: any = {}) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/rpc/email_campaign_can_send')) return json(true);
      if (url.includes('/email_sending_domains?')) {
        assert(url.includes('organisation_id=eq.org'), 'Custom domains must be organisation scoped');
        return json([{ id: 'custom', domain_name: 'updates.custom.co.za', provider_domain_id: 'custom-domain', verification_status: 'verified' }]);
      }
      if (url.endsWith('/domains/custom-domain')) return json({},503);
      if (url.endsWith('/domains/platform-domain')) return json({ id: 'platform-domain', name: 'updates.arch9.co.za', status: 'verified' });
      if (url.endsWith('/rpc/email_campaign_apply_platform_status')) { writes.push(JSON.parse(options.body)); return json(null); }
      if (url.endsWith('/rpc/email_activate_verified_organisation')) return json(null);
      if (url.includes('/email_sender_identities?')) return json([{ id: 'shared', verification_status: 'verified' }]);
      throw new Error(`Unexpected fixture request: ${url}`);
    }) as typeof fetch;
    const response = await handler(new Request('https://verification.example.test', { method: 'POST', headers: { authorization: 'Bearer fixture-user', 'content-type': 'application/json' }, body: JSON.stringify({ organisationId: 'org' }) }));
    const result = await response.json();
    assert(response.status === 200, 'Independent verification must finish');
    assert(result.platformSender.ready === true, 'Platform sending remains verified despite a custom-domain error');
    assert(result.customDomainCheckError && result.domainsVerified === 0, 'Custom verification failure must remain visible');
    assert(writes.length === 1 && writes[0].p_provider_domain_id === 'platform-domain' && writes[0].p_status === 'verified', 'Only the trusted platform identity may update platform readiness');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of previous) value === undefined ? Deno.env.delete(key) : Deno.env.set(key,value);
  }
});
