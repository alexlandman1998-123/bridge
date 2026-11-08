import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/services/bankAttorneyAppointmentService.js',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('export async function','async function')
const capture=new Function('requireClient',source+';return captureBankAttorneyAppointment')(()=>{throw Error('Use explicit client')})
const input={transactionId:'matter',roleType:'bond_attorney',bankName:'Controlled bank',appointmentReference:'STAGING',companyName:'Firm',contactName:'Contact',email:'controlled@example.test',evidenceConfirmed:true,evidenceDocumentId:'evidence'}
function fixture({document=true,existing=null,denied=false}={}){
 let writes=0
 const client={auth:{getUser:async()=>({data:{user:{id:'actor'}},error:null})},from(table){let payload;const q={select(){return q},eq(){return q},neq(){return q},insert(value){writes++;payload=value;return q},async maybeSingle(){return {data:table==='documents'?(document?{id:'evidence',transaction_id:'matter',status:'uploaded'}:null):existing,error:null}},async single(){return denied?{error:Error('row-level security denied'),data:null}:{data:{id:'appointment',...payload},error:null}}};return q}}
 return {client,get writes(){return writes}}
}
const saved=fixture(),result=await capture(input,{client:saved.client})
assert.equal(result.captured_by,'actor');assert.equal(result.evidence_confirmed,true);assert.equal(result.appointment_source,'instruction_document')
assert.equal(saved.writes,1)
const replay=fixture({existing:result});assert.equal((await capture(input,{client:replay.client})).id,'appointment');assert.equal(replay.writes,0)
for(const patch of [{roleType:'transfer_attorney'},{evidenceConfirmed:false},{bankName:''},{evidenceDocumentId:null}])await assert.rejects(()=>capture({...input,...patch},{client:fixture().client}),/Choose|Record/)
await assert.rejects(()=>capture(input,{client:fixture({document:false}).client}),/this transaction/)
await assert.rejects(()=>capture({...input,companyName:'Different firm'},{client:fixture({existing:result}).client}),/replace that appointment/)
await assert.rejects(()=>capture(input,{client:fixture({denied:true}).client}),/row-level security/)
console.log('PASS bank appointment proof, role and document scope, accepted-record preservation, safe replay, replacement guard and database denial propagation.')
