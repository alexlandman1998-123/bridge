// Exercise the real HTTP handler without a server, database, or email provider.
let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve;
const originalFetch = globalThis.fetch;
Deno.serve = ((callback: typeof handler) => { handler = callback; }) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = originalServe;
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const names = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS','ARCH9_APP_URL','RESEND_API_KEY','ARCH9_RESEND_FROM_EMAIL','RESEND_FROM_EMAIL'];
const previous = new Map(names.map(name => [name,Deno.env.get(name)]));

Deno.test('Handoff worker denies public callers and uses only the authorised service claim', async () => {
  let calls = 0;
  Deno.env.set('SUPABASE_URL','https://worker.example.test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','worker-test-only-key');
  Deno.env.set('ARCH9_APP_URL','https://app.example.test');
  Deno.env.set('RESEND_API_KEY','test-only-provider-key');
  Deno.env.set('ARCH9_RESEND_FROM_EMAIL','Arch9 <no-reply@arch9.co.za>');
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    assert(String(input).endsWith('/rest/v1/rpc/claim_transaction_handoff_dispatch'),'Unexpected external request');
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

function configureWorker() {
  Deno.env.set('SUPABASE_URL','https://worker.example.test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','worker-test-only-key');
  Deno.env.set('SUPABASE_SECRET_KEYS',JSON.stringify({default:'sb_secret_worker_test',scheduler:'sb_secret_named_test'}));
  Deno.env.set('ARCH9_APP_URL','https://app.example.test');
  Deno.env.set('RESEND_API_KEY','test-only-provider-key');
  Deno.env.set('ARCH9_RESEND_FROM_EMAIL','Arch9 <no-reply@arch9.co.za>');
}

function restoreWorker() {
  globalThis.fetch = originalFetch;
  for (const [name,value] of previous) {
    if (value === undefined) Deno.env.delete(name); else Deno.env.set(name,value);
  }
}

const post = (headers: Record<string,string>, body = '{"limit":10}') => new Request('https://worker.example.test', {
  method:'POST', headers:{'Content-Type':'application/json',...headers}, body,
});

Deno.test('New default and named secret keys authorize only exact configured service credentials', async () => {
  configureWorker();
  let claims = 0;
  globalThis.fetch = (async (input, init) => {
    assert(String(input).endsWith('/rest/v1/rpc/claim_transaction_handoff_dispatch'),'Only claims are allowed');
    claims++;
    assert(JSON.parse(String(init?.body)).p_limit === 10,'Use the bounded default batch');
    return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try {
    const accepted: Array<Record<string,string>> = [
      {apikey:'sb_secret_worker_test'},
      {apikey:'sb_secret_named_test'},
      {apikey:'sb_secret_named_test',Authorization:'Bearer sb_secret_named_test'},
      {apikey:'worker-test-only-key',Authorization:'Bearer worker-test-only-key'},
    ];
    for (const headers of accepted) assert((await handler(post(headers))).status === 200,'Configured service credential should work');
    assert(claims === 4,'An empty batch never sends a message');
    const forged = `eyJhbGciOiJub25lIn0.${btoa('{"role":"service_role"}')}.forged`;
    const denied: Array<Record<string,string>> = [
      {apikey:'sb_secret_unknown'},
      {apikey:'sb_publishable_public'},
      {Authorization:`Bearer ${forged}`},
      {Authorization:'Bearer sb_secret_worker_test'},
      {apikey:'sb_secret_worker_test',Authorization:'Bearer unrelated-user-token'},
      {apikey:'sb_secret_worker_test',Authorization:'Basic worker-test-only-key'},
    ];
    for (const headers of denied) assert((await handler(post(headers))).status === 403,'Unknown, forged or conflicting credentials must be denied');
    assert(claims === 4,'Denied credentials must never reach the queue');
    Deno.env.set('SUPABASE_SECRET_KEYS','not-json');
    assert((await handler(post({apikey:'sb_secret_worker_test'}))).status === 403,'Malformed secret configuration must fail closed');
    Deno.env.set('SUPABASE_SECRET_KEYS',JSON.stringify(['sb_secret_worker_test']));
    assert((await handler(post({apikey:'sb_secret_worker_test'}))).status === 403,'A malformed secret array is not a key register');
    assert(claims === 4,'Invalid secret configuration must never claim work');
  } finally { restoreWorker(); }
});

Deno.test('Authenticated health checks read queue counts without claims, matter changes or email', async () => {
  configureWorker();
  let reads = 0;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    assert(url.pathname === '/rest/v1/transaction_handoff_dispatch_jobs','Health must read only the dispatch queue');
    assert(init?.method === 'HEAD','Health must never call a mutating RPC');
    reads++;
    return new Response(null,{status:200,headers:{'Content-Range':`*/${url.searchParams.get('status') === 'eq.blocked' ? 678 : 0}`}});
  }) as typeof fetch;
  try {
    const response = await handler(post({apikey:'sb_secret_worker_test'},'{"mode":"health"}'));
    assert(response.status === 200,'Valid credentials and queue must pass health');
    const result = await response.json();
    assert(result.configurationReady && result.queue.pending === 0 && result.queue.blocked === 678,'Report exact pending and held counts');
    assert(reads === 2,'No claim or provider call is permitted');
    assert(!JSON.stringify(result).includes('test-only') && !JSON.stringify(result).includes('sb_secret_'),'Health must never return secrets');
    globalThis.fetch = (async () => new Response('{"message":"private database failure"}',{status:500,headers:{'Content-Type':'application/json'}})) as typeof fetch;
    const failure = await handler(post({apikey:'sb_secret_worker_test'},'{"mode":"health"}'));
    assert(failure.status === 503,'Queue access failures must not report ready');
    assert(!(await failure.text()).includes('private database failure'),'Internal failures must not leak');
  } finally { restoreWorker(); }
});

Deno.test('Worker rejects invalid modes and configuration before any dispatch', async () => {
  configureWorker();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('Unexpected database or provider request'); }) as typeof fetch;
  try {
    for (const body of ['[]','null','{broken','{"mode":"helth"}']) {
      assert((await handler(post({apikey:'sb_secret_worker_test'},body))).status === 400,'Malformed input must not fall through to dispatch');
    }
    for (const url of ['http://app.example.test','https://user:password@app.example.test','https://app.example.test/?token=private']) {
      Deno.env.set('ARCH9_APP_URL',url);
      assert((await handler(post({apikey:'sb_secret_worker_test'}))).status === 500,'Invalid workspace links must fail before claiming work');
    }
    Deno.env.set('ARCH9_APP_URL','https://app.example.test');
    Deno.env.delete('RESEND_API_KEY');
    assert((await handler(post({apikey:'sb_secret_worker_test'}))).status === 500,'A missing provider key must block dispatch');
    assert(calls === 0,'Validation failures must never claim or send');
  } finally { restoreWorker(); }
});
