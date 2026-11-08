import assert from 'node:assert/strict'
import {test} from 'node:test'
import {build} from '../the-it-guy/node_modules/esbuild/lib/main.js'
const built=await build({entryPoints:[new URL('../apps/websites/app/api/analytics/route.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'fixture-boundaries',setup(builder){
 builder.onResolve({filter:/^(next\/server|@\/lib\/(site-repository|supabase-server|measurement))$/},args=>args.path==='@/lib/measurement'?{path:new URL('../apps/websites/lib/measurement.ts',import.meta.url).pathname}:{path:args.path,namespace:'fixture'})
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/server'?'export class NextResponse extends Response {}':args.path.includes('supabase-server')?'export const getServerSupabase=()=>globalThis.marketingIngestionFixture':'export const normalizeHostname=value=>String(value||"").trim().toLowerCase().replace(/:\\d+$/, "")',loader:'js'}))
}}]})
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'))
const request=(patch={},headers={})=>new Request('https://agency.test/api/analytics',{method:'POST',headers:{host:'agency.test',origin:'https://agency.test','user-agent':'Mozilla/5.0','content-type':'application/json',...headers},body:JSON.stringify({eventId:'11111111-1111-4111-8111-111111111111',eventType:'page_view',path:'/properties',measurement:{sessionId:'session-123456789',lastTouch:{token:'12345678901234567890123456789012'}},...patch})})
test('actual website route forwards only allowed measurement fields and inspects RPC outcomes',async()=>{
 const calls=[];globalThis.marketingIngestionFixture={rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null}}}
 assert.equal((await POST(request({measurement:{sessionId:'session-123456789',email:'private@example.test',organisationId:'foreign',lastTouch:{token:'12345678901234567890123456789012',email:'private@example.test'}}}))).status,204)
 assert.equal(calls[0].name,'website_record_measurement_event');assert.equal(calls[0].args.p_page_path,'/properties');assert.ok(!JSON.stringify(calls).includes('private@example'))
 await POST(request({measurement:null,eventId:null}));assert.equal(calls[1].name,'website_record_analytics_event','Cached older collectors remain compatible')
})
test('actual website route excludes foreign origins, previews, automation and DNT before storage',async()=>{
 let calls=0;globalThis.marketingIngestionFixture={rpc:async()=>{calls++;return {}}}
 for(const headers of [{origin:'https://foreign.test'},{dnt:'1'},{'user-agent':'Proofpoint scanner'},{'sec-purpose':'prefetch'},{referer:'https://agency.test/?arch9_preview=1'}])assert.equal((await POST(request({},headers))).status,204)
 assert.equal(calls,0)
})
test('storage failure produces retryable failure and a non-PII operator signal',async()=>{
 globalThis.marketingIngestionFixture={rpc:async()=>({error:{code:'XX000',message:'private@example.test'}})}
 const original=console.warn,logs=[];console.warn=message=>logs.push(message)
 try{assert.equal((await POST(request())).status,503);assert.ok(logs[0].includes('analytics.write_failed'));assert.ok(!logs[0].includes('private@example'))}finally{console.warn=original;delete globalThis.marketingIngestionFixture}
})
