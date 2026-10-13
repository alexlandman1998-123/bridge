import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { uploadSellerRequirementFile } from '../sellerRequirementUploadService.js'
function fixture() {
 const values=new Map(),calls=[];let fail=true,saved=null
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
 const listingId=randomUUID(), requirement={id:randomUUID(),command_revision:3,latest_upload_id:null}
 const client={supabaseUrl:'https://test.invalid',storage:{from:()=>({upload:async()=>({data:{}})})},rpc:async(name,args)=>{
  calls.push([name,args]);if(name.endsWith('_receipt'))return {data:saved}
  saved={saved:true,commandId:args.p_command_id,requirement:{id:requirement.id,status:'under_review'},uploadId:args.p_command_id}
  if(fail)return {error:{code:'08006'}};return {data:saved}
 }}
 return {values,calls,storage,client,listingId,requirement,recover:()=>{fail=false}}
}
test('seller retry preserves the command without storing portal credentials',async()=>{
 const f=fixture();const args={...f,token:'private-portal-token',accessToken:'private-session',file:new File(['pdf'],'papers.pdf',{type:'application/pdf'})}
 await assert.rejects(uploadSellerRequirementFile(args),error=>error.code==='document_save_unconfirmed')
 assert.equal(f.values.size,1)
 const raw=[...f.values.entries()].flat().join(' ');assert.ok(!raw.includes('private-portal-token'));assert.ok(!raw.includes('private-session'))
 const first=f.calls.find(([name])=>name==='bridge_seller_requirement_upload')[1]
 f.recover();const {result}=await uploadSellerRequirementFile({...args,file:null})
 assert.equal(result.saved,true);assert.equal(f.values.size,0);assert.deepEqual(f.calls.at(-1)[1],first)
})
test('changed file is rejected before another upload when no receipt exists',async()=>{
 const f=fixture();let uploads=0;f.client.storage.from=()=>({upload:async()=>{uploads++;return {data:{}}}})
 f.client.rpc=async(name)=>name.endsWith('_receipt')?{data:null}:{error:{code:'08006'}}
 const args={...f,token:'token',accessToken:'session',file:new File(['pdf'],'papers.pdf',{type:'application/pdf'})}
 await assert.rejects(uploadSellerRequirementFile(args))
 await assert.rejects(uploadSellerRequirementFile({...args,file:new File(['different'],'papers.pdf',{type:'application/pdf'})}),/same file/)
 assert.equal(uploads,1);assert.equal(f.values.size,1)
})

test('shared seller requests report storage and save progress to their caller', async () => {
 const f=fixture();f.recover();const progress=[]
 await uploadSellerRequirementFile({...f,token:'token',accessToken:'session',file:new File(['pdf'],'papers.pdf',{type:'application/pdf'}),onProgress:update=>progress.push(update)})
 assert.ok(progress.some(update=>update.stage==='uploading'))
 assert.ok(progress.some(update=>update.stage==='saving'))
 assert.equal(progress.at(-1).stage,'complete')
})
