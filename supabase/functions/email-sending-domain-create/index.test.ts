let handler:(request:Request)=>Promise<Response>;
const serve=Deno.serve;Deno.serve=((callback:typeof handler)=>{handler=callback}) as typeof Deno.serve;
await import('./index.ts');Deno.serve=serve;
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message)};
for(const scenario of ['provider-unavailable','recover-created-domain','recover-lookup-failed','recover-lookup-mismatch','disabled-sending'])Deno.test(`sending-domain setup: ${scenario}`,async()=>{
 const values={SUPABASE_URL:'https://domain.example.test',SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'sb_publishable_fixture'}),SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_fixture'}),RESEND_API_KEY:'resend-fixture'};
 const prior=new Map(Object.keys(values).map(key=>[key,Deno.env.get(key)])),fetcher=globalThis.fetch;
 const calls:any[]=[];const domain:any={id:'local',organisation_id:'org',domain_name:'updates.example.test',provider_domain_id:scenario==='provider-unavailable'?'provider':null,verification_status:'pending',dns_records:[]};
 const json=(body:unknown,status=200)=>Response.json(body,{status});
 try{
  for(const [key,value] of Object.entries(values))Deno.env.set(key,value);
  globalThis.fetch=(async(input:any,init:any={})=>{
   const url=String(input),method=init.method||'GET';calls.push({url,method});
   if(url.includes('/auth/v1/user'))return json({id:'user'});
   if(url.includes('/rpc/email_campaign_can_send'))return json(true);
   if(url.includes('/rest/v1/email_sending_domains')){
    if(method==='PATCH')Object.assign(domain,JSON.parse(init.body));return json(domain);
   }
   if(url.startsWith('https://api.resend.com/domains/provider')){
    assert(init.signal instanceof AbortSignal, 'Provider lookups must have a deadline');
    if(scenario==='provider-unavailable'||scenario==='recover-lookup-failed')return json({message:'provider unavailable'},503);
    if(scenario==='recover-lookup-mismatch')return json({id:'wrong-provider',name:'another.test',status:'verified'});
    if(scenario==='disabled-sending')return json({id:'provider',name:domain.domain_name,status:'verified',capabilities:{sending:'disabled'},records:[]});
    return json({id:'provider',name:domain.domain_name,status:'pending',records:[{type:'TXT',name:'resend._domainkey',value:'public-proof'}]});
   }
   if(url.startsWith('https://api.resend.com/domains?'))return json({data:[{id:'provider',name:domain.domain_name}],has_more:false});
   throw Error(`Unexpected fixture request ${method} ${url}`);
  }) as typeof fetch;
  const result=await handler(new Request('https://edge.test',{method:'POST',headers:{authorization:'Bearer user-session','content-type':'application/json'},body:JSON.stringify({organisationId:'org',domain:domain.domain_name})}));
  if(scenario==='provider-unavailable')assert(result.status===502,'Provider outage must not report cached setup success: '+result.status+' '+JSON.stringify(calls));
  else if(scenario==='recover-lookup-failed'||scenario==='recover-lookup-mismatch'){assert(result.status===502,'Unconfirmed provider state must not become cached verification');assert(domain.provider_domain_id==='provider','Keep the recovered provider ID for retries');assert(domain.verification_status==='pending','Unconfirmed domain stays pending')}
  else{if(scenario==='disabled-sending')assert(domain.verification_status==='failed','A receiving-only domain cannot send');assert(result.status===201,`Recovery response ${result.status} ${JSON.stringify(calls)}`);assert(domain.provider_domain_id==='provider','Persist recovered provider ID');assert(!calls.some(c=>c.url==='https://api.resend.com/domains'&&c.method==='POST'),'Never recreate the recovered provider domain')}
 }finally{globalThis.fetch=fetcher;for(const [key,value] of prior)value===undefined?Deno.env.delete(key):Deno.env.set(key,value)}
});
