import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDocumentUploadTelemetry, reportDocumentUploadTelemetry, sendDocumentUploadTelemetry, documentUploadErrorCategory } from '../documentUploadObservability.js'
import { runRecoverableDocumentUpload } from '../documentUploadRecovery.js'

const event = () => normalizeDocumentUploadTelemetry({ surface:'seller_portal', stage:'persistence', outcome:'durable_saved' })
test('safe labels replace raw messages, identifiers, file paths and portal tokens', () => {
  const receipt = normalizeDocumentUploadTelemetry({ surface:'seller_portal', stage:'storage', outcome:'failed', error:{code:'42501',message:'secret-token/customer-name/file.pdf'}, transactionId:'private',fileName:'customer.pdf',listingId:'private' })
  assert.deepEqual(Object.keys(receipt), ['eventId','attemptId','surface','stage','outcome','errorCategory'])
  assert.equal(receipt.surface,'seller'); assert.equal(receipt.stage,'uploading'); assert.equal(receipt.errorCategory,'permission')
  assert.doesNotMatch(JSON.stringify(receipt),/secret|customer|private/)
  assert.equal(normalizeDocumentUploadTelemetry({surface:'portal-token-is-not-a-label'}).surface,'unknown')
  assert.equal(normalizeDocumentUploadTelemetry({surface:'buyer_bond_runtime'}).surface,'bondApplication')
})
test('durable saves, unconfirmed responses, type errors and permission failures have distinct categories',()=>{
  assert.equal(event().outcome,'succeeded')
  assert.equal(documentUploadErrorCategory(new TypeError('sensitive request URL')),'network')
  assert.equal(documentUploadErrorCategory({code:'document_save_unconfirmed',cause:{status:403}}),'permission')
  assert.equal(documentUploadErrorCategory({code:'document_file_too_large'}),'validation')
  assert.equal(documentUploadErrorCategory({code:'PGRST204'}),'schema')
  assert.equal(documentUploadErrorCategory({status:404}),'missing_object')
})
test('local/offline collection and a rejected collector never fail the upload caller',async()=>{
  let calls=0
  const fetcher=async()=>{calls++;throw new Error('Collector offline')}
  for(const location of [{protocol:'http:',hostname:'localhost'},{protocol:'https:',hostname:'localhost'},undefined]) assert.equal(await sendDocumentUploadTelemetry(event(),{fetcher,location}),false)
  assert.equal(calls,0)
  assert.equal(await sendDocumentUploadTelemetry(event(),{fetcher,location:{protocol:'https:',hostname:'app.arch9.co.za'}}),false)
  assert.equal(calls,1)
  let request
  assert.equal(await sendDocumentUploadTelemetry(event(),{fetcher:async(url,options)=>{request={url,options};return {ok:true}},location:{protocol:'https:',hostname:'app.arch9.co.za'}}),true)
  assert.equal(request.options.keepalive,true); assert.equal(request.options.credentials,'omit')
  assert.equal(request.url,'/api/documents/telemetry')
})
test('browser event and logging errors cannot change the outcome',()=>{
  const logger=console.info;const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window')
  try {console.info=()=>{throw new Error('logger unavailable')};globalThis.window={dispatchEvent:()=>{throw new Error('listener unavailable')}}
    assert.equal(reportDocumentUploadTelemetry({surface:'buyer',outcome:'succeeded'}).outcome,'succeeded')
  } finally {console.info=logger;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete globalThis.window}
})
test('recovery emits a correlated terminal result without leaking the recovery identity',async()=>{
  const receipts=[];const info=console.info;const warn=console.warn
  console.info=(_label,payload)=>receipts.push(payload);console.warn=(_label,payload)=>receipts.push(payload)
  let saved;const file=new File(['%PDF-test'], 'private-customer.pdf',{type:'application/pdf'})
  const client={auth:{getUser:async()=>({data:{user:null}})}}
  const run=()=>runRecoverableDocumentUpload({client,scope:['seller_portal','secret-token',crypto.randomUUID()],file,run:async attempt=>{
    const path=attempt.path('customer-name/private.pdf')
    await attempt.upload(async()=> 'documents')
    const result=await attempt.persist({save:async()=>{saved={id:'private-id',file_path:path};return {data:saved}},read:async()=>({data:saved})})
    return result.data
  }})
  try {assert.equal((await run()).id,'private-id');assert.equal(receipts[0].outcome,'started');assert.equal(receipts.at(-1).outcome,'succeeded');assert.equal(receipts[0].attemptId,receipts.at(-1).attemptId);assert.doesNotMatch(JSON.stringify(receipts),/secret-token|customer-name|private-id|private-customer/)}finally{console.info=info;console.warn=warn}
})
