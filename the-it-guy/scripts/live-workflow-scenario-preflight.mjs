// Read-only live acceptance preflight. No task/plan writes or outbound messages.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
const env = Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{
  const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]
}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_KEY']) process.env[key]=env[key]
const cases = [
  ['cash-individual','fe3bab8b-11f7-42e0-99a6-7833cd12a8ef'],
  ['bond-individual','b27fc192-b5ff-471b-9da5-902409f78116'],
  ['hybrid-company','15e8a126-c0f6-4083-b8de-964af1160944'],
  ['cash-trust-cancellation','8d01d55e-2f0a-44fc-8404-2bac0c885ae4'],
  ['cash-company','1a50def3-bbb9-48c7-bbe3-dc2c7a0bd7b3'],
  ['bond-individual-cancellation','80b452c8-3d5f-4597-9da7-0cdef47540e1'],
]
const server=await createServer({configFile:false,envFile:false,logLevel:'silent',server:{middlewareMode:true}})
try {
  const {supabase}=await server.ssrLoadModule('/src/lib/supabaseClient.js')
  const login=await supabase.auth.signInWithPassword({email:'attorney.demo@arch9.co.za',password:env.ATTORNEY_DEMO_PASSWORD})
  if(login.error) throw login.error
  const {getAttorneyWorkflowOperationsForTransaction}=await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const {fetchSharedMatterJourney}=await server.ssrLoadModule('/src/services/sharedMatterJourneyReader.js')
  const results=[]
  for(const [scenario,id] of cases) {
    try {
      const tx=await supabase.from('transactions').select('id,is_demo_data,routing_profile_json').eq('id',id).single()
      if(tx.error)throw tx.error
      assert.equal(tx.data.is_demo_data,true)
      const shared=await fetchSharedMatterJourney(supabase,id,{audience:'attorney'})
      assert.equal(shared.status,'ready','Shared journey unavailable')
      const work=await getAttorneyWorkflowOperationsForTransaction(id,{initialize:false})
      for(const lane of work.lanes) {
        const tasks=shared.snapshot.lanes.find(l=>l.key===lane.laneKey)?.phases.flatMap(p=>p.tasks)||[]
        assert.deepEqual(lane.steps.map(s=>[s.stepKey,s.status]).sort(),tasks.map(t=>[t.key,t.status]).sort(),'Work/journey task mismatch')
      }
      const activePlan=tx.data.routing_profile_json?.workflowPlan?.status==='active'
      results.push({scenario,read:'PASS',activePlan,lanes:work.lanes.map(l=>l.laneKey),mutationAcceptance:activePlan?'NOT_RUN':'BLOCKED_MISSING_ACTIVE_PLAN'})
    }catch(error){results.push({scenario,read:'FAIL',error:error.message})}
  }
  console.log(JSON.stringify({results,productionChanges:0,taskWrites:0},null,2))
  if(results.some(r=>r.read!=='PASS'||!r.activePlan))process.exitCode=1
}finally{await server.close();process.exit(process.exitCode||0)}
