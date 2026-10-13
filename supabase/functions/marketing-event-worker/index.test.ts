// Execute the actual HTTP entrypoint with isolated database/email transport doubles.
let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve;
const originalFetch = globalThis.fetch;
Deno.serve = ((callback: typeof handler) => { handler = callback; }) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = originalServe;
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const names = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS'];
const previous = new Map(names.map(name => [name,Deno.env.get(name)]));
const legacy = 'legacy-service-test-key';
const opaque = 'sb_secret_worker_test';
const configure = () => {
  Deno.env.set('SUPABASE_URL','https://worker.example.test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY',legacy);
  Deno.env.set('SUPABASE_SECRET_KEYS',JSON.stringify({default:opaque,scheduler:'sb_secret_named_test'}));
};
const restore = () => {
  globalThis.fetch = originalFetch;
  for (const [name,value] of previous) {
    if (value === undefined) Deno.env.delete(name); else Deno.env.set(name,value);
  }
};
const post = (headers: Record<string,string> = {apikey:opaque}, body = '{}') => new Request('https://worker.example.test', {
  method:'POST', headers:{'Content-Type':'application/json',...headers}, body,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}});

Deno.test('Exact modern/default/named and legacy keys work without authorizing forged JWT claims', async () => {
  configure();
  let reads = 0;
  globalThis.fetch = (async (input,init) => {
    const url = new URL(String(input));
    assert(init?.method === 'GET' && url.searchParams.get('status') === 'eq.queued','Dispatch must preserve queued-only reads');
    assert(new Headers(init?.headers).get('apikey') === legacy,'Database client uses its configured service credential');
    reads++;
    return response([]);
  }) as typeof fetch;
  try {
    const accepted: Array<Record<string,string>> = [
      {apikey:opaque},{apikey:'sb_secret_named_test'},
      {apikey:opaque,Authorization:`Bearer ${opaque}`},
      {Authorization:`Bearer ${legacy}`},{apikey:legacy,Authorization:`Bearer ${legacy}`},
    ];
    for (const headers of accepted) {
      const result = await handler(post(headers));
      assert(result.status === 200 && (await result.json()).ok,'Configured service credentials must run an empty batch');
    }
    assert(reads === 10,'Empty queues must never create CRM rows or call email');
    const forged = `eyJhbGciOiJub25lIn0.${btoa('{"role":"service_role"}')}.forged`;
    const denied: Array<Record<string,string>> = [
      {},{apikey:'sb_secret_unknown'},{apikey:'sb_publishable_public'},
      {Authorization:`Bearer ${forged}`},{Authorization:`Bearer ${opaque}`},
      {apikey:opaque,Authorization:'Bearer unrelated-token'},
      {apikey:opaque,Authorization:`Basic ${legacy}`},
    ];
    for (const headers of denied) assert((await handler(post(headers))).status === 403,'Unknown or conflicting credentials must fail before queue access');
    for (const value of ['broken-json',JSON.stringify([opaque])]) {
      Deno.env.set('SUPABASE_SECRET_KEYS',value);
      assert((await handler(post())).status === 403,'Invalid secret registers must fail closed');
    }
    assert(reads === 10,'Denied requests must never reach a queue or provider');
  } finally { restore(); }
});

Deno.test('Health reads queued/due counts and never claims, creates CRM records or calls email', async () => {
  configure();
  let reads = 0;
  globalThis.fetch = (async (input,init) => {
    const url = new URL(String(input));
    assert(init?.method === 'HEAD','Health must never write or send');
    assert(url.searchParams.get('status') === 'eq.queued','Health counts only pending jobs');
    const messages = url.pathname.endsWith('/marketing_event_rsvp_messages');
    if (messages) assert(url.searchParams.get('scheduled_for')?.startsWith('lte.'),'Health must count only due messages');
    else assert(url.pathname.endsWith('/marketing_event_rsvp_handoffs'),'Unexpected health read');
    reads++;
    return new Response(null,{status:200,headers:{'Content-Range':`*/${messages ? 2 : 3}`}});
  }) as typeof fetch;
  try {
    const result = await handler(post({apikey:opaque},'{"mode":"health"}'));
    const body = await result.json();
    assert(result.status === 200 && body.configurationReady && body.queue.handoffs === 3 && body.queue.dueMessages === 2,'Health reports exact pending counts');
    assert(reads === 2 && !JSON.stringify(body).includes(opaque) && !JSON.stringify(body).includes(legacy),'Health performs only safe reads and never returns credentials');
    globalThis.fetch = (async () => response({message:'private database detail'},500)) as typeof fetch;
    const failed = await handler(post({apikey:opaque},'{"mode":"health"}'));
    assert(failed.status === 503 && !(await failed.text()).includes('private database detail'),'Database failure cannot report ready or expose internal errors');
  } finally { restore(); }
});

Deno.test('Invalid methods, bodies, modes and missing internal JWT credentials cannot dispatch', async () => {
  configure();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('Unexpected queue or email access'); }) as typeof fetch;
  try {
    assert((await handler(new Request('https://worker.example.test'))).status === 405,'Only POST is supported');
    for (const body of ['null','[]','{broken','{"mode":"helth"}']) {
      assert((await handler(post({apikey:opaque},body))).status === 400,'Invalid input must not fall through to dispatch');
    }
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    assert((await handler(post())).status === 500,'An opaque caller key cannot replace the internal send-email JWT');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY',legacy);
    Deno.env.delete('SUPABASE_URL');
    assert((await handler(post())).status === 500,'Missing project configuration must block work');
    assert(calls === 0,'All validation failures must occur before queue access');
  } finally { restore(); }
});

Deno.test('Dispatch bounds integer batches and preserves scheduled-only reminder selection', async () => {
  configure();
  let expected = 50;
  globalThis.fetch = (async (input,init) => {
    const url = new URL(String(input));
    assert(init?.method === 'GET' && url.searchParams.get('limit') === String(expected),'Both queues must use bounded integer batches');
    if (url.pathname.endsWith('/marketing_event_rsvp_messages')) assert(url.searchParams.get('scheduled_for')?.startsWith('lte.'),'Future reminders must remain queued');
    return response([]);
  }) as typeof fetch;
  try {
    for (const [limit,bounded] of [[1000,100],[-5,1],[12.8,12],[0,50],['Infinity',50]]) {
      expected = Number(bounded);
      assert((await handler(post({apikey:opaque},JSON.stringify({limit})))).status === 200,'Valid bounded empty dispatch should succeed');
    }
  } finally { restore(); }
});

for (const successful of [true,false]) Deno.test(`Reminder delivery uses the internal JWT and records ${successful ? 'provider success without resending' : 'failure without marking sent'}`, async () => {
  configure();
  const updates: Array<Record<string,unknown>> = [];
  let sendCalls = 0;
  let messagePending = true;
  globalThis.fetch = (async (input,init) => {
    const url = new URL(String(input));
    if (url.pathname === '/functions/v1/send-email') {
      sendCalls++;
      const headers = new Headers(init?.headers);
      assert(headers.get('apikey') === legacy && headers.get('Authorization') === `Bearer ${legacy}`,'The caller opaque key must never be forwarded to the JWT-protected email function');
      const body = JSON.parse(String(init?.body));
      assert(body.idempotencyKey === 'fixture-reminder-id' && body.originalMessage === 'Fixture show day is happening this morning.','Preserve the original reminder identity and content');
      return successful ? response({emailId:'fixture-provider-receipt'}) : response({error:'fixture email rejection'},403);
    }
    if (url.pathname === '/rest/v1/marketing_event_rsvp_handoffs') return response([]);
    assert(url.pathname === '/rest/v1/marketing_event_rsvp_messages','Unexpected CRM mutation or provider request');
    if (init?.method === 'GET') {
      if (!messagePending) return response([]);
      return response([{id:'fixture-message',organisation_id:'fixture-org',message_type:'morning_reminder',idempotency_key:'fixture-reminder-id',dispatch_attempts:0,event:{title:'Fixture show day',event_type:'show_day',address:'Fixture address'},rsvp:{email:'guest@example.test',full_name:'Fixture Guest'}}]);
    }
    assert(init?.method === 'PATCH','Messages are only claimed and completed');
    const update = JSON.parse(String(init?.body));
    updates.push(update);
    if (update.status === 'sending') {
      assert(url.searchParams.get('status') === 'eq.queued','The claim must fence competing workers');
      messagePending = false;
      return response({id:'fixture-message'});
    }
    return new Response(null,{status:204});
  }) as typeof fetch;
  try {
    const result = await handler(post());
    const body = await result.json();
    assert(result.status === 200 && body.messages.sent === (successful ? 1 : 0) && body.messages.failed === (successful ? 0 : 1),'Transport outcomes must retain the existing message status model');
    assert(updates.length === 2 && updates[1].status === (successful ? 'sent' : 'failed'),'A failed email cannot be recorded as sent');
    if (successful) assert(updates[1].provider_message_id === 'fixture-provider-receipt','Preserve provider receipt evidence');
    assert((await handler(post())).status === 200 && sendCalls === 1,'A completed or failed row must not be blindly resent');
  } finally { restore(); }
});
