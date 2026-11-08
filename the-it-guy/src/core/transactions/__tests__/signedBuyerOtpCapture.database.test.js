import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createSignedBuyerOtpCaptureFixture } from '../../../../scripts/fixtures/signed-buyer-otp-capture.mjs'

// Execute the complete production-derived creation routine and the new evidence
// check locally. Auth assignment and downstream seed infrastructure are fixtures;
// this is not a hosted authorization or email-delivery certification.
const { db, actor, admin, colleague, org, lead, listing, objectPath, evidence, payload, capture, count } = await createSignedBuyerOtpCaptureFixture()
after(() => db.close())

test('the production-schema regression detects the bad insert and the forward correction repairs it without partial data', async () => {
  const current = (await db.query("select pg_get_functiondef('public.bridge_create_mvp_transaction(jsonb)'::regprocedure) definition")).rows[0].definition
  const broken = current
    .replace('agency_commission_amount, creation_idempotency_key,', 'agency_commission_amount, creation_idempotency_key, creation_mode,')
    .replace('v_idempotency_key, now(), now()', 'v_idempotency_key, v_creation_mode, now(), now()')
  assert.notEqual(broken, current)
  await db.exec(broken)
  try {
    await assert.rejects(capture(), /column "creation_mode" of relation "transactions" does not exist/)
    assert.equal(await count('transactions'), 0)
    assert.equal(await count('buyers'), 0)
  } finally {
    await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261031110822_repair_signed_otp_transaction_schema.sql', import.meta.url), 'utf8'))
  }
  assert.equal((await db.query("select pg_get_functiondef('public.bridge_create_mvp_transaction(jsonb)'::regprocedure) definition")).rows[0].definition, current)
})

test('an assigned agent captures the signed paper deal without a principal override; retries reuse it',async()=>{
  const first=await capture(),second=await capture()
  assert(first.transaction.id);assert.equal(second.transaction.id,first.transaction.id);assert.equal(second.existing,true)
  assert.equal(await count('transactions'),1);assert.equal(await count('buyers'),1);assert.equal(await count('fixture_seed_calls'),3)
  assert.equal(first.transaction.creation_mode,undefined,'production stores capture mode in its routing profile, not a nonexistent table column')
  assert.equal(first.transaction.stage,'OTP Signed');assert.equal(first.transaction.current_main_stage,'OTP')
  assert.equal(first.transaction.onboarding_status,'signed_otp_uploaded_for_review')
  assert.equal((await db.query('select allocation_status from private_listing_role_players')).rows[0].allocation_status,'awaiting_buyer','the real legacy trigger must not instruct an attorney on unreviewed capture')
  await db.query("update leads set stage='Offer to purchase signed',status='Offer to purchase signed' where lead_id=$1",[lead])
  assert.equal((await capture({...payload,stage:'Registered',current_main_stage:'REG'})).transaction.stage,'OTP Signed')
  assert.equal((await db.query('select stage from leads where lead_id=$1',[lead])).rows[0].stage,'Offer to purchase signed')
  assert.equal(first.transaction.routing_profile_json.signedOtpCapture.legalReviewApproved,false)
  assert.equal(first.transaction.routing_profile_json.transactionCreationOverride,undefined)
  assert.equal((await db.query('select converted_transaction_id from leads where lead_id=$1',[lead])).rows[0].converted_transaction_id,first.transaction.id)
})
test('a normal manual override still requires a principal and written reason',async()=>{
  await assert.rejects(capture({...payload,creation_mode:'onboarding_capture',transaction_creation_override_reason:'Manual transaction intake requested'}),/principal\/admin/)
  await assert.rejects(capture({...payload,creation_mode:'onboarding_capture'},admin),/written reason/)
})
test('a colleague, foreign organisation, altered agent or forged source path cannot capture the file',async()=>{
  for (const [value,who] of [[payload,colleague],[{...payload,organisation_id:randomUUID()},actor],[{...payload,assigned_agent_id:colleague},actor],[{...payload,signed_otp_storage_path:objectPath.replace(lead,randomUUID())},actor]]) {
    await assert.rejects(capture(value,who),/access|Save the signed OTP/)
  }
  assert.equal(await count('transactions'),1)
})
test('missing bytes, missing confirmations and a different price leave no extra transaction or buyer',async()=>{
  await db.query('delete from storage.objects')
  await assert.rejects(capture(),/Save the signed OTP/)
  await db.query("insert into storage.objects values('documents',$1,'{\"size\":512}')",[objectPath])
  await db.query('update leads set raw_enquiry_payload=$1 where lead_id=$2',[{buyerOtpDocument:{...evidence,metadata:{...evidence.metadata,signedByAllPartiesConfirmed:false}}},lead])
  await assert.rejects(capture(),/Save the signed OTP/)
  await db.query('update leads set raw_enquiry_payload=$1 where lead_id=$2',[{buyerOtpDocument:evidence},lead])
  await assert.rejects(capture({...payload,purchase_price:2000000}),/Save the signed OTP/)
  await assert.rejects(capture({...payload,finance_type:'bond'}),/Save the signed OTP/)
  assert.equal(await count('transactions'),1);assert.equal(await count('buyers'),1)
})
test('accepted-offer conversion still requires the existing executed-OTP review gate',async()=>{
  const offer=randomUUID()
  await db.query("insert into offers(id,organisation_id,status,buyer_lead_id,listing_id,offer_amount,cash_component,bond_component,deposit_amount) values($1,$2,'accepted',$3,$4,1000000,1000000,0,0)",[offer,org,lead,listing])
  await assert.rejects(capture({...payload,accepted_offer_id:offer,creation_mode:'mvp_workflow',cash_amount:1000000,bond_amount:0,deposit_amount:0,creation_idempotency_key:`offer:${offer}`}),/reviewed fully executed wet-ink/)
  assert.equal(await count('transactions'),1)
})

let requirement, document, transaction, replacementDocument
async function link(id=document,who=actor) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who])
  await db.exec('set role authenticated')
  try { return (await db.query("select bridge_link_document_to_canonical_requirement_by_key($1,$2,'signed_otp','agent',$3,'{}') result",[id,transaction,who])).rows[0].result }
  finally { await db.exec('reset role') }
}
test('the captured transaction links its real stored OTP into the shared checklist awaiting review',async()=>{
  transaction=(await db.query('select id from transactions limit 1')).rows[0].id
  requirement=randomUUID();document=randomUUID()
  await db.query("insert into document_requirement_instances(id,transaction_id,document_definition_key,status,uploadable_by_roles) values($1,$2,'signed_otp','pending',array['buyer','agent'])",[requirement,transaction])
  await db.query("insert into documents(id,transaction_id,document_type,status,file_path,file_bucket) values($1,$2,'uploaded_otp','uploaded',$3,'documents')",[document,transaction,objectPath])
  assert.equal((await link()).newStatus,'under_review')
  assert.equal((await db.query('select satisfied_by_document_id from document_requirement_instances where id=$1',[requirement])).rows[0].satisfied_by_document_id,document)
})
test('link RPC denies a colleague even when the document is already linked',async()=>{
  await assert.rejects(link(document,colleague),/not available for upload/)
  assert.equal((await link()).matchReason,'already_linked')
})
test('a replacement cannot inherit the previous version approval and retains both document rows',async()=>{
  await db.query("update document_requirement_instances set status='approved' where id=$1",[requirement])
  const replacement=randomUUID(),replacementPath=objectPath.replace('retained.pdf','replacement.pdf')
  await db.query("insert into storage.objects values('documents',$1,'{\"size\":512}')",[replacementPath])
  await db.query("insert into documents(id,transaction_id,document_type,status,file_path,file_bucket) values($1,$2,'uploaded_otp','uploaded',$3,'documents')",[replacement,transaction,replacementPath])
  assert.equal((await link(replacement)).newStatus,'under_review')
  replacementDocument=replacement
  assert.equal(await count('documents'),2)
})
test('a removed standard slot does not create a false ambiguous-match blocker; missing bytes stay unlinked',async()=>{
  await db.query("insert into document_requirement_instances(transaction_id,document_definition_key,status,applicability_override) values($1,'signed_otp','pending','removed')",[transaction])
  const missing=randomUUID()
  await db.query("insert into documents(id,transaction_id,document_type,status,file_path,file_bucket) values($1,$2,'uploaded_otp','uploaded','missing.pdf','documents')",[missing,transaction])
  await assert.rejects(link(missing),/saved file is unavailable/)
  await db.query('update documents set file_path=$1 where id=$2',[objectPath,missing])
  assert.equal((await link(missing)).ok,true)
})

test('automatic handoff cannot replace newer current evidence or its approval', async () => {
  const current = (await db.query('select satisfied_by_document_id from document_requirement_instances where id=$1', [requirement])).rows[0].satisfied_by_document_id
  await db.query("update document_requirement_instances set status='approved' where id=$1", [requirement])
  const older = randomUUID()
  await db.query("insert into documents(id,transaction_id,document_type,status,file_path,file_bucket) values($1,$2,'uploaded_otp','uploaded',$3,'documents')", [older, transaction, objectPath])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
  await db.exec('set role authenticated')
  try {
    const result = (await db.query("select bridge_link_document_to_canonical_requirement($1,$2,'agent',$3,'{\"source\":\"buyer_lead_document_handoff\"}') result", [older, requirement, actor])).rows[0].result
    assert.equal(result.reason, 'current_evidence_preserved')
  } finally { await db.exec('reset role') }
  const after = (await db.query('select status,satisfied_by_document_id from document_requirement_instances where id=$1', [requirement])).rows[0]
  assert.equal(after.status, 'approved')
  assert.equal(after.satisfied_by_document_id, current)
  assert.equal((await db.query('select canonical_requirement_instance_id from documents where id=$1', [older])).rows[0].canonical_requirement_instance_id, null)
})

test('superseded linked history cannot masquerade as current evidence or a different document request',async()=>{
  assert.equal((await link(document)).reason,'document_not_current_evidence')
  assert.equal((await link(replacementDocument)).reason,'document_not_current_evidence')
  const current=(await db.query('select satisfied_by_document_id from document_requirement_instances where id=$1',[requirement])).rows[0].satisfied_by_document_id
  assert.equal((await link(current)).matchReason,'already_linked')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated')
  try {
    const wrongKey=(await db.query("select bridge_link_document_to_canonical_requirement_by_key($1,$2,'buyer_id_document','agent',$3,'{}') result",[current,transaction,actor])).rows[0].result
    assert.equal(wrongKey.ok,false)
    assert.equal(wrongKey.reason,'document_not_current_evidence')
  } finally { await db.exec('reset role') }
  const unrelated=randomUUID()
  await db.query("insert into document_requirement_instances(id,document_definition_key,status,uploadable_by_roles) values($1,'signed_otp','pending',array['agent'])",[unrelated])
  await db.exec('set role authenticated')
  try { await assert.rejects(db.query("select bridge_link_document_to_canonical_requirement($1,$2,'agent',$3,'{}')",[current,unrelated,actor]),/transaction does not match/) }
  finally { await db.exec('reset role') }
})

test('a real cash-and-bond capture can save before later party facts, while unsupported facts remain blocked',async()=>{
  const buyerLead=randomUUID(), property=randomUUID(), path=`buyer-otp-documents/${org}/${buyerLead}/uploaded_otp/cash-and-bond.pdf`
  const saved={...evidence,listingId:property,storagePath:path,metadata:{...evidence.metadata,financeType:'combination'}}
  await db.query("insert into leads(lead_id,organisation_id,lead_domain,lead_category,assigned_agent_id,raw_enquiry_payload,status,stage) values($1,$2,'agency','buyer',$3,$4,'Captured','Captured')",[buyerLead,org,actor,{buyerOtpDocument:saved}])
  await db.query('insert into private_listings values($1,$2,null,null)',[property,org])
  await db.query("insert into storage.objects values('documents',$1,'{\"size\":512}')",[path])
  const capturePayload={...payload,originating_lead_id:buyerLead,listing_id:property,signed_otp_storage_path:path,creation_idempotency_key:`signed-otp:${buyerLead}:${property}`,finance_type:'hybrid',routing_profile_json:{transactionType:'private_sale',financeType:'combination',propertyTenure:'unknown',buyerEntityType:'unknown',sellerEntityType:'unknown'}}
  const created=await capture(capturePayload)
  assert(created.transaction.id)
  assert.equal(created.transaction.onboarding_status,'signed_otp_uploaded_for_review')
  assert.equal((await capture(capturePayload)).transaction.id,created.transaction.id)
  await assert.rejects(capture({...capturePayload,routing_profile_json:{...capturePayload.routing_profile_json,propertyTenure:'leasehold'}}),/outside the Arch9 MVP launch scope/)
  assert.equal(await count('transactions'),2)
})


test('database-generated email events suppress controlled tests while ordinary transaction events still queue',async()=>{
  await db.query("insert into notification_automation_definitions values('transaction_created','active',true)")
  const queue=async key=>(await db.query("select bridge_queue_transaction_operation_event_phase4(t,'transaction_created','Fixture subject','Fixture message',$2) id from transactions t where id=$1",[transaction,key])).rows[0].id
  await db.query("update transactions set routing_profile_json=jsonb_set(routing_profile_json,'{testDataProtection}','{\"isTestData\":true,\"externalDeliveryAllowed\":false}'::jsonb) where id=$1",[transaction])
  assert.equal(await queue('controlled-profile'),null)
  assert.equal(await count('notification_events'),0)
  await db.query("update transactions set routing_profile_json=routing_profile_json-'testDataProtection',is_demo_data=true where id=$1",[transaction])
  assert.equal(await queue('demo-marker'),null)
  assert.equal(await count('notification_events'),0)
  await db.query('update transactions set is_demo_data=false where id=$1',[transaction])
  assert(await queue('ordinary-event'))
  assert.equal(await count('notification_events'),1)
})
