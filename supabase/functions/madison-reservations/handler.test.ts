import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { buildMadisonEmail, handleMadisonReservations } from './handler.ts';
const payload={kind:'buyer_request',buyerName:'Buyer <script>',buyerEmail:'buyer@example.test',buyerPhone:'0820000000',unitNumber:'042',reference:'MP-123',expiresAt:'2026-11-08T10:00:00Z',trustName:'Tuckers Attorneys',accountHolder:'Test trust',bankName:'Test bank',accountNumber:'123456',branchCode:'123456',refundTerms:'Fully refundable R10,000.',to:'buyer@example.test',replyTo:'proof@example.test'};
const input={action:'request',requestId:'10000000-0000-4000-8000-000000000001',unitId:'20000000-0000-4000-8000-000000000001',name:'Buyer Name',email:'buyer@example.test',phone:'0820000000',consent:true,refundTerms:payload.refundTerms};
function deps(rpc: any) {return {client:{rpc},enabled:true,apiKey:'test',from:'verified@example.test',serviceKeys:['test-service'],hashSalt:'salt'}}
const req=(body:unknown,headers:Record<string,string>={})=>new Request('https://project.supabase.co/functions/v1/madison-reservations',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://madisonplace.co.za',...headers},body:JSON.stringify(body)});
Deno.test('email contains exact SAST deadline, trust EFT details and manual confirmation; HTML is escaped',()=>{
 const result=buildMadisonEmail(payload);
 assertStringIncludes(result.text,'R10,000');assertStringIncludes(result.text,'Tuckers Attorneys');assertStringIncludes(result.text,'12:00 SAST');assertStringIncludes(result.text,'Proof of payment alone');assertStringIncludes(result.text,'MP-123');assertStringIncludes(result.html,'&lt;script&gt;');assertEquals(result.html.includes('<script>'),false);
 assertStringIncludes(buildMadisonEmail({...payload,kind:'confirmed'}).text,'manually confirmed');
 assertStringIncludes(buildMadisonEmail({...payload,kind:'expired'}).text,'Do not pay again');
});
Deno.test('validated intake calls only the scoped RPC, fingerprints input and returns queued rather than sent',async()=>{
 let call:any;
 const response=await handleMadisonReservations(req(input,{'x-forwarded-for':'1.2.3.4'}),deps(async(name:any,args:any)=>{call={name,args};return{data:{id:input.requestId,state:'awaiting_deposit',expiresAt:payload.expiresAt,reference:'MP-123'},error:null}}));
 assertEquals(response.status,200);assertEquals((await response.json()).emailStatus,'queued');assertEquals(call.name,'madison_request_reservation');assertEquals(call.args.p_refund_terms,input.refundTerms);assertEquals(call.args.p_ip_hash.length,64);assertEquals(call.args.p_ip_hash.includes('1.2.3.4'),false);
});
Deno.test('disabled, invalid, bot and untrusted-origin requests cannot write',async()=>{
 let calls=0;const d=deps(()=>{calls++;return{data:null,error:null}});
 assertEquals((await handleMadisonReservations(req(input),{...d,enabled:false})).status,503);
 for(const change of [{consent:false},{name:''},{email:'bad'},{website:'bot'},{unitId:'wrong'}])assertEquals((await handleMadisonReservations(req({...input,...change}),d)).status,400);
 assertEquals((await handleMadisonReservations(req(input,{origin:'https://other.example'}),d)).status,403);assertEquals(calls,0);
});
Deno.test('conflict and rate limits use safe buyer-facing errors',async()=>{
 for(const [code,status] of [['23514',409],['54000',429],['55000',503]]){
  const response=await handleMadisonReservations(req(input),deps(()=>({data:null,error:{code,message:'sensitive internals'}})));
  assertEquals(response.status,status);assertEquals(JSON.stringify(await response.json()).includes('sensitive internals'),false);
 }
});
Deno.test('worker requires the exact service credential and preserves its provider idempotency key',async()=>{
 const writes:any[]=[];let envelope:any;
 const client={rpc:()=>({data:[{id:'email-id',payload}],error:null}),from:()=>({update:(value:any)=>({eq:()=>({eq:()=>{writes.push(value);return{error:null}}})})})};
 const d={...deps(()=>({})),client,send:async(value:any)=>{envelope=value;return{ok:true as const,status:200,data:{id:'provider-id'}}}};
 assertEquals((await handleMadisonReservations(req({action:'dispatch'}),d)).status,401);
 assertEquals((await handleMadisonReservations(req({action:'dispatch'},{apikey:'wrong'}),d)).status,401);
 // Real-looking controlled test address is suppressed by the shared delivery guard.
 const realPayload={...payload,to:'buyer@samlin.co.za'};client.rpc=()=>({data:[{id:'email-id',payload:realPayload}],error:null});
 const response=await handleMadisonReservations(req({action:'dispatch'},{apikey:'test-service'}),d);
 assertEquals(response.status,200);assertEquals(envelope.idempotencyKey,'madison-reservation/email-id');assertEquals(writes.at(-1).state,'sent');
});
