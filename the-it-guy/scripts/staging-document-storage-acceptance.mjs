// Temporary, clearly labelled fixture. Never overwrites existing documents.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const options={auth:{persistSession:false,autoRefreshToken:false}}
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options)
const client=(headers={})=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{...options,global:{headers}})
const read=async query=>{const r=await query;if(r.error)throw new Error(`${r.error.code}: ${r.error.message}`);return r.data}
const matter='b27fc192-b5ff-471b-9da5-902409f78116'
const marker=randomUUID(), path=`transaction-${matter}/storage-acceptance-${marker}.txt`
const bytes=`ARCH9 STAGING TEST ONLY. Not legal evidence. ${marker}`
let uploaded=false,documentId=null
try {
  assert.equal((await read(admin.from('transactions').select('is_demo_data').eq('id',matter).single())).is_demo_data,true)
  const attorney=client()
  const login=await attorney.auth.signInWithPassword({email:'attorney.demo@arch9.co.za',password:env.ATTORNEY_DEMO_PASSWORD});if(login.error)throw login.error
  await read(attorney.storage.from('documents').upload(path,bytes,{contentType:'text/plain',upsert:false}));uploaded=true
  const doc=await read(attorney.from('documents').insert({transaction_id:matter,name:'STAGING STORAGE ACCEPTANCE — NOT LEGAL EVIDENCE',file_name:`storage-acceptance-${marker}.txt`,file_path:path,file_bucket:'documents',visibility_scope:'internal',is_client_visible:false,is_demo_data:true,status:'uploaded',lane_key:'transfer',attorney_role:'transfer_attorney',uploaded_by_user_id:login.data.user.id,metadata:{fixture:'document-storage-acceptance',marker}}).select('id').single());documentId=doc.id
  const actors={attorney,anonymous:client()}
  for(const role of ['agent','developer']) {
    const link=await admin.auth.admin.generateLink({type:'magiclink',email:`journey.${role}.staging@example.test`});if(link.error)throw link.error
    const actor=client(),r=await actor.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});if(r.error)throw r.error
    actors[role]=actor
  }
  const portal=await read(admin.from('client_portal_links').select('token').eq('transaction_id',matter).eq('is_active',true).limit(1).single())
  actors.buyer=client({'x-bridge-client-portal-token':portal.token})
  const tx=await read(admin.from('transactions').select('listing_id').eq('id',matter).single())
  const onboarding=await read(admin.from('private_listing_seller_onboarding').select('seller_portal_token').eq('private_listing_id',tx.listing_id).single())
  const session=await read(client().rpc('bridge_verify_private_listing_seller_portal_password',{p_token:onboarding.seller_portal_token,p_password:env.ATTORNEY_DEMO_PASSWORD}))
  assert.ok(session.accessToken,'Existing staging seller session required')
  actors.seller=client({'x-bridge-seller-portal-token':session.stablePortalToken||onboarding.seller_portal_token,'x-bridge-seller-portal-access-token':session.accessToken})
  actors.invalidBuyer=client({'x-bridge-client-portal-token':randomUUID()})
  actors.invalidSeller=client({'x-bridge-seller-portal-token':onboarding.seller_portal_token,'x-bridge-seller-portal-access-token':randomUUID()})
  const results=[]
  const cases=[
    {scope:'internal',recipient:null,expected:['attorney']},
    {scope:'internal',recipient:null,clientVisible:true,expected:['attorney']},
    {scope:'shared',recipient:null,expected:['attorney','agent','developer']},
    {scope:'shared',recipient:null,clientVisible:true,expected:['attorney','agent','developer','buyer','seller']},
    {scope:'client',recipient:'buyer',expected:['attorney','agent','developer','buyer']},
    {scope:'client',recipient:'seller',expected:['attorney','agent','developer','seller']},
  ]
  for(const test of cases) {
    console.log('Checking audience', test.scope, test.recipient || 'all', Boolean(test.clientVisible))
    await read(attorney.from('documents').update({visibility_scope:test.scope,client_recipient_role:test.recipient,is_client_visible:test.clientVisible||false}).eq('id',doc.id).select('id').single())
    for(const [role,actor] of Object.entries(actors)) {
    const visible=await actor.from('documents').select('id').eq('id',doc.id)
    if(visible.error)throw visible.error
    const signed=await actor.storage.from('documents').createSignedUrl(path,60)
    let downloaded=false
    if(signed.data?.signedUrl){const response=await fetch(signed.data.signedUrl);downloaded=response.ok && await response.text()===bytes}
    const expected=test.expected.includes(role)
    results.push({role,scope:test.scope,recipient:test.recipient,clientVisible:test.clientVisible||false,metadata:!!visible.data?.length,file:downloaded,expected})
    }
  }
  for(const role of ['agent','developer','buyer','seller','anonymous']) {
    const forbidden=`transaction-${matter}/storage-acceptance-denied-${marker}-${role}.txt`
    const attempt=await actors[role].storage.from('documents').upload(forbidden,bytes,{contentType:'text/plain'})
    if(!attempt.error) await read(admin.storage.from('documents').remove([forbidden]))
    assert.ok(attempt.error,`${role} incorrectly allowed to upload without capability`)
    const edit=await actors[role].from('documents').update({name:'UNAUTHORISED EDIT'}).eq('id',doc.id).select('id')
    assert.ok(edit.error||!edit.data?.length,`${role} incorrectly allowed to change document`)
  }
  console.log(JSON.stringify({fixture:'temporary labelled test document',results}))
  assert.ok(results.every(r=>r.metadata===r.expected&&r.file===r.expected),'Document/storage audience mismatch')
  for(const [role,uploadPath] of [['buyer',`client-portal/${matter}/storage-acceptance-${marker}.txt`],['seller',`seller-portal/${tx.listing_id}/storage-acceptance-${marker}.txt`]]) {
    let saved=false
    try {
      await read(actors[role].storage.from('documents').upload(uploadPath,bytes,{contentType:'text/plain'}));saved=true
      const url=await read(actors[role].storage.from('documents').createSignedUrl(uploadPath,60))
      assert.equal(await (await fetch(url.signedUrl)).text(),bytes,`${role} own upload cannot be read`)
    } finally {if(saved)await read(admin.storage.from('documents').remove([uploadPath]))}
  }
  const snapshots={}
  for(const role of ['attorney','agent','developer']) snapshots[role]=await read(actors[role].rpc('bridge_read_professional_matter_journey',{p_transaction_id:matter}))
  snapshots.buyer=await read(actors.buyer.rpc('bridge_read_shared_matter_journey',{p_transaction_id:matter}))
  snapshots.seller=await read(actors.seller.rpc('bridge_read_seller_shared_matter_journey',{p_token:session.stablePortalToken||onboarding.seller_portal_token,p_access_token:session.accessToken}))
  const outcomes=s=>s.lanes.map(l=>({lane:l.key,phases:l.phases.map(p=>({phase:p.key,statuses:p.tasks.map(t=>t.status)}))}))
  for(const snapshot of Object.values(snapshots))assert.deepEqual(outcomes(snapshot),outcomes(snapshots.attorney))
  console.log(JSON.stringify({fiveRoleJourneyParity:'PASS',audienceChecks:results.length,unauthorisedUploadAndEdit:'DENIED'}))
} catch(error){console.error(error.message);process.exitCode=1}
finally {
  if(documentId)await read(admin.from('documents').delete().eq('id',documentId).eq('file_path',path))
  if(uploaded)await read(admin.storage.from('documents').remove([path]))
  console.log(JSON.stringify({temporaryDocumentRemoved:!!documentId,temporaryObjectRemoved:uploaded,productionChanges:0}))
}
