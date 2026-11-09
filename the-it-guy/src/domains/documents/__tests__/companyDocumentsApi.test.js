import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { uploadCompanyDocument,fetchCompanyDocuments,changeCompanyDocument,createCompanyDocumentSignedUrl } from '../companyDocumentsApi.js'
import { legacyCompanyDocumentFile,readLegacyCompanyDocuments,clearRecoveredCompanyDocument,legacyCompanyDocumentKey } from '../companyDocumentLegacyRecovery.js'
function fixture(){
 const actorId=randomUUID(),organisationId=randomUUID(),file=new File(['%PDF-1.4 company bytes'],'company.pdf',{type:'application/pdf',lastModified:7})
 const state={uploads:0,saves:0,removes:0,auth:0,rows:[],objects:new Set(),lostSave:false,lostUpload:false,denied:false,workspaceOrg:organisationId,expiry:null}
 const client={auth:{getUser:async()=>{state.auth++;return {data:{user:{id:actorId}}}}},
 from(){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){return {data:state.rows.find(row=>filters.every(([k,v])=>row[k]===v))||null}},async single(){return q.maybeSingle()}};return q},
 storage: {
   from() {
     return {
       async upload(path) {
         state.uploads++;state.objects.add(path)
         if(state.lostUpload){state.lostUpload=false;throw new TypeError('Reply lost')}
         return {data:{path}}
       },
       async remove(paths){state.removes++;paths.forEach(path=>state.objects.delete(path));return {}},
       async createSignedUrl(path,seconds){state.expiry=seconds;return state.objects.has(path)?{data:{signedUrl:`https://private.test/${path}`}}:{error:{status:404}}},
     }
   },
 },
 async rpc(name,args){
 if(name==='bridge_company_document_workspace')return {data:{organisationId:state.workspaceOrg,canManageAll:true,documents:state.rows}}
 if(name==='bridge_company_document_change')return {data:{saved:true,document:state.rows.find(row=>row.id===args.p_document_id)}}
 if(state.denied)return {error:{code:'42501',message:'Permission denied'}}
 state.saves++
 const p=args.p_payload,row={id:args.p_upload_id,organisation_id:args.p_organisation_id,uploaded_by:actorId,title:p.title,category:p.category,status:p.status,visibility:p.visibility,storage_bucket:'company-documents',storage_path:p.storagePath,file_name:p.fileName,sha256:p.sha256,legacy_import_key:p.legacyImportKey,revision:1,version:1}
 state.rows.push(row)
 if(state.lostSave){state.lostSave=false;throw new TypeError('Lost save reply')}
 return {data:{saved:true,document:row}}
 }}
 return {state,client,actorId,organisationId,file,input:{client,actorId,organisationId,file,title:'Company registration',category:'CIPC Documents'}}
}
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}}

test('company uploads confirm private persistence and progress, with safe retries after a lost save reply',async()=>{
 const f=fixture(),events=[];f.state.lostSave=true
 const first=await uploadCompanyDocument({...f.input,onProgress:e=>events.push(e)})
 assert.equal(first.saved,true);assert.equal(first.organisation_id,f.organisationId)
 assert(events.some(e=>e.stage==='uploading'));assert(events.some(e=>e.stage==='saving'));assert.equal(events.at(-1).stage,'complete')
 assert.equal((await uploadCompanyDocument(f.input)).id,first.id)
 assert.equal(f.state.uploads,1);assert.equal(f.state.saves,1);assert.equal(f.state.removes,0)
})
test('a lost storage reply is reconciled before saving; an actual permission rejection cleans up only staged bytes',async()=>{
 const f=fixture();f.state.lostUpload=true
 assert.equal((await uploadCompanyDocument(f.input)).saved,true)
 assert.equal(f.state.uploads,1)
 const denied=fixture();denied.state.denied=true
 await assert.rejects(uploadCompanyDocument(denied.input),e=>e.code==='42501')
 assert.equal(denied.state.removes,1);assert.equal(denied.state.rows.length,0)
})
test('invalid files and a changed account cannot start an upload',async()=>{
 const f=fixture()
 await assert.rejects(uploadCompanyDocument({...f.input,file:new File(['bad'],'program.exe')}),/file type|not supported|supported document/i)
 assert.equal(f.state.auth,0)
 await assert.rejects(uploadCompanyDocument({...f.input,actorId:randomUUID()}),/account changed/)
 assert.equal(f.state.uploads,0)
})
test('workspace identity, mutation receipts and fresh download references must match',async()=>{
 const f=fixture(),row=await uploadCompanyDocument(f.input)
 assert.equal((await fetchCompanyDocuments({...f.input})).documents[0].id,row.id)
 f.state.workspaceOrg=randomUUID()
 await assert.rejects(fetchCompanyDocuments(f.input),/could not be verified/)
 await assert.rejects(changeCompanyDocument({...f.input,document:row,action:'archive'}),e=>e.code==='document_save_unconfirmed')
 assert.match(await createCompanyDocumentSignedUrl({...f.input,document:{...row,fileUrl:'https://stale.test/not-used'}}),/private.test/)
 assert.equal(f.state.expiry,60)
})
test('legacy recovery verifies the saved server record and never reuploads an already recovered browser file',async()=>{
 const f=fixture(),local=storage(),legacy={id:'company_doc_123',fileName:'company.pdf',fileUrl:'data:application/pdf;base64,JVBERi0xLjQgY29tcGFueSBieXRlcw==',title:'Old registration',category:'CIPC Documents'}
 local.setItem(legacyCompanyDocumentKey(f.actorId),JSON.stringify([legacy]))
 const file=legacyCompanyDocumentFile(legacy)
 assert.equal(file.lastModified,0)
 const first=await uploadCompanyDocument({...f.input,file,legacyId:legacy.id})
 const again=await uploadCompanyDocument({...f.input,file:legacyCompanyDocumentFile(legacy),legacyId:legacy.id})
 assert.equal(first.id,again.id);assert.equal(f.state.uploads,1)
 assert.throws(()=>clearRecoveredCompanyDocument({actorId:f.actorId,legacy,receipt:{...first,saved:false},storage:local}),/not confirmed/)
 assert.equal(readLegacyCompanyDocuments(f.actorId,local).length,1)
 assert.deepEqual(clearRecoveredCompanyDocument({actorId:f.actorId,legacy,receipt:first,storage:local}),[])
})
test('corrupt, unavailable, changed and quota-limited legacy copies are preserved',()=>{
 const local=storage(),actorId=randomUUID(),legacy={id:'old',fileUrl:'data:application/pdf;base64,JVBERg==',fileName:'old.pdf'}
 local.setItem(legacyCompanyDocumentKey(actorId),'not json')
 assert.throws(()=>readLegacyCompanyDocuments(actorId,local),/original data has been kept/)
 assert.equal(local.getItem(legacyCompanyDocumentKey(actorId)),'not json')
 assert.throws(()=>legacyCompanyDocumentFile({...legacy,fileUrl:'https://private.test/file.pdf'}),/browser copy has been kept/)
 const changed={...legacy,title:'Replaced in another tab'}
 local.setItem(legacyCompanyDocumentKey(actorId),JSON.stringify([changed]))
 const receipt={id:randomUUID(),saved:true,uploaded_by:actorId,legacy_import_key:'old:hash'}
 assert.deepEqual(clearRecoveredCompanyDocument({actorId,legacy,receipt,storage:local}),[changed])
 assert.throws(()=>clearRecoveredCompanyDocument({actorId,legacy,receipt,storage:{...local,setItem(){throw new Error('Quota full')}}}),/Quota full/)
 assert.equal(readLegacyCompanyDocuments(actorId,local).length,1)
})

test('a full legacy browser cache does not block secure recovery or erase the original before confirmation',async()=>{
 const localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),sessionDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage')
 const tab=storage();let sessionWrites=0,localWrites=0
 const originalSet=tab.setItem
 tab.setItem=(key,value)=>{sessionWrites++;originalSet(key,value)}
 tab.removeItem=()=>{}
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem(){localWrites++;throw new Error('Quota full')},removeItem(){}}})
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:tab})
 try{
  const f=fixture(),saved=await uploadCompanyDocument({...f.input,legacyId:'company_doc_recover'})
  assert.equal(saved.saved,true)
  assert.equal(f.state.uploads,1);assert.equal(f.state.saves,1)
  assert(sessionWrites>0)
  assert.equal(localWrites,0,'the original browser file store is not touched by upload recovery')
 }finally{
  if(localDescriptor)Object.defineProperty(globalThis,'localStorage',localDescriptor);else delete globalThis.localStorage
  if(sessionDescriptor)Object.defineProperty(globalThis,'sessionStorage',sessionDescriptor);else delete globalThis.sessionStorage
 }
})
