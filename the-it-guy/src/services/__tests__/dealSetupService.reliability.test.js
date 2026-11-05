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
it('atomically marks saved terms pending and preserves a retryable receipt when attorney reconciliation fails',async()=>{
 const {state,client}=fixture();client.rpc.mockResolvedValueOnce({data:null,error:Error('Attorney unavailable')}).mockResolvedValue({data:{},error:null})
 const result=await saveCanonicalDealTerms({...args,client});expect(result.persistence.saved).toBe(true);expect(result.reconciliation.status).toBe('failed');expect(state.writes[0]).toMatchObject({purchase_price:200,sales_price:200,deal_setup_sync_status:'pending'});expect(state.row.deal_setup_sync_status).toBe('failed');expect(api.documents).toHaveBeenCalledOnce()
 const version=state.row.deal_setup_terms_version;const retry=await retryDealSetupReconciliation({transactionId:'tx',termsVersion:version,client});expect(retry.reconciliation.status).toBe('complete');expect(state.writes.filter(p=>p.purchase_price!==undefined)).toHaveLength(1);expect(state.row.deal_setup_terms_version).toBe(version)
})
it('rejects stale screen versions before writing or reconciling anything',async()=>{const {client,state}=fixture();await expect(saveCanonicalDealTerms({...args,expectedUpdatedAt:'old',client})).rejects.toThrow('Someone changed');expect(state.writes).toHaveLength(0);expect(client.rpc).not.toHaveBeenCalled()})
it('rejects a concurrent update between reading and saving using the database predicate',async()=>{const {client,state}=fixture();state.race=true;await expect(saveCanonicalDealTerms({...args,client})).rejects.toThrow('Someone changed');expect(state.row.purchase_price).toBe(100);expect(state.writes).toHaveLength(0)})
it('rejects retry receipts from older commercial versions',async()=>{const {client}=fixture();await expect(retryDealSetupReconciliation({transactionId:'tx',termsVersion:'stale',client})).rejects.toThrow('changed');expect(client.rpc).not.toHaveBeenCalled()})
