import { dispatchRecruitmentApprovals } from './handler.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
const job = { id: '33333333-3333-4333-8333-333333333333', organisation_id: '11111111-1111-4111-8111-111111111111', lead_id: '22222222-2222-4222-8222-222222222222', actor_id: '44444444-4444-4444-8444-444444444444' };
Deno.test('approval dispatcher admits only the scheduler service identity and takes jobs from the database', async () => {
  const calls: any[] = [], sends: any[] = [];
  const admin = { rpc: async (name: string, args: any) => { calls.push({name,args}); return {data: name === 'recruitment_claim_approval_emails' ? [job] : true}; } };
  const deliver: any = async (_request: any, payload: any, dependencies: any) => { sends.push({payload, actor: dependencies.automationActor}); return new Response(JSON.stringify({ok:true,status:'provider_accepted'})); };
  for (const authorization of ['', 'Bearer signed-user', 'Bearer wrong-service-key']) {
    const result = await dispatchRecruitmentApprovals(new Request('https://worker.test', {method:'POST',headers:{authorization}}), {key:'server-only-key',admin,deliver});
    assert(result.status === 401);
  }
  assert(calls.length === 0 && sends.length === 0);
  const result = await dispatchRecruitmentApprovals(new Request('https://worker.test', {method:'POST',headers:{authorization:'Bearer server-only-key'},body:JSON.stringify({leadId:'forged',actor:'forged'})}), {key:'server-only-key',admin,deliver});
  assert(result.status === 200);
  assert((await result.json()).accepted === 1);
  assert(sends[0].actor === job.actor_id && sends[0].payload.leadId === job.lead_id && sends[0].payload.requestId === job.id);
  assert(calls[1].name === 'recruitment_complete_approval_email' && calls[1].args.p_accepted === true);
});
Deno.test('approval dispatcher retains uncertain or suppressed results without claiming provider acceptance', async () => {
  for (const outcome of [{ok:false,status:'unknown'},{ok:false,suppressed:true}]) {
    const completions: any[] = [];
    const admin = {rpc:async(name:string,args:any)=>{if(name==='recruitment_complete_approval_email') completions.push(args);return {data:name==='recruitment_claim_approval_emails'?[job]:true};}};
    const deliver:any=async()=>new Response(JSON.stringify(outcome));
    const response=await dispatchRecruitmentApprovals(new Request('https://worker.test',{method:'POST',headers:{authorization:'Bearer server-only-key'}}),{key:'server-only-key',admin,deliver});
    assert((await response.json()).accepted===0);
    assert(completions[0].p_accepted===false);
    assert(completions[0].p_error===('suppressed' in outcome?'controlled_test_recipient':'dispatch_unconfirmed'));
  }
});
