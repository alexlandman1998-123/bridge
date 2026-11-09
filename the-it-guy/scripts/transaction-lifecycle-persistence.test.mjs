import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'

import {PERSISTED_TRANSACTION_LIFECYCLE_STAGES,normalizePersistedTransactionLifecycleStage} from '../src/core/transactions/transactionLifecycle.js'
for(const stage of PERSISTED_TRANSACTION_LIFECYCLE_STAGES)assert.equal(normalizePersistedTransactionLifecycleStage(stage),stage)
for(const stage of ['confirmed','otp','transfer','XFER','Reserved'])assert.ok(PERSISTED_TRANSACTION_LIFECYCLE_STAGES.includes(normalizePersistedTransactionLifecycleStage(stage)))
const source=readDomainApiSource()
const start=source.indexOf('async function upsertTransactionLifecycleWorkflow('),end=source.indexOf('\nexport async function createOrGetTransactionLifecycle',start)
const save=new Function('normalizePersistedTransactionLifecycleStage','PERSISTED_TRANSACTION_LIFECYCLE_STAGES','isMissingTableError','isMissingSchemaError','TRANSACTION_LIFECYCLE_STAGE_LABELS','logTransactionEventIfPossible','normalizeNullableText',source.slice(start,end)+';return upsertTransactionLifecycleWorkflow')(
 normalizePersistedTransactionLifecycleStage,PERSISTED_TRANSACTION_LIFECYCLE_STAGES,()=>false,()=>false,{},async()=>{},v=>v)
function fixture(stage,status='active'){
 let row={id:'workflow',current_stage:stage,status},writes=0
 const client={from(){const query={select(){return query},eq(){return query},async maybeSingle(){return {data:row,error:null}},update(data){row={...row,...data};writes++;return query},async single(){return {data:row,error:null}}};return query}}
 return {client,get row(){return row},get writes(){return writes}}
}
for(const [stage,status] of [['lodgement','active'],['post_registration','completed']]){
 const f=fixture(stage,status);await save(f.client,{transactionId:'matter',currentStage:'finance',preserveLaterStage:true});assert.equal(f.writes,0);assert.equal(f.row.current_stage,stage);assert.equal(f.row.status,status)
}
const early=fixture('instruction');await save(early.client,{transactionId:'matter',currentStage:'finance',preserveLaterStage:true});assert.equal(early.row.current_stage,'finance')
const legal=fixture('finance');await save(legal.client,{transactionId:'matter',currentStage:'transfer'});assert.equal(legal.row.current_stage,'documents')
console.log('PASS persisted canonical lifecycle phases retain their meaning, legacy stage aliases remain valid and finance updates cannot regress advanced or completed legal matters.')
