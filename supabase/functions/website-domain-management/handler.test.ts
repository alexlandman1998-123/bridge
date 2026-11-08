import { createWebsiteDomainHandler } from './handler.ts';
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message)};
const site='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture({admin=true,status='pending',primary=false,misconfigured=false,exists=true,conflict=false}={}){
 const calls:any[]=[],writes:any[]=[],rpcs:string[]=[];
 const domain={id,hostname:'www.example.test',website_site_id:site,status,is_primary:primary};
 const client:any={auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc:async(name:string)=>{rpcs.push(name);return {data:name==='bridge_is_org_admin'?admin:{id},error:null}},from:(table:string)=>{
  let write:any=null;const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='website_sites'?{id:site,organisation_id:'org'}:exists?domain:null,error:null}),single:async()=>({data:{...domain,...write},error:conflict?{code:'23505'}:null}),insert:(v:any)=>{write=v;writes.push({table,values:v});return q},update:(v:any)=>{write=v;writes.push({table,values:v});return q},then:(resolve:any)=>resolve({data:domain,error:null})};return q;
 }};
 const handler=createWebsiteDomainHandler({createClient:(()=>client) as any,env:(key:string)=> key==='SUPABASE_SECRET_KEYS'?JSON.stringify({default:'sb_secret_fixture'}):key==='SUPABASE_PUBLISHABLE_KEYS'?JSON.stringify({default:'sb_publishable_fixture'}):['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','ARCH9_ALLOW_LEGACY_API_KEYS'].includes(key)?undefined:'fixture',fetcher:(async(url:any,init:any)=>{calls.push({url:String(url),method:init.method});return Response.json(String(url).includes('/config')?{misconfigured,recommendedCNAME:[{rank:1,value:'tenant.vercel-dns.test'}]}:{verified:true,apexName:'example.test',verification:[]})}) as typeof fetch});
 return {calls,writes,rpcs,run:(action:string)=>handler(new Request('https://edge.test',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify({action,siteId:site,domainId:id,hostname:domain.hostname})}))};
}
Deno.test('ordinary website readers cannot connect, verify, promote or remove a domain',async()=>{
 for(const action of ['connect','verify','make-primary','remove']){const f=fixture({admin:false});assert((await f.run(action)).status===403,action);assert(!f.calls.length&&!f.writes.length,'No provider or database writes before admin authorization')}
});
Deno.test('owned but misconfigured DNS stays pending and cannot become primary',async()=>{
 const f=fixture({misconfigured:true});assert((await f.run('verify')).ok,'verification request');assert(f.writes[0].values.status==='pending','Ownership alone is insufficient');
 assert((await f.run('make-primary')).status===409,'Block promotion');assert(!f.rpcs.includes('website_activate_verified_domain'),'No activation');
});
Deno.test('verified routing stores provider DNS instructions and preserves team/project query scope',async()=>{
 const f=fixture();assert((await f.run('verify')).ok,'verify');const saved=f.writes[0].values;
 assert(saved.status==='verified'&&saved.dns_instructions.configuration.recommendedCNAME[0].value==='tenant.vercel-dns.test','Save exact recommendations');
 const url=new URL(f.calls.find(c=>c.url.includes('/config')).url);assert(url.searchParams.get('projectIdOrName')==='fixture'&&url.searchParams.get('teamId')==='fixture','Keep both query parameters');
});
Deno.test('active/primary domains cannot be removed or demoted by repeated setup',async()=>{
 const f=fixture({status:'active',primary:true});assert((await f.run('remove')).status===409,'Block removal');assert((await f.run('connect')).status===409,'Block reconnection');assert(!f.calls.length,'No deletion or registration');
 assert((await f.run('verify')).ok,'Refresh');assert(f.writes[0].values.status==='active','Preserve active routing');
});
Deno.test('hostname reservation conflict prevents provider changes',async()=>{
 const f=fixture({exists:false,conflict:true});assert((await f.run('connect')).status===409,'Conflict');assert(!f.calls.length,'Reserve hostname before provider request');
});

Deno.test('retrying interrupted website setup recovers the existing project domain without registering again',async()=>{
 const f=fixture();assert((await f.run('connect')).ok,'Recover setup');assert(!f.calls.some(c=>c.method==='POST'),'Use existing project domain');assert(f.writes[0].values.status==='verified','Save recovered configuration');
});
