import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {hasWorkflowEvidenceMapping,resolveWorkflowEvidenceMappings,workflowEvidenceMappings} from '../server/workflows/workflowEvidenceMappings.js'
const source=readFileSync(new URL('../server/services/workflowEvidenceMapper.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'')
let active=0,maximum=0,calls=0,release,hold=false,failNext=false
const events=[],client={}
const factory=new Function('requireClient','ensureTransactionWorkflowInstances','logTransactionWorkflowEvent','hasWorkflowEvidenceMapping','resolveWorkflowEvidenceMappings','writeWorkflowEvidence','applyWorkflowStepStatus','ensureWorkflowStep','publishWorkflowChanged','commitTransactionModuleAction',source+'\nreturn {processWorkflowEvidence,flushWorkflowEvidence}')
const {processWorkflowEvidence,flushWorkflowEvidence}=factory(()=>client,
 async()=>{calls++;active++;maximum=Math.max(maximum,active);if(hold)await new Promise(resolve=>{release=resolve});await new Promise(resolve=>setTimeout(resolve,2));if(failNext){failNext=false;active--;throw Error('Controlled failed projection')};return {transaction:{finance_type:'bond'}}},
 async event=>events.push(event.payload.evidenceId),hasWorkflowEvidenceMapping,resolveWorkflowEvidenceMappings,
 async(_id,_step,evidence)=>({id:evidence.evidenceId||'evidence'}),
 async(_id,_workflow,_step,status,{state})=>({previousStatus:'pending',nextStatus:status,state,changed:true}),
 async()=>({step:{id:'step'}}),async()=>{active--;return {}},async()=>({}))
const event=(id,transactionId='matter',extra={})=>({transactionId,evidenceType:'document',evidenceId:id,evidenceKey:'signed_otp',status:'approved',client,...extra})
assert.equal((await processWorkflowEvidence({...event('unmapped'),evidenceKey:'municipal_certificate_unmapped'})).mapped,false)
assert.equal(calls,0,'Unmapped documents must not initialize or rewrite workflow tables')
for(const definition of Object.values(workflowEvidenceMappings))for(const key of [definition.id,...definition.aliases])assert.equal(hasWorkflowEvidenceMapping(` ${key.toUpperCase()} `),true)
await Promise.all([processWorkflowEvidence(event('first')),processWorkflowEvidence(event('second')),processWorkflowEvidence(event('third'))])
assert.equal(maximum,1,'Evidence for the same client and transaction must serialize')
assert.deepEqual(events,['first','second','third'],'Every evidence event must be preserved in order')
maximum=0
await Promise.all([processWorkflowEvidence(event('interactive','actor-switch')),processWorkflowEvidence(event('pinned','actor-switch',{client:{}}))])
assert.equal(maximum,1,'Interactive and actor-pinned clients must serialize the same matter')
maximum=0
await Promise.all([processWorkflowEvidence(event('other-1','other-1')),processWorkflowEvidence(event('other-2','other-2'))])
assert.equal(maximum,2,'Unrelated matters must not block one another')
failNext=true
const failed=processWorkflowEvidence(event('failure','failure-test'))
const following=processWorkflowEvidence(event('following','failure-test'))
const failures=await Promise.allSettled([failed,following])
assert.equal(failures[0].status,'rejected');assert.equal(failures[1].status,'fulfilled','A failed task must not strand later evidence')
assert.equal(active,0)
hold=true
const pending=processWorkflowEvidence(event('held','held'))
await new Promise(resolve=>setTimeout(resolve,0))
let flushed=false
const flush=flushWorkflowEvidence('held',{client:{}}).then(()=>{flushed=true})
await new Promise(resolve=>setTimeout(resolve,0));assert.equal(flushed,false)
hold=false;release();await Promise.all([pending,flush]);assert.equal(flushed,true)
await assert.rejects(()=>processWorkflowEvidence({client}),/Transaction id is required/)
console.log('PASS unmapped evidence performs no database bootstrap; mapped events serialize without loss, independent matters remain parallel, failures release queues, and lifecycle/session flush waits for pending reporting.')
