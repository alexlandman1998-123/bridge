// Exercise the real HTTP handler without a server, database, or email provider.
let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve;
const originalFetch = globalThis.fetch;
Deno.serve = ((callback: typeof handler) => { handler = callback; }) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = originalServe;
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const names = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ARCH9_APP_URL'];
const previous = new Map(names.map(name => [name,Deno.env.get(name)]));

Deno.test('Attorney worker denies public callers and uses only the authorised service claim', async () => {
  let calls = 0;
  Deno.env.set('SUPABASE_URL','https://worker.example.test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','worker-test-only-key');
  Deno.env.set('ARCH9_APP_URL','https://app.example.test');
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    assert(String(input).endsWith('/rest/v1/rpc/claim_attorney_appointment_delivery'),'Unexpected external request');
    const payload = JSON.parse(String(init?.body));
    assert(payload.p_limit === 25,'Worker must bound the claim batch');
    return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try {
    assert((await handler(new Request('https://worker.example.test',{method:'GET'}))).status===405,'GET must be rejected');
    assert((await handler(new Request('https://worker.example.test',{method:'POST'}))).status===403,'Anonymous callers must be rejected');
    assert((await handler(new Request('https://worker.example.test',{method:'POST',headers:{Authorization:'Bearer unrelated-key'}}))).status===403,'Unrelated credentials must be rejected');
    assert(calls===0,'Unauthorized requests must not reach the database');
    const response=await handler(new Request('https://worker.example.test',{method:'POST',headers:{Authorization:'Bearer worker-test-only-key','Content-Type':'application/json'},body:'{"limit":1000}'}));
    assert(response.status===200,'Authorised worker should run');
    const result=await response.json();
    assert(result.claimed===0 && result.ok===true,'Empty queue should complete normally');
    assert(calls===1,'An empty queue must not invoke email delivery');
    Deno.env.delete('ARCH9_APP_URL');
    assert((await handler(new Request('https://worker.example.test',{method:'POST',headers:{Authorization:'Bearer worker-test-only-key'}}))).status===500,'Missing target app URL must fail clearly');
    assert(calls===1,'Incomplete configuration must not claim jobs');
  } finally {
    globalThis.fetch=originalFetch;
    for (const [name,value] of previous) { if (value===undefined) Deno.env.delete(name); else Deno.env.set(name,value); }
  }
});
