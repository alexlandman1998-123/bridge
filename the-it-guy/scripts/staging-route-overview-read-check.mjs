// Read-only staging acceptance: real application route reader, cold cache.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'
import { buildLegalOverviewSummary } from '../src/core/transactions/legalOverviewSummary.js'
const env = Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{ const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
for (const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_KEY']) process.env[key]=env[key]
const server=await createServer({configFile:false,envFile:false,logLevel:'silent',server:{middlewareMode:true}})
try {
  const {supabase}=await server.ssrLoadModule('/src/lib/supabaseClient.js')
  const api=await server.ssrLoadModule('/src/lib/api.js')
  const {fetchSharedMatterJourney}=await server.ssrLoadModule('/src/services/sharedMatterJourneyReader.js')
  const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const id='b27fc192-b5ff-471b-9da5-902409f78116'
  for(const role of ['agent','developer','attorney']) {
    if(role==='attorney') {
      const r=await supabase.auth.signInWithPassword({email:'attorney.demo@arch9.co.za',password:env.ATTORNEY_DEMO_PASSWORD});if(r.error) throw r.error
    } else {
      const r=await admin.auth.admin.generateLink({type:'magiclink',email:`journey.${role}.staging@example.test`});if(r.error) throw r.error
      const login=await supabase.auth.verifyOtp({type:'magiclink',token_hash:r.data.properties.hashed_token});if(login.error) throw login.error
    }
    const timings=[]
    for(let attempt=0;attempt<3;attempt++) {
      api.invalidateTransactionWorkspaceCoreCache(id)
      const start=Date.now(), core=await api.fetchTransactionRouteCoreById(id)
      assert.equal(core?.transaction?.id,id)
      assert.equal(core.__isRouteCore,true)
      timings.push(Date.now()-start)
    }
    const journey=await fetchSharedMatterJourney(supabase,id,{audience:role})
    const summary=buildLegalOverviewSummary(id,journey)
    assert.equal(summary?.title,'Review & Approve Buyer FICA')
    assert.equal(summary.stageLabel,'FICA & Authority')
    console.log(JSON.stringify({role,coldCoreMs:timings,summary:summary.title,status:'PASS'}))
    await supabase.auth.signOut({scope:'local'})
  }
} catch(error) { console.error(error.message);process.exitCode=1 }
finally {await server.close();process.exit(process.exitCode||0)}
