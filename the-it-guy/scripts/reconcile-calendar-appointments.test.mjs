import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateRepairTarget,validateRepairPlan,validateRepairApproval,planDigest,runCalendarReconciliation } from './reconcile-calendar-appointments.mjs'
const org='10000000-0000-4000-8000-000000000001', user='10000000-0000-4000-8000-000000000003', batch='10000000-0000-4000-8000-000000000040'
const projectRef='abcdefghijklmnopqrst', environment='staging', target={environment,projectRef,organisationId:org,url:`https://${projectRef}.supabase.co`}
const now=Date.parse('2026-10-08T15:00:00Z')
const plan={version:1,...target,capturedAt:'2026-10-08T14:00:00Z',batchId:batch,reviewedBy:user,reason:'Reviewed historical data',entries:[{selected:true,appointmentId:org,expectedFingerprint:'a'.repeat(32),action:'normalise_metadata',reason:'Known equivalent status',evidence:'Original request'}]}
const approval={approved:true,environment,projectRef,organisationId:org,reviewedBy:user,approvedAt:'2026-10-08T14:30:00Z',planSha256:planDigest(plan),recoveryReference:'Private repair batch and verified database recovery snapshot',reason:'User-approved reviewed repairs'}
test('target is explicit and bound to the actual Supabase origin',()=>{
 assert.deepEqual(validateRepairTarget(target),target)
 for(const changes of [{environment:undefined},{url:'https://other.supabase.co'},{url:target.url+'/path'},{url:target.url+'?token=secret'},{url:'http://'+projectRef+'.supabase.co'},{url:'https://user:password@'+projectRef+'.supabase.co'},{organisationId:'all'},{environment:'production'},{projectRef:'isdowlnollckzvltkasn',url:'https://isdowlnollckzvltkasn.supabase.co'}]) assert.throws(()=>validateRepairTarget({...target,...changes}))
 assert.equal(validateRepairTarget({...target,environment:'local',projectRef:'local',url:'http://127.0.0.1:54321'}).environment,'local')
 assert.throws(()=>validateRepairTarget({...target,environment:'local',projectRef:'local'}))
})
test('selected repair needs exact scope, fresh snapshot, explicit evidence and a supported action',()=>{
 assert.equal(validateRepairPlan(plan,target,{now}).length,1)
 for(const changes of [{capturedAt:'2020-01-01'},{capturedAt:'2026-10-08T14:00:00'},{capturedAt:'2026-10-09T00:00:00Z'},{organisationId:user},{projectRef:'another'},{entries:[{...plan.entries[0],selected:false}]},{entries:[{...plan.entries[0],evidence:''}]},{entries:[{...plan.entries[0],action:'complete'}]},{entries:[{...plan.entries[0],rsvp_token:'secret'}]},{entries:[plan.entries[0],plan.entries[0]]}]) assert.throws(()=>validateRepairPlan({...plan,...changes},target,{now}))
})
test('approval binds the reviewed plan, target, reviewer, recovery evidence and time',()=>{
 validateRepairApproval(approval,plan,target,{now})
 for(const changes of [{approved:false},{environment:'production'},{projectRef:'other'},{reviewedBy:org},{approvedAt:'2020-01-01'},{approvedAt:'2026-10-08T14:30:00'},{approvedAt:'2026-10-09T00:00:00Z'},{planSha256:'bad'},{recoveryReference:''}]) assert.throws(()=>validateRepairApproval({...approval,...changes},plan,target,{now}))
 assert.throws(()=>validateRepairApproval(approval,{...plan,reason:'Changed after review'},target,{now}))
})
test('readonly legacy inventory report needs no credentials and refuses an apply flag',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'calendar-repair-'))
 try {
  const input=join(dir,'input.json'),output=join(dir,'report.md')
  await writeFile(input,JSON.stringify([{appointment_id:org,status:'requested',appointment_date:'2020-01-01',start_time:'10:00',end_time:'11:00',date_time:'2020-01-01 08:00:00+00',timezone:'Africa/Johannesburg',participants:2}]))
  const fetcher=()=>{throw new Error('Report must never call the network')}
  assert.match(await runCalendarReconciliation(['report','--input',input,'--output',output,'--as-of','2026-10-08T15:00:00Z'],{fetcher}),/Read-only/)
  assert.match(await readFile(output,'utf8'),/PAST_OUTCOME_UNRESOLVED/)
  await assert.rejects(runCalendarReconciliation(['report','--input',input,'--output',join(dir,'other.md'),'--as-of','2026-10-08T15:00:00Z','--apply'],{fetcher}),/cannot apply/)
 } finally {await rm(dir,{recursive:true,force:true})}
})
test('apply without both explicit flag and exact approval never calls the server',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'calendar-repair-'))
 try {
  const path=join(dir,'plan.json');await writeFile(path,JSON.stringify({...plan,capturedAt:new Date().toISOString()}))
  const args=['apply','--plan',path,'--output',join(dir,'receipt.json'),'--environment',environment,'--project-ref',projectRef,'--organisation',org,'--url',target.url]
  const fetcher=()=>{throw new Error('Unapproved operation called the network')}
  await assert.rejects(runCalendarReconciliation(args,{fetcher}),/both apply/)
  await assert.rejects(runCalendarReconciliation([...args,'--apply'],{fetcher}),/Input file/)
 } finally {await rm(dir,{recursive:true,force:true})}
})

test('preview sends only reviewed entries and always requires a rolled-back receipt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'calendar-repair-'));const previous=process.env.SUPABASE_SERVICE_ROLE_KEY
 process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only-server-key'
 try {
  const path=join(dir,'plan.json'),output=join(dir,'preview.json');await writeFile(path,JSON.stringify({...plan,capturedAt:new Date().toISOString()}))
  let calls=0
  const fetcher=async(url,options)=>{
   calls++;assert.equal(url,target.url+'/rest/v1/rpc/repair_calendar_appointments')
   const args=JSON.parse(options.body);assert.equal(args.p_preview,true);assert.equal(args.p_entries[0].selected,undefined)
   return {ok:true,json:async()=>({verified:true,preview:true,batchId:batch,organisationId:org,entries:[]})}
  }
  const args=['preview','--plan',path,'--output',output,'--environment',environment,'--project-ref',projectRef,'--organisation',org,'--url',target.url]
  assert.match(await runCalendarReconciliation(args,{fetcher}),/Previewed/);assert.equal(calls,1)
  assert.equal(JSON.parse(await readFile(output,'utf8')).preview,true)
  await assert.rejects(runCalendarReconciliation(args,{fetcher}),/new output/);assert.equal(calls,1)
  assert.ok(!(await readFile(output,'utf8')).includes('fixture-only-server-key'))
 } finally {if(previous===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;await rm(dir,{recursive:true,force:true})}
})
