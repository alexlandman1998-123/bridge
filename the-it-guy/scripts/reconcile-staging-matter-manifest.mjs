import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { previewLegacyMatterReconciliation } from '../src/services/attorneyWorkflow/legacyMatterReconciliation.js'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{
  const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]
}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co','Staging only')
const id=process.argv.find(arg=>arg.startsWith('--matter='))?.slice(9)
assert.match(id || '',/^[a-f0-9-]{36}$/,'Explicit --matter UUID required')
const client=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const read=async query=>{const {data,error}=await query;if(error) throw error;return data}
const transaction=await read(client.from('transactions').select('*').eq('id',id).single())
assert.equal(transaction.is_demo_data,true,'Only explicitly labelled staging demo matters may be reconciled by this harness')
const lanes=await read(client.from('transaction_subprocesses').select('id,process_type').eq('transaction_id',id).in('process_type',['transfer','bond','cancellation']))
const rows=await read(client.from('transaction_subprocess_steps').select('*').in('subprocess_id',lanes.map(l=>l.id)))
const preview=previewLegacyMatterReconciliation(resolveTransactionRoutingProfile({transaction}),lanes.map(l=>({laneKey:l.process_type,steps:rows.filter(r=>r.subprocess_id===l.id)})))
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'preview',matter:id,lanes:preview.plan.lanes.map(l=>({lane:l.laneKey,tasks:l.taskCount})),retainedForReview:preview.review.length,provisional:preview.plan.provisional}))
if(process.argv.includes('--apply')) {
  console.log(await read(client.rpc('bridge_reconcile_legacy_task_manifest',{p_transaction_id:id,p_expected_profile:transaction.routing_profile_json||{},p_plan:preview.plan,p_review:preview.review})))
  const after=await read(client.from('transaction_subprocess_steps').select('*').in('subprocess_id',lanes.map(l=>l.id)))
  for(const row of rows) assert.deepEqual(after.find(item=>item.id===row.id),row,'Historical task changed')
  const saved=await read(client.from('transactions').select('routing_profile_json').eq('id',id).single())
  assert.deepEqual(saved.routing_profile_json.workflowPlan,preview.plan)
  console.log('PASS: persisted manifest matches preview; all previous task rows unchanged')
}
