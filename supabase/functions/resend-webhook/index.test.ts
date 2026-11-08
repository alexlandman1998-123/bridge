// Real signed HTTP handler with local fixture requests only.
let handler: (request: Request) => Promise<Response>;
const originalServe=Deno.serve, originalFetch=globalThis.fetch;
Deno.serve=((callback: typeof handler)=>{handler=callback;}) as typeof Deno.serve;
await import('./index.ts');Deno.serve=originalServe;
const assert=(condition: unknown,message: string)=>{if(!condition)throw new Error(message);};
Deno.test('Calendar receipts require a valid provider signature and repair duplicate-audit retries',async()=>{
 const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS','RESEND_WEBHOOK_SECRET'];
 const previous=new Map(names.map(name=>[name,Deno.env.get(name)]));
 const keyBytes=new TextEncoder().encode('calendar-webhook-fixture-key-32');
 const secret=btoa(String.fromCharCode(...keyBytes));
 const raw=JSON.stringify({type:'email.delivered',data:{email_id:'provider-fixture'}});
 const timestamp=String(Math.floor(Date.now()/1000)),eventId='fixture-event';
 const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${eventId}.${timestamp}.${raw}`)));
 const headers={'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':`v1,${btoa(String.fromCharCode(...signature))}`};
 let receipts=0,audits=0,failReceipt=false;
 globalThis.fetch=(async(input: RequestInfo|URL,init?: RequestInit)=>{
  const url=String(input);
  if(url.includes('/rpc/email_campaign_record_provider_event'))return new Response('false',{headers:{'Content-Type':'application/json'}});
  if(url.includes('/rpc/record_calendar_provider_receipt')){
   receipts++;const body=JSON.parse(String(init?.body));assert(body.p_provider_id==='provider-fixture'&&body.p_event_type==='email.delivered','Receipt must use verified provider data');
   return new Response(JSON.stringify(failReceipt?{code:'42501',message:'fixture failure'}:true),{status:failReceipt?403:200,headers:{'Content-Type':'application/json'}});
  }
  assert(url.includes('/notification_provider_webhook_events'),'Unexpected external request');audits++;
  return new Response(JSON.stringify({code:'23505',message:'Duplicate fixture audit'}),{status:409,headers:{'Content-Type':'application/json'}});
 }) as typeof fetch;
 try{
  Deno.env.set('SUPABASE_URL','https://webhook.example.test');Deno.env.set('SUPABASE_SECRET_KEYS',JSON.stringify({default:'sb_secret_fixture_only'}));Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');Deno.env.set('RESEND_WEBHOOK_SECRET',`whsec_${secret}`);
  const request=(valid=true)=>new Request('https://webhook.example.test',{method:'POST',headers:valid?headers:{...headers,'svix-signature':'v1,invalid'},body:raw});
  assert((await handler(request(false))).status===401,'Invalid signature must fail');assert(receipts===0&&audits===0,'Invalid signatures must not access storage');
  assert((await handler(request())).status===200,'Signed receipt should succeed');
  assert((await handler(request())).status===200,'Duplicate audit should remain retryable');
  assert(receipts===2&&audits===2,'Every signed retry must reconcile calendar receipt before audit dedupe');
  failReceipt=true;assert((await handler(request())).status===500,'Storage failure must ask provider to retry');assert(audits===2,'Failed receipt must not be swallowed by audit dedupe');
 } finally {
  globalThis.fetch=originalFetch;
  for(const [name,value]of previous){if(value===undefined)Deno.env.delete(name);else Deno.env.set(name,value);}
 }
});

async function campaignFixture(eventType: string, run: (request: () => Promise<Response>, state: any) => Promise<void>) {
 const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS','RESEND_WEBHOOK_SECRET'];
 const previous=new Map(names.map(name=>[name,Deno.env.get(name)]));
 const keyBytes=new TextEncoder().encode('campaign-reliability-fixture-key');
 const secret=btoa(String.fromCharCode(...keyBytes));
 const state={applies:0,audits:0,patches:0,failApply:false,failAudit:false,matched:true};
 globalThis.fetch=(async(input: RequestInfo|URL,init?: RequestInit)=>{
  const url=String(input);const json=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  if(url.includes('/rpc/email_campaign_record_provider_event')){
   state.applies++;const args=JSON.parse(String(init?.body));
   assert(args.p_event_type===eventType&&args.p_provider_id==='fixture-provider'&&args.p_event_id==='campaign-fixture-event','Campaign RPC must receive signed identity and event type');
   assert(args.p_payload.type===eventType,'Campaign RPC must retain the signed payload');
   return state.failApply?json({code:'XX000',message:'fixture storage failure'},500):json(state.matched);
  }
  if(url.includes('/rpc/record_calendar_provider_receipt'))return json(true);
  assert(url.includes('/notification_provider_webhook_events'),'Unexpected external request');
  if(init?.method==='PATCH'){state.patches++;return state.failAudit?json({message:'fixture audit failure'},500):json(null);}
  state.audits++;return json({code:'23505',message:'fixture prior audit'},409);
 }) as typeof fetch;
 const request=async()=>{
  const raw=JSON.stringify({type:eventType,data:{email_id:'fixture-provider'}});
  const timestamp=String(Math.floor(Date.now()/1000)),eventId='campaign-fixture-event';
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${eventId}.${timestamp}.${raw}`)));
  return handler(new Request('https://webhook.example.test',{method:'POST',body:raw,headers:{'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':`v1,${btoa(String.fromCharCode(...signature))}`}}));
 };
 try{
  Deno.env.set('SUPABASE_URL','https://webhook.example.test');Deno.env.set('SUPABASE_SECRET_KEYS',JSON.stringify({default:'sb_secret_fixture_only'}));Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');Deno.env.set('RESEND_WEBHOOK_SECRET',`whsec_${secret}`);
  await run(request,state);
 }finally{
  globalThis.fetch=originalFetch;
  for(const [name,value]of previous){if(value===undefined)Deno.env.delete(name);else Deno.env.set(name,value);}
 }
}

for(const type of ['email.sent','email.delivery_delayed','email.failed','email.delivered','email.opened','email.clicked','email.bounced','email.complained','email.suppressed']){
 Deno.test(`Campaign ${type} retries repair storage before shared audit deduplication`,async()=>{
  await campaignFixture(type,async(request,state)=>{
   state.failApply=true;
   assert((await request()).status===500,'Campaign storage failure must ask Resend to retry');
   assert(state.audits===0,'Failed campaign receipts must not be acknowledged by duplicate audit');
   state.failApply=false;
   const response=await request();
   assert(response.status===200&&(await response.json()).campaign===true,'Signed retry must reconcile the campaign');
   assert(state.applies===2&&state.patches===1,'Retry must apply receipt and repair the prior audit');
   assert((await request()).status===200,'Repeated signed receipt stays idempotent');
   assert(state.applies===3,'Campaign reconciliation must precede shared deduplication every time');
  });
 });
}

Deno.test('Campaign audit failures remain retryable and early unmatched events reach durable storage',async()=>{
 await campaignFixture('email.clicked',async(request,state)=>{
  state.failAudit=true;
  assert((await request()).status===500,'Failed campaign audit must not claim completion');
  state.failAudit=false;
  assert((await request()).status===200,'Retry repairs the audit');
  state.matched=false;
  const response=await request();
  assert(response.status===200&&(await response.json()).campaign===false,'Unmatched receipt is retained by RPC while operational audit continues');
  assert(state.applies===3,'All arrivals, including early unmatched events, must reach receipt storage');
 });
});

Deno.test('domain callbacks update only the matching custom or platform verification state',async()=>{
 const settings={SUPABASE_URL:'https://domains.example.test',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_fixture_only'}),RESEND_API_KEY:'fixture-resend',ARCH9_CAMPAIGN_RESEND_DOMAIN_ID:'platform-id',ARCH9_CAMPAIGN_SENDING_ENABLED:'true',RESEND_WEBHOOK_SECRET:''};
 const previous=new Map(Object.keys(settings).map(name=>[name,Deno.env.get(name)]));
 const keyBytes=new TextEncoder().encode('domain-callback-fixture-secret');
 settings.RESEND_WEBHOOK_SECRET=`whsec_${btoa(String.fromCharCode(...keyBytes))}`;
 const changes: string[]=[];
 try{
  for(const [name,value]of Object.entries(settings))Deno.env.set(name,value);
  globalThis.fetch=(async(input: any,options: any={})=>{
   const url=String(input),json=(body: unknown)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
   if(url.includes('/email_sending_domains?'))return json(url.includes('provider_domain_id=eq.custom-id')?{id:'custom-row',domain_name:'updates.customer.co.za',provider_domain_id:'custom-id'}:null);
   if(url.endsWith('/rpc/email_apply_domain_status')){const body=JSON.parse(options.body);assert(body.p_domain_id==='custom-row','Custom callback must use its matched row');changes.push('custom');return json(null);}
   if(url.endsWith('/rpc/email_campaign_apply_platform_status')){const body=JSON.parse(options.body);assert(body.p_provider_domain_id==='platform-id','Platform callback must use the server-configured ID');changes.push(`platform:${body.p_status}`);return json(null);}
   if(url.endsWith('/rpc/email_record_tracking_status'))return json(null);
   if(url.endsWith('/domains/platform-id'))return json({id:'platform-id',name:'updates.arch9.co.za',status:'verified'});
   throw new Error(`Unexpected fixture request: ${url}`);
  })as typeof fetch;
  const request=async(id: string,type='domain.deleted')=>{
   const timestamp=String(Math.floor(Date.now()/1000)),eventId=`domain-${id}-${type}`;
   const raw=JSON.stringify({type,data:{id}});
   const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${eventId}.${timestamp}.${raw}`)));
   return handler(new Request('https://domains.example.test',{method:'POST',body:raw,headers:{'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':`v1,${btoa(String.fromCharCode(...signature))}`}}));
  };
  assert((await request('platform-id')).status===200,'Platform deletion must invalidate its proof');
  assert(changes.join(',')==='platform:failed','Platform deletion must not alter customer domain rows');
  assert((await request('custom-id')).status===200,'Custom deletion must invalidate its matched domain');
  assert(changes.join(',')==='platform:failed,custom','Custom deletion must not alter platform verification');
  assert((await request('unknown-id')).status===200,'Unmatched domain events are acknowledged');
  assert(changes.length===2,'An unrelated provider domain must change neither sender option');
  assert((await request('platform-id','domain.updated')).status===200,'Platform update must re-read trusted provider state');
  assert(changes[2]==='platform:verified','Current provider proof must be used for platform updates');
 }finally{
  globalThis.fetch=originalFetch;
  for(const [name,value]of previous)value===undefined?Deno.env.delete(name):Deno.env.set(name,value);
 }
});
