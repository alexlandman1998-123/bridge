import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchSellerSharedMatterJourney } from '../src/services/sharedMatterJourneyReader.js'

for (const code of ['57014','08006','53300']) {
  let calls=0
  const result=await fetchSellerSharedMatterJourney({rpc:async()=>++calls===1?{error:{code,message:'transient'}}:{data:null}},'seller-test','session')
  assert.equal(calls,2); assert.equal(result,null)
}
for (const code of ['42501','PGRST301','22023']) {
  let calls=0
  await assert.rejects(fetchSellerSharedMatterJourney({rpc:async()=>{calls++;return {error:{code,message:'denied'}}}},'seller-test','session'))
  assert.equal(calls,1,'Denied or invalid access must not be retried')
}
let calls=0
await assert.rejects(fetchSellerSharedMatterJourney({rpc:async()=>{calls++;return {error:{code:'57014',message:'timeout'}}}},'seller-test','session'))
assert.equal(calls,2,'Persistent failure must remain bounded')
const page=readFileSync('src/pages/ClientPortal.jsx','utf8')
assert.doesNotMatch(page,/isClientPortalLoadTimeoutError\(coreError\)\)\s*\{\s*requireSellerReauthentication/)
assert.match(page,/isSellerPortalAuthRequiredError\(coreError\)/)
console.log('PASS: transient seller read recovery, bounded failures, denied access and timeout/session separation')
