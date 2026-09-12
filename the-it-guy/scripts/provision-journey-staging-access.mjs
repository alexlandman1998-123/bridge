// Explicitly authorised staging test access. Never sends mail or logs tokens.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
assert.ok(process.argv.includes('--apply'),'Explicit --apply required')
const matter=process.argv.find(arg=>arg.startsWith('--matter='))?.slice(9)||'b27fc192-b5ff-471b-9da5-902409f78116', fixture='journey-cross-role-staging-v1'
const reopenOnly=process.argv.includes('--retest-attorney-reopen')
const bondCancellationOnly=process.argv.includes('--bond-cancellation')
const cancellationOnly=process.argv.includes('--cancellation-only')
if(bondCancellationOnly || cancellationOnly) {
  assert.equal(matter,'80b452c8-3d5f-4597-9da7-0cdef47540e1','Bond/cancellation acceptance is restricted to the sixth staging fixture')
  assert.ok(process.argv.includes('--browser'),'Bond/cancellation acceptance requires browser verification')
  assert.ok(!reopenOnly,'Choose one targeted test mode')
}
if(reopenOnly) {
  assert.equal(matter,'80b452c8-3d5f-4597-9da7-0cdef47540e1','Reopen retest is restricted to the sixth staging fixture')
  assert.ok(process.argv.includes('--browser'),'Reopen acceptance requires browser verification')
}
assert.ok(['fe3bab8b-11f7-42e0-99a6-7833cd12a8ef','b27fc192-b5ff-471b-9da5-902409f78116','15e8a126-c0f6-4083-b8de-964af1160944','8d01d55e-2f0a-44fc-8404-2bac0c885ae4','1a50def3-bbb9-48c7-bbe3-dc2c7a0bd7b3','80b452c8-3d5f-4597-9da7-0cdef47540e1'].includes(matter),'Only the six approved staging fixtures')
const options={auth:{persistSession:false,autoRefreshToken:false}}
const anonKey=env.VITE_SUPABASE_ANON_KEY||env.SUPABASE_ANON_KEY
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options)
const client=()=>createClient(env.VITE_SUPABASE_URL,anonKey,options)
const read=async q=>{
  const run=async()=>{const r=await q;if(r.error) throw Object.assign(new Error(r.error.message), {code:r.error.code});return r.data}
  // Re-execute GET builders only. Writes need explicit command idempotency.
  return q?.method==='GET' ? retryTransient(run) : run()
}
const retryTransient=async operation=>{
  for(let attempt=0;attempt<3;attempt++) {
    try {return await operation()} catch(error) {
      const transient=['57014','08006','08001','53300'].includes(error.code)||(!error.code&&/fetch failed|failed to fetch|network|timeout/i.test(error.message))
      if(!transient||attempt===2)throw error
      // Acceptance uses the same command identity on a retry. This mirrors the
      // browser client and proves a momentarily saturated staging reader cannot
      // turn one intended task action into a duplicate workflow transition.
      await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)))
    }
  }
}
const tx=await read(admin.from('transactions').select('id,is_demo_data,listing_id,organisation_id').eq('id',matter).single())
assert.equal(tx.is_demo_data,true)
let listingId=tx.listing_id
if(!listingId){
  const existing=await read(admin.from('private_listings').select('id').contains('demo_metadata',{fixture,matter}).maybeSingle())
  listingId=existing?.id || (await read(admin.from('private_listings').insert({organisation_id:tx.organisation_id,is_demo_data:true,is_active:false,listing_visibility:'internal',demo_metadata:{fixture,matter}}).select('id').single())).id
  await read(admin.from('transactions').update({listing_id:listingId}).eq('id',matter).is('listing_id',null))
}
const listing=await read(admin.from('private_listings').select('is_demo_data,demo_metadata').eq('id',listingId).single())
assert.equal(listing.is_demo_data,true)
assert.equal(listing.demo_metadata.fixture,fixture,'Do not alter an unrelated seller portal')
let onboarding=await read(admin.from('private_listing_seller_onboarding').select('id,token,seller_portal_token,seller_portal_password_set_at').eq('private_listing_id',listingId).maybeSingle())
if(!onboarding) onboarding=await read(admin.from('private_listing_seller_onboarding').insert({private_listing_id:listingId,token:randomBytes(32).toString('hex'),token_expires_at:new Date(Date.now()+86400000).toISOString(),is_demo_data:true}).select('id,token,seller_portal_token,seller_portal_password_set_at').single())
const seller=client()
const sellerSession=await read(seller.rpc(onboarding.seller_portal_password_set_at?'bridge_verify_private_listing_seller_portal_password':'bridge_set_private_listing_seller_portal_password',{
  p_token:onboarding.seller_portal_password_set_at?onboarding.seller_portal_token:onboarding.token,p_password:env.ATTORNEY_DEMO_PASSWORD,
}))
assert.ok(sellerSession.accessToken,'Seller activation did not issue session')
let buyerLink=await read(admin.from('client_portal_links').select('id,token').eq('transaction_id',matter).eq('is_active',true).limit(1).maybeSingle())
if(!buyerLink) buyerLink=await read(admin.from('client_portal_links').insert({transaction_id:matter,token:randomBytes(32).toString('hex'),is_active:true}).select('id,token').single())
const buyer=createClient(env.VITE_SUPABASE_URL,anonKey,{...options,global:{headers:{'x-bridge-client-portal-token':buyerLink.token}}})
const actors={}
for(const role of ['agent','developer']){
  const email=`journey.${role}.staging@example.test`
  let profile=await read(admin.from('profiles').select('id').eq('email',email).maybeSingle())
  if(!profile){
    const auth=await admin.auth.admin.createUser({email,password:randomBytes(32).toString('base64url'),email_confirm:true,app_metadata:{fixture}})
    if(auth.error) throw new Error(auth.error.message)
    profile={id:auth.data.user.id}
    await read(admin.from('profiles').upsert({id:profile.id,email,role,full_name:`Journey ${role} staging`,onboarding_completed:true}))
  } else {
    const auth=await retryTransient(async()=>{
      const result=await admin.auth.admin.getUserById(profile.id)
      if(result.error)throw result.error
      return result
    })
    assert.equal(auth.data.user?.app_metadata?.fixture,fixture,'Unrelated account must not be modified')
  }
  const participant=await read(admin.from('transaction_participants').select('id,user_id,is_demo_data').eq('transaction_id',matter).eq('role_type',role).maybeSingle())
  if(participant && participant.user_id!==profile.id){
    assert.equal(participant.is_demo_data,true)
    assert.equal(participant.user_id,null,'Never replace an assigned person')
    await read(admin.from('transaction_participants').update({user_id:profile.id,status:'active'}).eq('id',participant.id).is('user_id',null))
  } else if(!participant) await read(admin.from('transaction_participants').insert({transaction_id:matter,user_id:profile.id,role_type:role,status:'active',can_view:true,can_comment:false,can_upload_documents:false,is_demo_data:true,scope_metadata:{fixture}}))
  const generated=await admin.auth.admin.generateLink({type:'magiclink',email})
  if(generated.error) throw new Error(generated.error.message)
  const actor=client(), login=await actor.auth.verifyOtp({type:'magiclink',token_hash:generated.data.properties.hashed_token})
  if(login.error) throw new Error(login.error.message)
  actors[role]=actor
}
const laneActors={}
for(const laneKey of ['transfer','bond','cancellation']) {
  const email=`${laneKey}.attorney.uat@arch9.co.za`
  const profile=await read(admin.from('profiles').select('id').eq('email',email).single())
  const user=await admin.auth.admin.getUserById(profile.id)
  assert.equal(user.data.user?.app_metadata?.arch9_uat_actor,true,'Only labelled UAT actors')
  const link=await admin.auth.admin.generateLink({type:'magiclink',email})
  if(link.error)throw link.error
  const actor=client()
  const login=await actor.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token})
  if(login.error)throw login.error
  laneActors[laneKey]=actor
}
const attorney=laneActors.transfer
// Use the same explicitly provisioned transfer-attorney UAT actor for browser
// acceptance as for the command and read checks. `attorney.demo` is a generic
// login that can enter onboarding rather than the assigned-firm workspace,
// which made a later reload test an account-setup test instead of a matter
// workflow test.
const browserAttorney=attorney
const snapshots={attorney:await read(attorney.rpc('bridge_read_professional_matter_journey',{p_transaction_id:matter}))}
for(const [role,actor] of Object.entries(actors)) snapshots[role]=await read(actor.rpc('bridge_read_professional_matter_journey',{p_transaction_id:matter}))
snapshots.buyer=await read(buyer.rpc('bridge_read_shared_matter_journey',{p_transaction_id:matter}))
snapshots.seller=await read(seller.rpc('bridge_read_seller_shared_matter_journey',{p_token:sellerSession.stablePortalToken||onboarding.seller_portal_token,p_access_token:sellerSession.accessToken}))
const outcomes=source=>{
  const s=projectSharedMatterJourneyRead(source,{audience:'buyer'})
  return {progress:s.legalProgress,lanes:s.lanes.map(l=>({lane:l.key,progress:l.progress,phases:l.phases.map(p=>({phase:p.key,progress:p.progress,statuses:p.tasks.map(t=>t.status)}))}))}
}
for(const [role,snapshot] of Object.entries(snapshots)){
  assert.equal(snapshot.transactionId,matter)
  assert.deepEqual(outcomes(snapshot),outcomes(snapshots.attorney),`${role} outcomes differ`)
}
assert.ok((await buyer.rpc('bridge_read_professional_matter_journey',{p_transaction_id:matter})).error)
console.log(JSON.stringify({environment:'staging',matter,roles:Object.keys(snapshots),sameMatterOutcomes:'PASS',buyerProfessionalAccess:'denied',invitationsSent:0,productionChanges:0}))
if(process.argv.includes('--browser-readonly')) {
  const browserCheck=await (await import('./workflow-browser-reload-check.mjs')).workflowBrowserReloadCheck({matter,readers:{attorney:browserAttorney,...actors,buyer,seller},buyerToken:buyerLink.token,sellerToken:sellerSession.stablePortalToken||onboarding.seller_portal_token,sellerSession})
  try {
    const task=snapshots.attorney.lanes.find(l=>l.key==='transfer').phases.flatMap(p=>p.tasks)[0]
    await browserCheck.check('transfer',task.key,task.status)
  }finally{await browserCheck.close()}
}
if(process.argv.includes('--verify-changes') || reopenOnly || bondCancellationOnly || cancellationOnly) {
  const readers={attorney, ...actors, buyer, seller}
  let browserCheck=process.argv.includes('--browser')&&!bondCancellationOnly&&!cancellationOnly?await (await import('./workflow-browser-reload-check.mjs')).workflowBrowserReloadCheck({matter,readers:{...readers,attorney:browserAttorney},buyerToken:buyerLink.token,sellerToken:sellerSession.stablePortalToken||onboarding.seller_portal_token,sellerSession}):null
  try {
  const sellerArgs={p_seller_token:sellerSession.stablePortalToken||onboarding.seller_portal_token,p_seller_session:sellerSession.accessToken}
  const safeMarker=`Staging shared verification ${randomUUID()}`, privateMarker=`Staging private verification ${randomUUID()}`
  for(const [body,audience] of (reopenOnly||bondCancellationOnly||cancellationOnly?[]:[[safeMarker,'everyone'],[privateMarker,'private']]))
    await read(attorney.rpc('bridge_post_matter_message',{p_transaction_id:matter,p_command_id:randomUUID(),p_body:body,p_audience:audience}))
  for(const [role,actor] of (reopenOnly||bondCancellationOnly||cancellationOnly?[]:Object.entries(readers))) {
    const conversation=await read(actor.rpc('bridge_read_matter_conversation',{p_transaction_id:matter,...(role==='seller'?sellerArgs:{})}))
    assert.ok(conversation.items.some(item=>item.body===safeMarker),`${role} missing shared note`)
    assert.equal(conversation.items.some(item=>item.body===privateMarker),role==='attorney',`${role} private note visibility`)
  }
  for (const plannedLane of snapshots.attorney.lanes) {
  const laneKey=plannedLane.key
  if(reopenOnly && laneKey!=='transfer')continue
  if((bondCancellationOnly || cancellationOnly) && !['bond','cancellation'].includes(laneKey))continue
  if(cancellationOnly && laneKey!=='cancellation')continue
  const operator=laneActors[laneKey]
  const stepKey=plannedLane.phases.flatMap(p=>p.tasks)[0].key
  const lane=await read(admin.from('transaction_subprocesses').select('id').eq('transaction_id',matter).eq('process_type',laneKey).single())
  const getStep=()=>retryTransient(()=>read(operator.from('transaction_subprocess_steps').select('id,status,updated_at,comment,visibility_scope').eq('subprocess_id',lane.id).eq('step_key',stepKey).single()))
  const original=await getStep()
  if(reopenOnly)assert.equal(original.status,'completed','Reopen test requires an originally completed task')
  const originalHistory=await read(admin.from('transaction_attorney_lane_history').select('*').eq('transaction_id',matter))
  let changed=false
  const change=async (status,restore=false)=>{
    const current=await getStep()
    const args={p_transaction_id:matter,p_lane_key:laneKey,p_step_id:current.id,p_status:status,p_command_id:randomUUID(),p_expected_step_updated_at:current.updated_at,p_note:restore?(original.comment||''):'STAGING ACCEPTANCE ONLY: completion, N/A and reopen verification; original outcome restored afterwards.',p_visibility:restore?(original.visibility_scope||'internal'):'internal',p_work_packet:null}
    return retryTransient(()=>read(operator.rpc('bridge_update_attorney_workflow_step_v4',args)))
  }
  try {
    if(bondCancellationOnly || cancellationOnly) {
      browserCheck=await (await import('./workflow-browser-reload-check.mjs')).workflowBrowserReloadCheck({matter,readers:{...readers,attorney:operator},buyerToken:buyerLink.token,sellerToken:sellerSession.stablePortalToken||onboarding.seller_portal_token,sellerSession,reportPath:`test-results/${laneKey}-acceptance.json`})
      changed=true
      await change('not_started')
    }
    for(const status of (reopenOnly?['not_started']:['completed','not_applicable','not_started'])) {
      changed=true
      const committed=await change(status)
      let baseline
      for(const [role,actor] of Object.entries(readers)) {
        const snapshot=await read(actor.rpc(role==='seller'?'bridge_read_seller_shared_matter_journey':role==='buyer'?'bridge_read_shared_matter_journey':'bridge_read_professional_matter_journey',role==='seller'?{p_token:sellerArgs.p_seller_token,p_access_token:sellerArgs.p_seller_session}:{p_transaction_id:matter}))
        if(role==='attorney') {
          baseline=outcomes(snapshot)
          assert.equal(snapshot.lanes.find(l=>l.key===laneKey).phases.flatMap(p=>p.tasks).find(t=>t.key===stepKey).status,status)
        } else assert.deepEqual(outcomes(snapshot),baseline,`${role} failed to follow ${status}`)
      }
      assert.equal((await getStep()).status,status)
      if(browserCheck)await browserCheck.check(laneKey,stepKey,status)
      console.log(JSON.stringify({matter,lane:laneKey,step:stepKey,status,fiveRoleFreshReads:'PASS',revision:committed.revision}))
    }
  } finally {
    if(changed)await change(original.status,true)
    const restored=await getStep()
    assert.equal(restored.status,original.status)
    assert.equal(restored.comment,original.comment)
    const afterHistory=await read(admin.from('transaction_attorney_lane_history').select('*').eq('transaction_id',matter))
    for(const row of originalHistory)assert.deepEqual(afterHistory.find(item=>item.id===row.id),row,'Historical audit record changed')
    console.log(JSON.stringify({matter,lane:laneKey,originalOutcomeRestored:true,historyPreserved:true}))
    if(bondCancellationOnly || cancellationOnly){await browserCheck?.close();browserCheck=null}
  }
  }
  console.log(JSON.stringify({matter,...(reopenOnly?{transferReopen:'PASS'}:cancellationOnly?{cancellationCompleteNaReopen:'PASS'}:bondCancellationOnly?{bondCancellationCompleteNaReopen:'PASS'}:{allLaneCompleteNaReopen:'PASS',sharedNotes:'PASS',privateNotesRestricted:'PASS'}),originalOutcomesRestored:true,historyPreserved:true,browserVerification:browserCheck?'PASS':'not_run',invitationsSent:0}))
  } finally {await browserCheck?.close()}
}
