// Real signed HTTP handler with local fixture requests only.
let handler: (request: Request) => Promise<Response>;
const originalServe=Deno.serve, originalFetch=globalThis.fetch;
Deno.serve=((callback: typeof handler)=>{handler=callback;}) as typeof Deno.serve;
await import('./index.ts');Deno.serve=originalServe;
const assert=(condition: unknown,message: string)=>{if(!condition)throw new Error(message);};
Deno.test('Calendar receipts require a valid provider signature and repair duplicate-audit retries',async()=>{
 const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','RESEND_WEBHOOK_SECRET'];
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
  if(url.includes('/rpc/record_calendar_provider_receipt')){
   receipts++;const body=JSON.parse(String(init?.body));assert(body.p_provider_id==='provider-fixture'&&body.p_event_type==='email.delivered','Receipt must use verified provider data');
   return new Response(JSON.stringify(failReceipt?{code:'42501',message:'fixture failure'}:true),{status:failReceipt?403:200,headers:{'Content-Type':'application/json'}});
  }
  assert(url.includes('/notification_provider_webhook_events'),'Unexpected external request');audits++;
  return new Response(JSON.stringify({code:'23505',message:'Duplicate fixture audit'}),{status:409,headers:{'Content-Type':'application/json'}});
 }) as typeof fetch;
 try{
  Deno.env.set('SUPABASE_URL','https://webhook.example.test');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','local-fixture-only');Deno.env.set('RESEND_WEBHOOK_SECRET',`whsec_${secret}`);
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
