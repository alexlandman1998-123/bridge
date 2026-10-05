import { buildTransactionHandoffEmail, dispatchTransactionHandoffJob } from './transactionHandoffDelivery.ts';
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const config={appUrl:'https://app.arch9.co.za',sender:'Arch9 <no-reply@arch9.co.za>',apiKey:'test-only-provider-key'};
const job={id:'dispatch-one',channel:'email',recipient_key:'intake@betabond.co.za',attempt_count:1,lease_token:'lease',context:{transactionReference:'MAT-1',roleType:'bond_originator',organisationName:'Beta Bond'}};
Deno.test('Frozen payload and stable provider identity survive retries; successes require a provider receipt',async()=>{
  let frozen: any=null;const receipts:any[]=[];const sends:any[]=[];
  const client={rpc:async(name:string,args:any)=>{
    if(name==='freeze_transaction_handoff_email'){frozen ||= args.p_payload;return {data:frozen};}
    if(name==='complete_transaction_handoff_dispatch'){receipts.push(args);return {data:true};}
    throw new Error('Unexpected RPC');
  }};
  const fail=async(payload:any)=>{sends.push(payload);return {ok:false as const,status:503,error:{message:'provider error with private data'}};};
  assert((await dispatchTransactionHandoffJob(client,job,config,fail)).status==='failed','Failure must not appear sent');
  const success=async(payload:any)=>{sends.push(payload);return {ok:true as const,status:200,data:{id:'provider-one'}};};
  assert((await dispatchTransactionHandoffJob(client,{...job,attempt_count:2},{...config,sender:'Changed sender'},success)).status==='sent','Retry should confirm delivery');
  assert(sends[0].html===sends[1].html && sends[0].from===sends[1].from && sends[0].idempotencyKey===sends[1].idempotencyKey,'Retries must use exact frozen provider input');
  assert(!JSON.stringify(frozen).includes(config.apiKey),'Provider credentials must not be persisted');
  assert(receipts[0].p_status==='failed' && receipts[0].p_reason==='delivery_failed','Persist neutral error');
  assert(receipts[1].p_status==='sent' && receipts[1].p_provider_id==='provider-one','Provider ID is required');
});
Deno.test('Stale claims and controlled test recipients never contact the provider',async()=>{
  let sends=0;let freezeCalls=0;const receipts:any[]=[];
  const sender=async()=>{sends++;return {ok:true as const,status:200,data:{id:'provider-one'}};};
  const client={rpc:async(name:string,args:any)=>{if(name==='freeze_transaction_handoff_email'){freezeCalls++;return {data:null};}receipts.push(args);return {data:true};}};
  assert((await dispatchTransactionHandoffJob(client,job,config,sender)).status==='stale_job','Stale frozen claim must stop');
  assert((await dispatchTransactionHandoffJob(client,{...job,recipient_key:'person@example.test'},config,sender)).status==='suppressed','Test recipients must be suppressed');
  assert(sends===0 && freezeCalls===1,'No external send is allowed');
  assert(receipts[0].p_reason==='controlled_test_recipient','Suppression must be visible');
});
Deno.test('Matter preparation is independent from email and HTML input is escaped',async()=>{
  let sends=0;
  const client={rpc:async(name:string)=>{assert(name==='prepare_transaction_handoff_workspace','Preparation must use the persisted job');return {data:{prepared:false,reason:'attorney_firm_not_linked'}};}};
  const sender=async()=>{sends++;return {ok:true as const,status:200,data:{id:'provider-one'}};};
  const result=await dispatchTransactionHandoffJob(client,{...job,channel:'workspace'},config,sender);
  assert(result.status==='retry' && sends===0,'Matter repair failures must not send email');
  const payload=buildTransactionHandoffEmail({...job,context:{...job.context,organisationName:'<script>alert(1)</script>'}},config);
  assert(!payload.html.includes('<script>') && payload.html.includes('&lt;script&gt;'),'Untrusted names must be escaped');
});
Deno.test('Malformed successful provider response is never recorded as sent',async()=>{
  const receipts:any[]=[];
  const client={rpc:async(name:string,args:any)=> name==='freeze_transaction_handoff_email' ? {data:args.p_payload} : (receipts.push(args),{data:true})};
  await dispatchTransactionHandoffJob(client,job,config,async()=>({ok:true as const,status:200,data:{}}));
  assert(receipts[0].p_status==='failed','An HTTP 200 without an email identity is insufficient');
});
