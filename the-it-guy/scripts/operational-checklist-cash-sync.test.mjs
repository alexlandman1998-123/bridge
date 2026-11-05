import assert from 'node:assert/strict'
import {createServer} from 'vite'

function fixture({paymentReviewed=true,proofStatus='approved',financeType='cash',approved=true,feedback=true}={}){
 const tables={transactions:[{id:'matter',finance_type:financeType,onboarding_completed_at:'2026-11-04T08:00:00Z'}],
  transaction_subprocesses:[{id:'finance',transaction_id:'matter',process_type:'finance'},
   {id:'transfer',transaction_id:'matter',process_type:'transfer'}],
  transaction_subprocess_steps:[...['proof_of_funds_requested','proof_of_funds_received','funds_secured_confirmed'].map((step_key,i)=>({
   id:'finance-'+i,subprocess_id:'finance',step_key,status:'not_started'})),
   {id:'security',subprocess_id:'transfer',step_key:'payment_security_review',status:paymentReviewed?'completed':'not_started'}],
  transaction_participants:[{id:'lawyer',transaction_id:'matter',user_id:'lawyer',role_type:'attorney',status:'active'}],
  transaction_finance_workflows:[{transaction_id:'matter',workflow_type:'bond_hybrid',current_stage:approved?'complete':'bank_review'}],transaction_bond_applications:[{transaction_id:'matter',application_type:'bank_application',status:approved?'approved':'declined',feedback_received_at:feedback?'2026-11-04':null}],transaction_bond_quotes:[{transaction_id:'matter',quote_status:approved?'approved_by_buyer':'declined_by_buyer'}],transaction_checklist_items:[],documents:[{id:'proof',transaction_id:'matter',document_type:'proof_of_funds',status:proofStatus}],
  document_requests:[],transaction_events:[]}
 class Query{
  constructor(table){this.table=table;this.filters=[]}
  select(){return this}order(){return this}limit(){return this}
  eq(k,v){this.filters.push(r=>r[k]===v);return this}
  in(k,vs){this.filters.push(r=>vs.includes(r[k]));return this}
  maybeSingle(){this.single=true;return this}
  insert(payload){this.payload=payload;this.action='insert';return this}
  update(payload){this.payload=payload;this.action='update';return this}
  then(resolve,reject){return Promise.resolve().then(()=>{
   const rows=tables[this.table]||(tables[this.table]=[])
   let found=rows.filter(r=>this.filters.every(fn=>fn(r)))
   if(this.action==='insert'){
    found=(Array.isArray(this.payload)?this.payload:[this.payload]).map((r,i)=>({...r,id:'new-'+rows.length+'-'+i}))
    rows.push(...found)
   }
   if(this.action==='update')for(const row of found)Object.assign(row,this.payload)
   return {data:this.single?found[0]||null:found.map(r=>({...r})),error:null}
  }).then(resolve,reject)}
 }
 return {tables,client:{from:table=>new Query(table)}}
}
const vite=await createServer({root:process.cwd(),logLevel:'silent',server:{middlewareMode:true,watch:null,hmr:false}})
try{
 const service=await vite.ssrLoadModule('/src/services/transactionOperationalChecklistService.js')
 const state=fixture()
 const result=await service.syncOperationalChecklistForTransaction('matter',{client:state.client})
 assert.deepEqual(result.warnings,[])
 const finance=state.tables.transaction_checklist_items.filter(r=>r.stage==='finance')
 assert.equal(finance.length,3)
 assert.ok(finance.every(r=>r.owner_role==='attorney'&&r.status==='completed'))
 assert.equal(state.tables.transaction_checklist_items.find(r=>r.auto_rule_key?.includes(':onboarding_completed:')).status,'completed')
 for(const financeType of ['bond','hybrid']){
  for(const approved of [true,false]){
   const bond=fixture({financeType,approved})
   bond.tables.transaction_subprocess_steps.push(...['bank_feedback_received','bond_approved'].map(step_key=>({id:step_key,subprocess_id:'finance',step_key,status:'not_started'})))
   await service.syncOperationalChecklistForTransaction('matter',{client:bond.client})
   assert.equal(bond.tables.transaction_checklist_items.find(r=>r.auto_rule_key?.includes(':bank_feedback_received:')).status,'completed')
   assert.equal(bond.tables.transaction_checklist_items.find(r=>r.auto_rule_key?.includes(':bond_approved:')).status,approved?'completed':'pending')
  }
 }
 for(const financeType of ['cash','hybrid','combination'])for(const paymentReviewed of [true,false])for(const proofStatus of ['approved','uploaded'])for(const approved of [true,false]){
  const contribution=fixture({financeType,paymentReviewed,proofStatus,approved})
  await service.syncOperationalChecklistForTransaction('matter',{client:contribution.client})
  const items=contribution.tables.transaction_checklist_items
  const requested=items.find(r=>r.auto_rule_key?.includes(':proof_of_funds_requested:'))
  const secured=items.find(r=>r.auto_rule_key?.includes(':funds_secured_confirmed:'))
  assert.equal(requested.status,'completed')
  assert.equal(requested.owner_role,'attorney')
  assert.equal(secured.status,paymentReviewed&&proofStatus==='approved'&&(financeType==='cash'||approved)?'completed':'pending',`Funds readiness must reflect both funding components: ${financeType}, reviewed=${paymentReviewed}, proof=${proofStatus}, bond=${approved}`)
 }
 const pending=fixture({paymentReviewed:false,proofStatus:'uploaded'})
 await service.syncOperationalChecklistForTransaction('matter',{client:pending.client})
 const review=pending.tables.transaction_checklist_items.find(r=>r.auto_rule_key?.includes(':proof_of_funds_received:'))
 const secured=pending.tables.transaction_checklist_items.find(r=>r.auto_rule_key?.includes(':funds_secured_confirmed:'))
 assert.equal(review.status,'pending','An upload must not approve its own review.')
 assert.equal(secured.status,'pending','Proof of funds alone must not confirm secured trust funds.')
 console.log('Cash checklist ownership, reviewed evidence, onboarding and unsecured-funds checks passed')
}finally{await vite.close()}
