import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'

const source=readDomainApiSource()
const start=source.indexOf('export async function createOrGetBondHybridFinanceWorkflow(')
const end=source.indexOf('\nexport async function updateBondHybridFinanceStage',start)
const initialize=new Function('requireClient','isBondFinanceType','resolveActiveProfileContext','BOND_HYBRID_FINANCE_WORKFLOW_TYPE','isMissingTableError','isMissingSchemaError',source.slice(start,end).replace('export ','')+';return createOrGetBondHybridFinanceWorkflow')(
 ()=>{throw Error('Explicit test client required')},v=>v==='bond',async()=>({userId:'actor'}),'bond_hybrid',()=>false,()=>false)
function fixture(existing=null){
 let row=existing,writes=0
 return {get row(){return row},get writes(){return writes},client:{from(table){let creating=false
  const query={select(){return query},eq(){return query},
   upsert(data,options){assert.deepEqual(options,{onConflict:'transaction_id,workflow_type',ignoreDuplicates:true});creating=true;writes++;if(!row)row={id:'one-workflow',...data};else creating='ignored';return query},
   async maybeSingle(){return {data:table==='transactions'?{id:'matter',finance_type:'bond'}:row,error:null}},
   then(resolve){assert.ok(creating);return Promise.resolve({data:creating==='ignored'?[]:[row],error:null}).then(resolve)}}
  return query}}}
}
const completed={id:'existing',transaction_id:'matter',workflow_type:'bond_hybrid',current_stage:'complete',status:'completed',completed_at:'2026-11-04'}
const f=fixture(structuredClone(completed));const reads=await Promise.all([initialize('matter',{client:f.client}),initialize('matter',{client:f.client})])
assert.deepEqual(f.row,completed);assert.ok(reads.every(row=>row.id==='existing'))
const fresh=fixture();const created=await Promise.all([initialize('matter',{client:fresh.client}),initialize('matter',{client:fresh.client})])
assert.ok(created.every(row=>row.id==='one-workflow'));assert.equal(fresh.row.current_stage,'intake')
console.log('PASS concurrent initialization preserves one workflow and never resets completed finance or requires an empty insert to return a singular row.')
