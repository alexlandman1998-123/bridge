import {expect,it,vi,beforeEach} from 'vitest'
const downstream=vi.hoisted(()=>({sync:vi.fn(),handoff:vi.fn()}))
vi.mock('../dealSetupService.js',()=>({syncDealSetupDownstream:downstream.sync,syncDealSetupAttorneyHandoff:downstream.handoff}))
beforeEach(()=>{vi.clearAllMocks();downstream.sync.mockResolvedValue({});downstream.handoff.mockResolvedValue({})})
vi.mock('../../lib/supabaseClient.js',()=>({supabase:null}))
import {createReviewSourceUrl,loadTransactionDetailReview,saveTransactionDetailReview} from '../transactionDetailReviewService.js'
import {reviewSectionDetails} from '../../core/transactions/transactionDetailReview.js'
const id='11111111-1111-4111-8111-111111111111'
it('sends the expected snapshot and revision, with whitelisted fields',async()=>{
const current={...reviewSectionDetails('seller'),name:'Seller'}
const client={rpc:vi.fn().mockResolvedValue({data:{transactionId:id},error:null})}
await saveTransactionDetailReview({transactionId:id,section:'seller',details:{...current,name:'Correct',assigned_attorney_email:'spoof'},review:{transactionId:id,sections:[{key:'seller',revision:4,currentSnapshot:current}],documents:[]},client})
expect(client.rpc).toHaveBeenCalledWith('bridge_save_transaction_detail_review',expect.objectContaining({p_expected_snapshot:current,p_expected_revision:4,p_confirm:false,p_details:{...current,name:'Correct'}}))
})
it('rejects confirmation without attestation and a usable source before calling the server',async()=>{
const rpc=vi.fn();await expect(saveTransactionDetailReview({transactionId:id,section:'seller',details:reviewSectionDetails('seller',{name:'Seller'}),review:{transactionId:id,sections:[{key:'seller',revision:0,currentSnapshot:{}}],documents:[]},confirm:true,client:{rpc}})).rejects.toThrow('source PDF');expect(rpc).not.toHaveBeenCalled()
})
it('reports a missing migration as an actionable feature error',async()=>{
await expect(loadTransactionDetailReview({transactionId:id,client:{rpc:vi.fn().mockResolvedValue({error:{code:'PGRST202'}})}})).rejects.toThrow('database update')
})
it('uses expiring signed storage links and refuses external paths',async()=>{
const createSignedUrl=vi.fn().mockResolvedValue({data:{signedUrl:'signed'}});const from=vi.fn(()=>({createSignedUrl}))
expect(await createReviewSourceUrl({document:{available:true,filePath:'source.pdf',bucket:'documents'},client:{storage:{from}}})).toBe('signed');expect(createSignedUrl).toHaveBeenCalledWith('source.pdf',300)
await expect(createReviewSourceUrl({document:{available:true,filePath:'https://outside/source.pdf'}})).rejects.toThrow('recovery')
})

it('refreshes document requirements after saving funding and reports a downstream failure without losing the save',async()=>{
const current=reviewSectionDetails('funding',{purchasePrice:'1000000',financeType:'bond',bondAmount:'1000000',managedBy:'client'})
const saved={transactionId:id};const client={rpc:vi.fn().mockResolvedValue({data:saved,error:null})};const input={transactionId:id,section:'funding',details:current,review:{transactionId:id,sections:[{key:'funding',revision:0,currentSnapshot:current}],documents:[]},client}
expect((await saveTransactionDetailReview(input)).review).toEqual(saved)
expect(downstream.sync).toHaveBeenCalledWith({transactionId:id,client});expect(downstream.handoff).toHaveBeenCalledWith({transactionId:id,client})
downstream.sync.mockRejectedValueOnce(new Error('Unavailable'))
const result=await saveTransactionDetailReview(input);expect(result.review).toEqual(saved);expect(result.refreshWarning).toContain('document requirements could not be refreshed')
})

it('rejects an old four-section review with an actionable update message',async()=>{
await expect(loadTransactionDetailReview({transactionId:id,client:{rpc:vi.fn().mockResolvedValue({data:{sections:['buyer','seller','property','attorney'].map(key=>({key}))}})}})).rejects.toThrow('database update')
})

it('normalises imported funding aliases only on save while keeping the expected snapshot intact',async()=>{
 const current=reviewSectionDetails('funding',{purchasePrice:'1000000',financeType:' Combination ',cashAmount:'300000',bondAmount:'700000',managedBy:'client'})
 const client={rpc:vi.fn().mockResolvedValue({data:{transactionId:id},error:null})}
 await saveTransactionDetailReview({transactionId:id,section:'funding',details:current,review:{transactionId:id,sections:[{key:'funding',revision:1,currentSnapshot:current}],documents:[]},client})
 expect(client.rpc).toHaveBeenCalledWith('bridge_save_transaction_detail_review',expect.objectContaining({p_expected_snapshot:current,p_details:expect.objectContaining({financeType:'hybrid',cashAmount:'300000',bondAmount:'700000'})}))
 expect(current.financeType).toBe('Combination')
})

it('blocks unreconciled funding confirmation before issuing a save request while allowing a draft',async()=>{
 const details=reviewSectionDetails('funding',{purchasePrice:'1000',depositAmount:'100',financeType:'hybrid',cashAmount:'100',bondAmount:'800',managedBy:'client'})
 const client={rpc:vi.fn().mockResolvedValue({data:{transactionId:id},error:null})};const input={transactionId:id,section:'funding',details,review:{transactionId:id,sections:[{key:'funding',revision:0,currentSnapshot:details}],documents:[{id:'pdf',available:true}]},sourceDocumentId:'pdf',attested:true,client}
 await expect(saveTransactionDetailReview({...input,confirm:true})).rejects.toThrow('Cash plus bond must equal');expect(client.rpc).not.toHaveBeenCalled()
 await saveTransactionDetailReview(input);expect(client.rpc).toHaveBeenCalledOnce()
})
