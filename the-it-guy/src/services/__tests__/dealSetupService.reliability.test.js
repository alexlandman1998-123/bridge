import { beforeEach, expect, it, vi } from 'vitest'
const api=vi.hoisted(()=>({parties:vi.fn(),documents:vi.fn(),requests:vi.fn()}))
vi.mock('../../lib/supabaseClient.js',()=>({supabase:null}))
vi.mock('../buyerProfileReuseService.js',()=>({listTransactionBuyerParties:api.parties}))
vi.mock('../documents/transactionCanonicalDocumentRequirementService.js',()=>({resolveTransactionDocumentRequirements:api.documents,TRANSACTION_CANONICAL_PERSISTENCE_MODES:{creationRpc:'creation_rpc'}}))
vi.mock('../documents/documentRequestCanonicalTransactionSyncService.js',()=>({syncCanonicalRequiredDocumentsForTransactionContext:api.requests}))
import {saveCanonicalDealTerms,retryDealSetupReconciliation} from '../dealSetupService.js'
function fixture(){
 const state={row:{id:'tx',updated_at:'v1',finance_type:'cash',purchase_price:100,sales_price:100},writes:[],race:false};let sequence=1
 const client={rpc:vi.fn().mockResolvedValue({data:{},error:null}),from:()=>{let patch=null;const filters=[];const q={select:()=>q,update:value=>{patch=value;return q},eq:(k,v)=>{filters.push([k,v]);return q},single:async()=>({data:{...state.row},error:null}),maybeSingle:async()=>{if(state.race&&patch?.purchase_price){state.row.updated_at='concurrent';state.race=false}if(!filters.every(([k,v])=>state.row[k]===v))return{data:null,error:null};state.writes.push(patch);Object.assign(state.row,patch,{updated_at:`v${++sequence}`});return{data:{...state.row},error:null}}};return q}}
 return {state,client}
}
const args={transactionId:'tx',expectedUpdatedAt:'v1',terms:{purchasePrice:200,depositAmount:0},finance:{type:'cash',cashAmount:200}}
beforeEach(()=>{vi.clearAllMocks();api.parties.mockResolvedValue([]);api.documents.mockResolvedValue({});api.requests.mockResolvedValue({})})
it('requeues a previously failed saved version without rewriting commercial terms',async()=>{
 const {state,client}=fixture();state.row.deal_setup_terms_version='saved-version';state.row.deal_setup_sync_status='failed'
 client.rpc.mockResolvedValue({data:{status:'failed',automatic:true},error:null})
 const retry=await retryDealSetupReconciliation({transactionId:'tx',termsVersion:'saved-version',client})
 expect(retry.reconciliation).toMatchObject({status:'failed',automatic:true});expect(state.writes).toHaveLength(0)
 expect(state.row.purchase_price).toBe(100);expect(state.row.deal_setup_terms_version).toBe('saved-version');expect(api.documents).not.toHaveBeenCalled()
})
it('rejects stale screen versions before writing or reconciling anything',async()=>{const {client,state}=fixture();await expect(saveCanonicalDealTerms({...args,expectedUpdatedAt:'old',client})).rejects.toThrow('Someone changed');expect(state.writes).toHaveLength(0);expect(client.rpc).not.toHaveBeenCalled()})
it('rejects a concurrent update between reading and saving using the database predicate',async()=>{const {client,state}=fixture();state.race=true;await expect(saveCanonicalDealTerms({...args,client})).rejects.toThrow('Someone changed');expect(state.row.purchase_price).toBe(100);expect(state.writes).toHaveLength(0)})
it('rejects retry receipts from older commercial versions',async()=>{const {client}=fixture();await expect(retryDealSetupReconciliation({transactionId:'tx',termsVersion:'stale',client})).rejects.toThrow('changed');expect(client.rpc).not.toHaveBeenCalled()})

it('leaves downstream work to the durable server queue without browser writes',async()=>{
 const {state,client}=fixture();client.rpc.mockResolvedValue({data:{status:'pending',automatic:true},error:null})
 const saved=await saveCanonicalDealTerms({...args,client})
 expect(saved.persistence.saved).toBe(true);expect(saved.reconciliation).toMatchObject({status:'pending',automatic:true})
 expect(state.writes).toHaveLength(1);expect(api.documents).not.toHaveBeenCalled();expect(api.requests).not.toHaveBeenCalled()
 expect(client.rpc).toHaveBeenCalledExactlyOnceWith('bridge_retry_deal_setup_reconciliation',{p_transaction_id:'tx',p_terms_version:state.row.deal_setup_terms_version})
})

it('keeps an accepted save pending if the queue response is lost; it never retries business writes in the browser',async()=>{
 const {state,client}=fixture();client.rpc.mockResolvedValue({error:{code:'NETWORK',message:'response lost'}})
 const saved=await saveCanonicalDealTerms({...args,client})
 expect(saved.persistence.saved).toBe(true);expect(saved.reconciliation.status).toBe('pending')
 expect(state.row.deal_setup_sync_status).toBe('pending');expect(state.writes).toHaveLength(1);expect(api.documents).not.toHaveBeenCalled()
})

it('does not bypass queue authorization failures through browser writes',async()=>{
 const {client,state}=fixture();state.row.deal_setup_terms_version='version'
 client.rpc.mockResolvedValue({error:{code:'42501',message:'permission denied'}})
 await expect(retryDealSetupReconciliation({transactionId:'tx',termsVersion:'version',client})).rejects.toMatchObject({code:'42501'})
 expect(api.documents).not.toHaveBeenCalled();expect(state.writes).toHaveLength(0)
})
