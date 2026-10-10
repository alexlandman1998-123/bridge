import { dispatchRecruitmentSubmissions } from './handler.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
const job = { id: '33333333-3333-4333-8333-333333333333', organisation_id: '2958d402-368e-43c9-b728-0098e10505f1', lead_id: '22222222-2222-4222-8222-222222222222', actor_id: '44444444-4444-4444-8444-444444444444' };
Deno.test('submission dispatcher takes its applicant identity and reference only from the server queue', async () => {
  const calls: any[] = [], sends: any[] = [];
  const admin = { rpc: async (name: string, args: any) => { calls.push({ name, args }); return { data: name === 'recruitment_claim_submission_emails' ? [job] : true }; } };
  const deliver: any = async (_request: any, payload: any, dependencies: any) => { sends.push({ payload, dependencies }); return new Response(JSON.stringify({ ok: true, status: 'provider_accepted' })); };
  for (const authorization of ['', 'Bearer user-token', 'Bearer wrong-key']) assert((await dispatchRecruitmentSubmissions(new Request('https://worker.test', { method: 'POST', headers: { authorization } }), { key: 'server-only', admin, deliver })).status === 401);
  assert(calls.length === 0);
  const response = await dispatchRecruitmentSubmissions(new Request('https://worker.test', { method: 'POST', headers: { authorization: 'Bearer server-only' }, body: JSON.stringify({ leadId: 'forged', actor_id: 'forged' }) }), { key: 'server-only', admin, deliver });
  assert((await response.json()).accepted === 1);
  assert(sends[0].payload.kind === 'documents_reminder' && sends[0].payload.leadId === job.lead_id && sends[0].payload.requestId === job.id);
  assert(sends[0].dependencies.automationActor === job.actor_id && sends[0].dependencies.submissionAutomation === true);
});
Deno.test('submission dispatcher keeps failed, uncertain and suppressed deliveries out of accepted state', async () => {
  for (const outcome of [{ ok: false, status: 'unknown' }, { ok: false, suppressed: true }]) {
    const completions: any[] = [];
    const admin = { rpc: async (name: string, args: any) => { if (name === 'recruitment_complete_submission_email') completions.push(args); return { data: name === 'recruitment_claim_submission_emails' ? [job] : true }; } };
    const deliver: any = async () => new Response(JSON.stringify(outcome));
    const response = await dispatchRecruitmentSubmissions(new Request('https://worker.test', { method: 'POST', headers: { authorization: 'Bearer server-only' } }), { key: 'server-only', admin, deliver });
    assert((await response.json()).accepted === 0 && completions[0].p_accepted === false);
    assert(completions[0].p_error === ('suppressed' in outcome ? 'controlled_test_recipient' : 'dispatch_unconfirmed'));
  }
});
Deno.test('submission dispatcher selects applicant email kinds and completion leases from saved jobs, ignoring caller content',async()=>{
  const sends:any[]=[],completions:any[]=[];
  const jobs=['application_thanks','documents_reminder','documents_followup','contract_available'].map((email_kind,index)=>({...job,id:`00000000-0000-4000-8000-00000000000${index}`,email_kind,lease_id:`lease-${index}`}));
  const admin={rpc:async(name:string,args:any)=>{if(name==='recruitment_complete_submission_email')completions.push(args);return{data:name==='recruitment_claim_submission_emails'?jobs:true}}};
  const deliver:any=async(_req:any,payload:any)=>{sends.push(payload);return new Response(JSON.stringify({ok:true,status:'provider_accepted'}))};
  const result=await dispatchRecruitmentSubmissions(new Request('https://worker.test',{method:'POST',headers:{authorization:'Bearer server-only'},body:JSON.stringify({kind:'workspace',to:'attacker@test'})}),{key:'server-only',admin,deliver});
  assert((await result.json()).accepted===4);
  assert(sends.every((payload,index)=>payload.kind===jobs[index].email_kind&&payload.requestId===jobs[index].id));
  assert(completions.every((completion,index)=>completion.p_lease_id===jobs[index].lease_id));
});
