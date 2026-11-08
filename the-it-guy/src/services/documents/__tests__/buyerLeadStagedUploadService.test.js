import test from 'node:test'
import assert from 'node:assert/strict'
import { uploadStagedBuyerLeadDocument } from '../buyerLeadStagedUploadService.js'
function fixture({ failure = null, commits = true, readable = true } = {}) {
 const state = { uploads: 0, saves: 0, deletes: 0, rows: [], readable, failure }
 const client = {auth:{getUser:async()=>({data:{user:{id:'qa-agent'}}})}, storage:{from(){return{remove:async()=>{state.deletes++;return{}},createSignedUrl:async()=>({data:{signedUrl:'fixture'}})}}},from(){
  const query={select(){return query},eq(){return query},async maybeSingle(){if(!state.readable)throw new TypeError('Read unavailable');return{data:{raw_enquiry_payload:{agentUploadedBuyerDocuments:state.rows}}}}};return query
 }}
 const file = new File(['%PDF synthetic'], 'qa.pdf', {type:'application/pdf',lastModified:1})
 const args = {client,organisationId:'org',leadId:crypto.randomUUID(),documentKey:'buyer_id_document',file,path:'buyer-leads/qa.pdf',
  upload:async path=>{state.uploads++;return{storageBucket:'documents',storagePath:path}},
  buildDocument:stored=>({...stored,key:'buyer_id_document'}),
  save:async document=>{state.saves++;if(commits)state.rows.push(document);if(state.failure)throw state.failure},
 }
 return{state,run:()=>uploadStagedBuyerLeadDocument(args)}
}
test('staged lead upload confirms the persisted file and recovers a lost save acknowledgement',async()=>{
 const f=fixture({failure:new TypeError('Failed to fetch')});const result=await f.run()
 assert.equal(result.storagePath,f.state.rows[0].storagePath);assert.equal(f.state.deletes,0)
 assert.equal((await f.run()).storagePath,result.storagePath);assert.equal(f.state.uploads,1);assert.equal(f.state.saves,1)
})
test('uncertain save retains bytes and retries only the read until the exact lead file is found',async()=>{
 const f=fixture({failure:new TypeError('Failed to fetch'),readable:false})
 await assert.rejects(f.run(),{code:'document_save_unconfirmed'})
 await assert.rejects(f.run(),{code:'document_save_unconfirmed'})
 assert.equal(f.state.deletes,0);assert.equal(f.state.uploads,1);assert.equal(f.state.saves,1)
 f.state.readable=true;assert.equal((await f.run()).key,'buyer_id_document')
})
test('a definite lead save rejection can remove only the new unlinked object',async()=>{
 const f=fixture({failure:{code:'42501',message:'Not permitted'},commits:false})
 await assert.rejects(f.run(),error=>error.code==='42501');assert.equal(f.state.deletes,1);assert.equal(f.state.rows.length,0)
})


test('OTP aliases use the same recovery protocol and never reupload after a lost acknowledgement', async () => {
  const state = { uploads: 0, saves: 0, document: null }
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'assigned-agent' } } }) }, from() {
    const query = { select() { return query }, eq() { return query }, maybeSingle: async () => ({ data: { raw_enquiry_payload: { buyerOtpDocument: state.document } } }) }; return query
  } }
  const args = { client, organisationId: 'org', leadId: crypto.randomUUID(), documentKey: 'uploaded_otp', recoveryScope: ['exact-property'], storageBuckets: ['documents'], file: new File(['%PDF-1.4 synthetic signed OTP'], 'signed.pdf', { type: 'application/pdf', lastModified: 12 }), path: 'buyer-otp-documents/org/lead/uploaded_otp/signed.pdf',
    upload: async path => { state.uploads++; return { storageBucket: 'documents', storagePath: path } },
    buildDocument: stored => ({ ...stored, key: 'uploaded_otp', listingId: 'exact-property' }),
    readRows: lead => [lead.raw_enquiry_payload.buyerOtpDocument].filter(Boolean),
    save: async document => { state.saves++; state.document = document; throw new TypeError('Connection lost after saving') },
  }
  const first = await uploadStagedBuyerLeadDocument(args), retried = await uploadStagedBuyerLeadDocument(args)
  assert.equal(first.storagePath, retried.storagePath)
  assert.equal(state.uploads, 1); assert.equal(state.saves, 1)
  assert.equal(retried.listingId, 'exact-property')
})
