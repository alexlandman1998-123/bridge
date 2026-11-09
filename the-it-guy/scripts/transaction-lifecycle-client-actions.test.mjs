import { readDomainDeclarationSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'
import { requireLifecycleActionReceipt } from '../src/services/transactionLifecycleCommitService.js'
import {readFile} from 'node:fs/promises'
let role='attorney',context={lifecycleState:'completed',transaction:{registered_at:'registered',completed_at:'completed'}},calls=[]
const client={from(){throw Error('A retired actor must not perform follow-up writes/reads')},async rpc(name,args){calls.push({name,args});return {data:{id:'fixture',lifecycle_state:args.p_action==='archive'?'archived':args.p_action==='cancel'?'cancelled':'completed'},error:null}}}
const deps={requireLifecycleActionReceipt,requireClient:()=>client,resolveActiveProfileContext:async()=>({role}),hasLifecycleWritePermission:r=>['attorney','developer','internal_admin'].includes(r),loadTransactionLifecycleContext:async()=>context,normalizeNullableText:v=>String(v||'').trim()||null,normalizeTextValue:v=>String(v||'').trim()}
function load(name){return new Function(...Object.keys(deps),readDomainDeclarationSource(name)+';return '+name)(...Object.values(deps))}
const archive=load('archiveTransactionLifecycle'),restore=load('unarchiveTransactionLifecycle'),cancel=load('cancelTransactionLifecycle')
assert.equal((await archive({transactionId:'fixture',reason:' controlled '})).lifecycle_state,'archived')
assert.deepEqual(calls.at(-1),{name:'bridge_apply_transaction_lifecycle_action',args:{p_transaction_id:'fixture',p_action:'archive',p_reason:'controlled'}})
context={...context,lifecycleState:'archived'};assert.equal((await restore('fixture')).lifecycle_state,'completed')
context={lifecycleState:'active',transaction:{}};assert.equal((await cancel({transactionId:'fixture',reason:' withdrawn '})).lifecycle_state,'cancelled')
assert.equal(calls.at(-1).args.p_reason,'withdrawn')
const before=calls.length;role='agent';await assert.rejects(()=>archive({transactionId:'fixture'}),/permission/);role='attorney'
await assert.rejects(()=>archive({transactionId:'fixture'}),/Only Registered or Completed/)
await assert.rejects(()=>restore('fixture'),/not archived/)
await assert.rejects(()=>cancel({transactionId:'fixture',reason:''}),/reason is required/)
context={lifecycleState:'completed',transaction:{completed_at:'closed'}};await assert.rejects(()=>cancel({transactionId:'fixture',reason:'bad'}),/Undo registration/)
assert.equal(calls.length,before)
// Bind the actual receipt validator: a mismatched saved row cannot count as success.
const rpc = client.rpc
client.rpc = async () => ({ data: { id: 'another-transaction', lifecycle_state: 'archived' }, error: null })
await assert.rejects(archive({ transactionId: 'fixture' }), { code: 'TRANSACTION_LIFECYCLE_UNCONFIRMED' })
client.rpc = rpc
const unit=await readFile(new URL('../src/pages/UnitDetail.jsx',import.meta.url),'utf8')
const unitFn=unit.slice(unit.indexOf('  async function confirmArchiveTransactionFromWorkspace()'),unit.indexOf('  async function handleSignOffIssue('))
let invoked=false,loaded=0,errors=[]
const unitDeps={transaction:{id:'fixture'},setError:v=>errors.push(v),setArchivingTransaction:()=>{},setArchiveTransactionConfirmOpen:()=>{},archiveTransactionLifecycle:async value=>{assert.equal(value.transactionId,'fixture');invoked=true},window:{dispatchEvent(){}},Event:class{constructor(type){this.type=type}},loadDetail:async()=>{loaded++}}
await new Function(...Object.keys(unitDeps),unitFn+';return confirmArchiveTransactionFromWorkspace')(...Object.values(unitDeps))()
assert.ok(invoked);assert.equal(loaded,1);assert.deepEqual(errors,[''])
const attorney=await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx',import.meta.url),'utf8')
const handler=attorney.slice(attorney.indexOf('  async function handleSubmitReasonAction()'),attorney.indexOf('  async function handlePrintFinalReport()'))
for(const action of ['archive','cancel','undo_registration']){
 let refreshed=0,navigated=[],saving=[],events=[];errors=[]
 const d={currentMatterAccessKey:'scope',liveMatterScopeRef:{current:'scope'},setLifecycleActionNotice:()=>{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},transaction:{id:'fixture'},reasonDraft:'Controlled reason',reasonDialog:{action,reasonRequired:true},setSaving:v=>saving.push(v),setError:v=>errors.push(v),undoTransactionRegistration:async()=>{},archiveTransactionLifecycle:async()=>{},cancelTransactionLifecycle:async()=>{},setReasonDialog:()=>{},setReasonDraft:()=>{},window:{dispatchEvent(event){events.push(event)}},Event:unitDeps.Event,loadData:async()=>{refreshed++},navigate:(...args)=>navigated.push(args),workspaceBackPath:'/transactions'}
 await new Function(...Object.keys(d),handler+';return handleSubmitReasonAction')(...Object.values(d))()
 assert.deepEqual(errors,['']);assert.deepEqual(saving,[true,false]);assert.equal(events.length,1);assert.equal(events[0].type,'itg:transaction-updated');assert.equal(events[0].detail.transactionId,'fixture')
 if(action==='undo_registration'){assert.equal(refreshed,0);assert.deepEqual(navigated,[])}else{assert.equal(refreshed,0);assert.deepEqual(navigated,[['/transactions',{replace:true}]])}
}
console.log('PASS real client lifecycle functions use atomic commands without retired-access follow-ups; invalid transitions/roles fail before RPC; actual unit handler passes the correct object; archive/cancel UI exits retired views while every action emits the canonical refresh event.')
