import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileKnowledgeFactorySellerReport,attemptKnowledgeFactorySellerFiling} from './knowledgeFactorySellerFiling.js';
const report={id:'report-one'};
const receipt={status:'pending',lead_id:'lead-one',private_listing_id:'listing-one',storage_path:'private-listings/listing-one/knowledge-factory/report-one.pdf'};
function fakeDb({status='pending',privateBucket=true,uploadError=false,downloadError=false,completeError=false,prepareError=false}={}) {
 const calls=[];
 const db={calls,rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='knowledge_factory_prepare_seller_filing')return prepareError?{error:{code:'42501'}}:{data:{...receipt,status}};
  if(name==='knowledge_factory_complete_seller_filing')return completeError?{error:{code:'XX'}}:{data:{...receipt,status:'filed',document_id:'doc-one'}};
  throw new Error('Unexpected supplier or database call');
 },storage:{getBucket:async(name)=>{calls.push(['bucket',name]);return {data:{public:!privateBucket}};},from:name=>{
  assert.equal(name,'documents');return {
   upload:async(path,bytes,options)=>{calls.push(['upload',path,options]);assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');return {error:uploadError?{statusCode:409}:null};},
   download:async(path)=>{calls.push(['download',path]);return downloadError?{error:{}}:{data:new Blob(['%PDF-saved-snapshot'],{type:'application/pdf'})};},
  };
 }}};
 return db;
}
const renderPdf=()=>({output:()=>new TextEncoder().encode('%PDF-saved-snapshot').buffer});
const run=db=>fileKnowledgeFactorySellerReport({db,report,actorId:'actor-one',renderPdf});
test('files the immutable snapshot into private seller documents',async()=>{
 const db=fakeDb();const result=await run(db);assert.equal(result.status,'filed');assert.equal(result.leadId,'lead-one');assert.equal(result.documentId,'doc-one');
 assert.deepEqual(db.calls.map(x=>x[0]),['knowledge_factory_prepare_seller_filing','bucket','upload','knowledge_factory_complete_seller_filing']);
 assert.equal(db.calls.find(x=>x[0]==='upload')[2].upsert,false);
});
test('already-filed and test reports never upload or render another PDF',async()=>{
 for(const status of ['filed','test_report']){const db=fakeDb({status});await fileKnowledgeFactorySellerReport({db,report,actorId:'a',renderPdf:()=>{throw new Error('must not render');}});assert.equal(db.calls.length,1);}
});
test('public storage and denied report access cannot receive owner information',async()=>{
 for(const patch of [{privateBucket:false},{prepareError:true}]){const db=fakeDb(patch);await assert.rejects(run(db));assert.ok(!db.calls.some(x=>x[0]==='upload'));}
});
test('an uncertain upload reuses an existing verified PDF rather than overwriting it',async()=>{
 const db=fakeDb({uploadError:true});assert.equal((await run(db)).status,'filed');assert.ok(db.calls.some(x=>x[0]==='download'));
});
test('missing uploads and failed document links remain retryable without another purchase',async()=>{
 for(const patch of [{uploadError:true,downloadError:true},{completeError:true}]){
  const db=fakeDb(patch);const result=await attemptKnowledgeFactorySellerFiling({db,report,actorId:'actor-one',renderPdf});
  assert.equal(result.status,'pending');assert.match(result.message,/Report saved/);assert.ok(!db.calls.some(x=>/supplier|purchase|credit/.test(x[0])));
 }
});
