let handler: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((fn: typeof handler) => { handler = fn; }) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = serve;
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const events = ['email.delivered','email.bounced','email.complained','email.opened','email.clicked','email.suppressed','domain.created','domain.updated','domain.deleted'];
for (const scenario of ['ready','pagination','non-executive','wrong-domain','wrong-id','pending-domain','missing-domain','disabled-sending','zero-budget','budget-error','missing-suppressed','missing-domain-events','disabled-webhook','wrong-secret','unsigned-accepted','provider-error']) {
  Deno.test(`campaign platform readiness: ${scenario}`, async () => {
    const settings: Record<string,string> = {
      SUPABASE_URL:'https://status.example.test',SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_publishable_fixture"}',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_fixture"}',
      RESEND_API_KEY:'resend-fixture-secret',RESEND_WEBHOOK_SECRET:'whsec_fixture-secret',ARCH9_CAMPAIGN_RESEND_DOMAIN_ID:scenario==='missing-domain'?'':'campaign-domain',
      ARCH9_CAMPAIGN_SENDING_ENABLED:scenario==='disabled-sending'?'false':'true',RESEND_BILLING_CONFIRMED:'true',
      ARCH9_RESEND_FROM_EMAIL:'transactional@different.test',RESEND_FROM_EMAIL:'transactional@different.test',
    };
    const previous = new Map(Object.keys(settings).map(key=>[key,Deno.env.get(key)]));
    const originalFetch=globalThis.fetch; const calls: string[]=[];
    try {
      for (const [key,value] of Object.entries(settings)) Deno.env.set(key,value);
      const endpoint='https://status.example.test/functions/v1/resend-webhook';
      const webhook={id:'hook',endpoint,status:scenario==='disabled-webhook'?'disabled':'enabled',events:events.filter(event=>scenario==='missing-suppressed'?event!=='email.suppressed':scenario==='missing-domain-events'?!event.startsWith('domain.'):true),signing_secret:scenario==='wrong-secret'?'wrong':'whsec_fixture-secret'};
      globalThis.fetch=(async (input: any, options: any = {}) => {
        const url=String(input);calls.push(url);
        if (url.endsWith('/auth/v1/user')) return Response.json({id:'executive-user'});
        if (url.endsWith('/rpc/arch9_admin_access_level')) return Response.json({level:scenario==='non-executive'?'viewer':'executive'});
        if (url.includes('/email_campaign_account_limits?')) return scenario==='budget-error'?Response.json({message:'unavailable'},{status:500}):Response.json({enabled:true,daily_limit:scenario==='zero-budget'?0:100,monthly_limit:500});
        if (url.endsWith('/domains/campaign-domain')) return scenario==='provider-error'?Response.json({},{status:429}):Response.json({id:scenario==='wrong-id'?'foreign-id':'campaign-domain',name:scenario==='wrong-domain'?'different.test':'updates.arch9.co.za',status:scenario==='pending-domain'?'pending':'verified'});
        if (url.includes('/webhooks?')) {
          assert(options.method == null || options.method==='GET','Status must never change provider settings');
          if (scenario==='pagination' && !url.includes('after=')) return Response.json({data:[{id:'earlier',endpoint:'https://other.example.test',status:'enabled'}],has_more:true});
          return Response.json({data:[webhook],has_more:false});
        }
        if (url.endsWith('/webhooks/hook')) return Response.json(webhook);
        if (url===endpoint) return new Response(null,{status:scenario==='unsigned-accepted'?200:401});
        throw new Error(`Unexpected fixture request: ${url}`);
      }) as typeof fetch;
      const response=await handler(new Request('https://status.example.test',{method:'POST',headers:{authorization:'Bearer user-fixture'}}));
      const result=await response.json();
      assert(response.status===(scenario==='non-executive'?403:scenario==='provider-error'?502:200),`Status must reflect access/storage errors: ${response.status} ${JSON.stringify(result)}`);
      if (scenario==='non-executive') assert(!calls.some(url=>url.startsWith('https://api.resend.com')),'Unauthorised callers must never reach the provider');
      else {
        assert(result.ready===['ready','pagination'].includes(scenario),`Incorrect readiness for ${scenario}`);
        assert(result.platformSenderDomain==='updates.arch9.co.za','Check campaign domain independently of transactional mail');
        assert(!JSON.stringify(result).includes('fixture-secret'),'Never expose provider or webhook secrets');
        assert(response.headers.get('cache-control')==='no-store','Do not cache operational readiness');
      }
    } finally {
      globalThis.fetch=originalFetch;
      for (const [key,value] of previous) value===undefined?Deno.env.delete(key):Deno.env.set(key,value);
    }
  });
}
