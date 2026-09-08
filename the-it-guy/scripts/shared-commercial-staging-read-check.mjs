// Read-only staging verification. No tokens, credentials or document data are logged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'
import { buildSharedHighLevelJourney } from '../src/core/transactions/highLevelJourneyAdapter.js'
const env = Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => { const i=line.indexOf('=');
    return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }))
const url=env.VITE_SUPABASE_URL
assert.equal(url,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const options={ auth:{ persistSession:false,autoRefreshToken:false } }
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,options)
const anon=createClient(url,env.SUPABASE_ANON_KEY,options)
const attorney=createClient(url,env.SUPABASE_ANON_KEY,options)
const login=await attorney.auth.signInWithPassword({email:'attorney.demo@arch9.co.za',password:env.ATTORNEY_DEMO_PASSWORD})
assert.ifError(login.error)
const matter='b27fc192-b5ff-471b-9da5-902409f78116'
const professional=await attorney.rpc('bridge_read_shared_matter_journey',{p_transaction_id:matter})
assert.ifError(professional.error)
assert.equal(professional.data.commercialFacts.version,1)
assert.equal(professional.data.commercialFacts.revision,professional.data.revision)
assert.ok((await anon.rpc('bridge_read_shared_matter_journey',{p_transaction_id:matter})).error,'Unauthenticated reader must be denied')
assert.ok((await anon.rpc('bridge_read_seller_shared_matter_journey',{p_token:'seller-invalid',p_access_token:'invalid'})).error,'Invalid seller session must be denied')
const links=await admin.from('client_portal_links').select('transaction_id,token').eq('is_active',true).limit(20)
assert.ifError(links.error)
let verified=0
for(const link of links.data || []) {
  if(!link.transaction_id || !link.token) continue
  const buyer=createClient(url,env.SUPABASE_ANON_KEY,{...options,global:{headers:{'x-bridge-client-portal-token':link.token}}})
  const read=await buyer.rpc('bridge_read_shared_matter_journey',{p_transaction_id:link.transaction_id})
  if(read.error) continue // Expired/revoked links are not usable test sessions.
  assert.equal(read.data.transactionId,link.transaction_id)
  assert.equal(read.data.commercialFacts.version,1)
  const model=buildSharedHighLevelJourney({transactionId:link.transaction_id,legalJourney:{status:'ready',snapshot:projectSharedMatterJourneyRead(read.data)}})
  assert.equal(model.milestones.length,5)
  assert.ok((await buyer.rpc('bridge_read_shared_matter_journey',{p_transaction_id:link.transaction_id===matter?'00000000-0000-0000-0000-000000000000':matter})).error,'Portal must not read another matter')
  verified++; break
}
assert.ok(verified,'No usable existing staging buyer session found')
console.log(JSON.stringify({environment:'staging',attorneyRead:'passed',buyerRead:'passed',unauthenticatedDenied:true,otherMatterDenied:true,invalidSellerSessionDenied:true,validSellerSession:'not_verified',writes:0}))
