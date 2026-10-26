import { transactionBuyerCaptureFixture } from './fixtures/transaction-buyer-capture-database.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { actor, agentA, outsider, uuid } from './fixtures/seller-alignment-database.mjs'
const {db,tx,bid,pid}=await transactionBuyerCaptureFixture()
const read = async (participant = null) => (await db.query('select bridge_get_transaction_buyer_capture($1,$2) result', [tx, participant])).rows[0].result
const save = async (context, buyer, profile, mutation = uuid(901)) => (await db.query('select bridge_save_transaction_buyer_capture($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6) result', [tx, context.participantId, JSON.stringify(context.revision), JSON.stringify(buyer), JSON.stringify(profile), mutation])).rows[0].result
const portal = async (participant = null, buyer = null, nonce = null) => (await db.query('select bridge_get_buyer_onboarding_capture($1,$2,$3) result', [participant,buyer,nonce])).rows[0].result
const online = async form => (await db.query("select bridge_save_buyer_onboarding_snapshot($1::jsonb,'{}','[]',false,null) result", [JSON.stringify(form)])).rows[0].result
await actor(db,'authenticated',agentA)
let c = await read()
assert.equal(c.buyerId,bid)
assert.equal(c.participantId,null)
assert.equal((await db.query('select count(*)::int n from transaction_participants where transaction_role=$1',['buyer'])).rows[0].n,0,'read never creates or links')
const originalForm=(await db.query('select form_data from onboarding_form_data where transaction_id=$1',[tx])).rows[0].form_data
let receipt=await save(c,{name:'Jamie Buyer',email:'buyer@example.test',phone:'0802'},{first_name:'Jamie',last_name:'Buyer',identity_number:'draft-id',purchaser_type:'individual',buyer_fica_declaration:{signed:true},seller_name:'ATTACK'})
assert.equal(receipt.buyerId,bid)
assert.ok(receipt.participantId)
let f=(await db.query('select form_data from onboarding_form_data where transaction_id=$1',[tx])).rows[0].form_data
assert.deepEqual(f.__bridge_transaction_parties,originalForm.__bridge_transaction_parties)
assert.equal(f.identity_number,'draft-id')
assert.equal(f.buyer_fica_declaration,undefined)
assert.equal(f.seller_name,undefined)
assert.equal(f.purchasers[0].identity_number,'draft-id')
assert.equal((await db.query('select onboarding_status,current_main_stage from transactions where id=$1',[tx])).rows[0].onboarding_status,'historical')
assert.deepEqual(await save(c,{name:'Jamie Buyer',email:'buyer@example.test',phone:'0802'},{first_name:'Jamie',last_name:'Buyer',identity_number:'draft-id',purchaser_type:'individual',buyer_fica_declaration:{signed:true},seller_name:'ATTACK'}),receipt,'exact receipt retry does not duplicate buyer/participant')
await assert.rejects(()=>save(c,c.buyer,{identity_number:'stale'},uuid(902)),/changed/)
console.log('ok - atomic draft, exact known buyer link, no stage reset, seller preservation, excluded signatures, idempotent retry and stale agent save')
await actor(db,'anon')
await db.query("select set_config('request.onboarding_token','test-link',false)")
let capture=await portal(receipt.participantId,bid)
assert.equal(capture.profile.identity_number,'draft-id')
await assert.rejects(()=>portal(receipt.participantId,uuid(999)),/identifiers/)
let result=await online({...capture.profile,first_name:'Buyer Updated',last_name:'Name',email:'updated@example.test',phone:'0803',buyerParticipantId:receipt.participantId,buyerPartyId:bid,__bridge_buyer_capture_revision:capture.revision,__bridge_transaction_parties:{seller:{name:'ATTACK'}},__bridge_forged_complete:true})
assert.equal(result.onboarding.token,undefined)
await assert.rejects(()=>online({...capture.profile,buyerParticipantId:receipt.participantId,buyerPartyId:bid,__bridge_buyer_capture_revision:capture.revision}),/changed/)
await actor(db,'authenticated',agentA)
c=await read(receipt.participantId)
assert.equal(c.buyer.name,'Buyer Updated Name')
assert.equal(c.buyer.email,'updated@example.test')
assert.equal(c.profile.first_name,'Buyer Updated')
const addressDraft=await save(c,c.buyer,{...c.profile,residential_address:'New manual address',street_address:'Old online address'},uuid(909))
assert.equal(addressDraft.profile.purchasers[0].street_address,'New manual address')
assert.equal(addressDraft.profile.street_address,'New manual address')

f=(await db.query('select form_data from onboarding_form_data where transaction_id=$1',[tx])).rows[0].form_data
assert.deepEqual(f.__bridge_transaction_parties,originalForm.__bridge_transaction_parties)
assert.equal(f.__bridge_forged_complete,undefined)
console.log('ok - buyer link reads manual answers, buyer edits return to agent, exact target IDs, token fence, private seller preservation and stale buyer draft rejected')
await actor(db,'authenticated',outsider)
await assert.rejects(()=>read(),/not permitted/)
await assert.rejects(()=>save(c,c.buyer,{}),/not permitted/)
await actor(db,'anon')
await db.query("select set_config('request.onboarding_token','wrong-link',false)")
await assert.rejects(()=>portal(),/active buyer onboarding/)
await assert.rejects(()=>db.query('select buyer_capture_private.context($1)',[tx]),/permission denied/)
console.log('ok - unrelated agent, expired/invalid bearer and private helper access rejected')
await actor(db,'postgres')
const bid2=uuid(821),pid2=uuid(822)
await db.query("insert into buyers(id,organisation_id,name,email) values($1,$2,'Second','second@example.test')",[bid2,uuid(21)])
await db.query("insert into transaction_participants(id,transaction_id,transaction_role,role_type,legal_role,buyer_party_id,is_primary_buyer,participant_name,participant_email) values($1,$2,'buyer','buyer','none',$3,false,'Second','second@example.test')",[pid2,tx,bid2])
await db.query("update transaction_participants set buyer_metadata=jsonb_build_object('lastBuyerOnboardingLinkNonce','secondary-link-nonce') where id=$1",[pid2])
await actor(db,'authenticated',agentA)
c=await read(pid2)
assert.equal(c.profile.identity_number,undefined,'primary buyer answers never prefill secondary buyer')
receipt=await save(c,c.buyer,{identity_number:'secondary-id',purchaser_type:'individual'},uuid(903))
await actor(db,'anon')
await db.query("select set_config('request.onboarding_token','test-link',false)")
await assert.rejects(()=>portal(pid2,bid2),/expired or belongs/)
capture=await portal(pid2,bid2,'secondary-link-nonce')
assert.equal(capture.profile.identity_number,'secondary-id')
assert.equal(capture.profile.first_name,'Second')
console.log('ok - co-buyer manual capture and link hydration remain scoped by explicit participant/profile')
await actor(db,'authenticated',agentA)
for (const [index,type] of ['company','trust'].entries()) {
 c=await read(receipt.participantId)
 const fields={purchaser_type:type,[type+'_name']:'Entity '+type,[type+'_registration_number']:'REG-'+type, ...(type==='company'?{directors:[{full_name:'Director',identity_number:'director-id'}]}:{trustees:[{full_name:'Trustee',identity_number:'trustee-id'}]})}
 const saved=await save(c,{name:'Entity '+type,email:'entity@example.test',phone:'0804'},fields,uuid(910+index))
 await actor(db,'anon')
 capture=await portal(saved.participantId,saved.buyerId,'secondary-link-nonce')
 assert.equal(capture.profile[type][type+'_name'],'Entity '+type)
 assert.equal(capture.profile[type+'_registration_number'],'REG-'+type)
 await actor(db,'authenticated',agentA)
}
console.log('ok - company/director and trust/trustee fields round-trip through the same buyer link')
await actor(db,'anon')
await assert.rejects(()=>db.query("select bridge_save_buyer_onboarding_snapshot_internal('{}','{}','[]',false,null)"),/permission denied/)
console.log('ok - original internal snapshot implementation remains inaccessible directly')
await db.close()
// Exercise the real dispatch resolver without sending email or loading workers.
const {transform}=await import('esbuild')
const handler=readFileSync(new URL('../../supabase/functions/send-email/handlers/clientOnboarding.ts',import.meta.url),'utf8')
const matcherSource=handler.slice(handler.indexOf('function matchesBuyerTarget('),handler.indexOf('function buildBuyerTargetedOnboardingUrl('))
const compiled=(await transform(matcherSource,{loader:'ts',format:'cjs'})).code
const resolver=new Function('normalizeText','normalizeEmail',compiled+';return {matchesBuyerTarget,loadBuyerParticipantTarget};')(value=>String(value||'').trim(),value=>String(value||'').trim().toLowerCase())
const target={participantId:'p1',buyerPartyId:'b1',email:'one@example.test',hasTarget:true}
const row={id:'p1',buyer_party_id:'b1',participant_email:'one@example.test',status:'active'}
assert.equal(resolver.matchesBuyerTarget(row,target),true)
assert.equal(resolver.matchesBuyerTarget(row,{...target,buyerPartyId:'other'}),false)
assert.equal(resolver.matchesBuyerTarget(row,{...target,email:'other@example.test'}),false)
const fakeDB={from:()=>({select:()=>({eq:()=>({or:async()=>({data:[{...row,status:'removed'}],error:null})})})})}
assert.equal((await resolver.loadBuyerParticipantTarget(fakeDB,'tx',target)).participant,null)
console.log('ok - email dispatch rejects contradictory target IDs, changed emails and removed recipients')
