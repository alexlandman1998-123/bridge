import {expect,it,vi} from 'vitest'
vi.mock('../../lib/supabaseClient.js',()=>({supabase:null}))
import {loadImportedDealReviewStatuses} from '../importedDealReviewStatusService.js'
import {importedDealReviewStatus,importedDealNeedsReview,importedDealReviewLabel} from '../../core/transactions/importedDealReviewStatus.js'
const id=(n)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`
it('deduplicates, ignores invalid IDs and batches status reads with no writes',async()=>{
const rpc=vi.fn().mockResolvedValue({data:[{transactionId:id(1),status:'needs_review',totalSections:5}],error:null})
const result=await loadImportedDealReviewStatuses({transactionIds:[...Array.from({length:205},(_,i)=>id(i+1)),id(1),'invalid'],client:{rpc}})
expect(rpc).toHaveBeenCalledTimes(2);expect(rpc.mock.calls[0][1].p_transaction_ids).toHaveLength(200);expect(rpc.mock.calls[1][1].p_transaction_ids).toHaveLength(5);expect(result[id(1)].status).toBe('needs_review')
})
it('reports migration failures without presenting partial batches as reviewed',async()=>{
const rpc=vi.fn().mockResolvedValue({error:{code:'PGRST202'}})
await expect(loadImportedDealReviewStatuses({transactionIds:[id(1)],client:{rpc}})).rejects.toThrow('database update')
})
it('does not classify normal backdated transactions and keeps uncertain imports distinct',()=>{
expect(importedDealReviewStatus({id:id(1),sale_date:'2020-01-01'})).toBeNull()
const candidate=importedDealReviewStatus({id:id(1),transaction_reference:'PR-OTP-IMP-R09'})
expect(candidate.status).toBe('import_candidate');expect(importedDealNeedsReview(candidate)).toBe(true)
expect(importedDealReviewStatus({id:id(1),transaction_origin_source:'bulk_upload'},null,{unavailable:true}).status).toBe('status_unavailable')
})
it('only accepts a summary for the same transaction and uses readable labels',()=>{
const tx={id:id(1),transaction_origin_source:'bulk_upload'}
expect(importedDealReviewStatus(tx,{transactionId:id(2),status:'reviewed'}).status).toBe('needs_review')
const status=importedDealReviewStatus(tx,{transactionId:id(1),status:'reviewed',confirmedCount:5,totalSections:5})
expect(importedDealNeedsReview(status)).toBe(false);expect(importedDealReviewLabel(status)).toBe('Imported · Reviewed')
})

it('rejects an old four-section aggregate rather than keeping a green badge',async()=>{
await expect(loadImportedDealReviewStatuses({transactionIds:[id(1)],client:{rpc:vi.fn().mockResolvedValue({data:[{transactionId:id(1),status:'reviewed',confirmedCount:4,totalSections:4}]})}})).rejects.toThrow('database update')
expect(importedDealReviewStatus({id:id(1)},{transactionId:id(1),status:'reviewed',confirmedCount:4,totalSections:4}).status).toBe('status_unavailable')
})

it('handles an incomplete imported transaction before its summary arrives',()=>{
expect(importedDealReviewStatus({transaction_origin_source:'bulk_upload'},null).status).toBe('needs_review')
})
