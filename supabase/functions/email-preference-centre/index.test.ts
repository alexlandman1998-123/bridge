// Hosted bearer links use only the token's organisation/address. Local REST
// fixtures exercise HTTP failures; the PGlite test exercises atomic SQL writes.
let captured: (req: Request) => Promise<Response>;
const originalServe = Deno.serve;
Deno.serve = ((fn: typeof captured) => { captured = fn; }) as typeof Deno.serve;
await import('../email-unsubscribe/index.ts');
const unsubscribe = captured!;
await import('./index.ts');
const preferences = captured!;
await import('../email-campaign-track/index.ts');
const tracking = captured!;
Deno.serve = originalServe;
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const category = '11111111-1111-4111-8111-111111111111';
for (const scenario of ['unsubscribe','write-failure','missing-token','foreign-category','read-failure','escaped-view']) {
  Deno.test(`hosted preferences: ${scenario}`, async () => {
    const previousFetch = globalThis.fetch;
    const settings = { SUPABASE_URL: 'https://preferences.example.test', SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_fixture' }) };
    const previous = new Map(Object.keys(settings).map(key => [key, Deno.env.get(key)]));
    const writes: any[] = [];
    try {
      for (const [key,value] of Object.entries(settings)) Deno.env.set(key,value);
      globalThis.fetch = (async (input: any, options: any = {}) => {
        const url = String(input);
        const json = (body: unknown, status = 200) => Response.json(body, { status });
        if (url.endsWith('/rpc/email_campaign_apply_preferences')) {
          writes.push(JSON.parse(options.body));
          if (scenario === 'write-failure') return json({ code: 'XX000', message: 'Database unavailable' },500);
          if (scenario === 'foreign-category') return json({ code: '22023', message: 'Wrong organisation' },400);
          return json(scenario !== 'missing-token');
        }
        assert(!options.method || options.method === 'GET', 'All writes must use one atomic RPC');
        if (url.includes('/contact_marketing_preferences?')) {
          assert(url.includes('unsubscribe_token=eq.link-token'), 'Look up only the bearer token');
          return json({ organisation_id: 'own-org', email: '<script>alert(1)</script>@example.test' });
        }
        assert(url.includes('organisation_id=eq.own-org'), 'Preference reads must use the token organisation');
        if (url.includes('/email_subscription_types?')) return scenario === 'read-failure' ? json({ message: 'Unavailable' },500) : json([{ id: category, name: '<b>News</b>', description: 'Updates' }]);
        if (url.includes('/contact_email_subscriptions?')) return json([{ subscription_type_id: category, status: 'subscribed' }]);
        throw new Error(`Unexpected request: ${url}`);
      }) as typeof fetch;
      const isPreference = ['foreign-category','read-failure','escaped-view'].includes(scenario);
      const method = scenario === 'escaped-view' || scenario === 'read-failure' ? 'GET' : 'POST';
      const response = await (isPreference ? preferences : unsubscribe)(new Request('https://functions.example.test/?token=link-token&organisationId=foreign&email=foreign@example.test', {
        method, ...(method === 'POST' ? { body: new URLSearchParams({ subscription: category, organisationId: 'foreign' }) } : {}),
      }));
      const html = await response.text();
      const expected = scenario === 'write-failure' || scenario === 'read-failure' ? 503 : scenario === 'foreign-category' ? 400 : scenario === 'missing-token' ? 404 : 200;
      assert(response.status === expected, `Expected ${expected}, received ${response.status}`);
      assert(response.headers.get('cache-control') === 'no-store', 'Bearer pages must not be cached');
      if (scenario === 'unsubscribe') assert(JSON.stringify(writes) === JSON.stringify([{ p_token: 'link-token', p_selected: [] }]), 'Ignore foreign organisation/address fields');
      if (scenario === 'foreign-category') assert(!html.includes('<h1>Preferences saved'), 'Rejected foreign choices cannot report success');
      if (scenario === 'escaped-view') assert(!html.includes('<script>') && html.includes('&lt;script&gt;') && html.includes('&lt;b&gt;News'), 'Escape all displayed values');
    } finally {
      globalThis.fetch = previousFetch;
      for (const [key,value] of previous) value === undefined ? Deno.env.delete(key) : Deno.env.set(key,value);
    }
  });
}

for (const scenario of ['redirect','invalid-link','write-error','unsafe-target','invalid-id']) {
  Deno.test(`hosted tracking: ${scenario}`, async () => {
    const originalFetch=globalThis.fetch;
    const settings={SUPABASE_URL:'https://preferences.example.test',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_fixture"}'};
    const previous=new Map(Object.keys(settings).map(key=>[key,Deno.env.get(key)]));
    let requests=0;
    try {
      for(const [key,value] of Object.entries(settings)) Deno.env.set(key,value);
      globalThis.fetch=(async(input: any,options: any={})=>{
        requests++;
        assert(String(input).endsWith('/rpc/email_campaign_record_click'),'Tracking must use its atomic RPC');
        assert(JSON.parse(options.body).p_link_token==='link-token','Keep the original bearer capability');
        return scenario==='write-error'?Response.json({code:'XX000',message:'Fixture error'},{status:500}):Response.json(scenario==='invalid-link'?null:scenario==='unsafe-target'?'javascript:alert(1)':'https://example.com/listings');
      }) as typeof fetch;
      const response=await tracking(new Request(`https://functions.example.test/?l=link-token&r=${scenario==='invalid-id'?'bad-id':'11111111-1111-4111-8111-111111111111'}&t=recipient-token`));
      assert(response.status===(scenario==='redirect'?302:scenario==='write-error'?503:scenario==='invalid-id'?400:404),'Tracking must reflect committed storage and validated destination');
      assert(response.headers.get('cache-control')==='no-store','Tracking redirects must not be cached');
      if(scenario==='invalid-id') assert(requests===0,'Reject malformed ids before storage');
      if(scenario==='redirect') assert(response.headers.get('location')==='https://example.com/listings','Redirect only to the confirmed target');
    } finally {
      globalThis.fetch=originalFetch;
      for(const [key,value] of previous) value===undefined?Deno.env.delete(key):Deno.env.set(key,value);
    }
  });
}
