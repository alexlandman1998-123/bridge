import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(() => ({session:vi.fn(),activity:vi.fn(),history:vi.fn()}))
vi.mock('../../../lib/supabaseClient',() => ({isSupabaseConfigured:true,supabase:{auth:{getSession:mocks.session}}}))
vi.mock('../../privateListingService',() => ({createPrivateListingActivity:mocks.activity,getPrivateListingActivity:mocks.history}))
import { getRentalPortalStatus, updateRentalPortalStatus, loadRentalListingChannels, runRentalPublicationAction } from '../rentalListingChannelService'
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({data:{session:{access_token:'test'}}}); mocks.activity.mockResolvedValue({id:'event'}); mocks.history.mockResolvedValue([]); vi.stubGlobal('fetch',vi.fn(async () => ({ok:true,json:async()=>({})}))) })
afterEach(() => vi.unstubAllGlobals())
it('loads only stored portal status until refresh is explicitly requested',async () => {
 await getRentalPortalStatus('id','property24'); expect(fetch.mock.calls[0][0]).toContain('refresh=false')
 await getRentalPortalStatus('id','private_property'); expect(fetch.mock.calls[1][0]).toContain('cached=true')
 await getRentalPortalStatus('id','private_property',{refresh:true}); expect(fetch.mock.calls[2][0]).toContain('cached=false&recordSync=true')
})
it('retains successful channels and reports status and history failures',async () => {
 fetch.mockImplementation(async url => ({ok:!url.includes('property24'),json:async()=>url.includes('property24')?{message:'Access denied'}:{monitor:{externalStatus:'active'}}}))
 mocks.history.mockRejectedValue(new Error('History unavailable'))
 const result=await loadRentalListingChannels('id')
 expect(result.errors).toEqual({property24:'Access denied',activity:'History unavailable'}); expect(result.private_property.monitor.externalStatus).toBe('active')
})
it('rejects sales-only statuses and requires a session before requests',async () => {
 expect(()=>updateRentalPortalStatus('id','private_property','Sold')).toThrow('supported rental')
 mocks.session.mockResolvedValue({data:{session:null}})
 await expect(getRentalPortalStatus('id','property24')).rejects.toThrow('Sign in again'); expect(fetch).not.toHaveBeenCalled()
})
it('uses the existing explicit rental reactivation contract',async () => {
 await updateRentalPortalStatus('id','private_property','ToLet')
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({propertyStatus:'ToLet',environment:'production',confirm:'PRIVATE_PROPERTY_REACTIVATE:id:production'})
})
it('records submission before sending and acceptance after the portal succeeds',async () => {
 const perform=vi.fn(async()=>({report:{databaseWrite:{listingNumber:'123'}}}))
 await runRentalPublicationAction({listingId:'id',channel:'property24',action:'publish',snapshot:{headline:'Rental'},perform})
 expect(mocks.activity.mock.invocationCallOrder[0]).toBeLessThan(perform.mock.invocationCallOrder[0])
 expect(mocks.activity.mock.calls.map(([row])=>row.activityType)).toEqual(['listing_channel_publication_submitted','listing_channel_publication_accepted'])
 expect(mocks.activity.mock.calls[1][0].metadata.reference).toBe('123')
})
it('does not send if submission history cannot be persisted',async () => {
 mocks.activity.mockResolvedValue(null); const perform=vi.fn()
 await expect(runRentalPublicationAction({listingId:'id',channel:'property24',action:'publish',perform})).rejects.toThrow('could not be saved'); expect(perform).not.toHaveBeenCalled()
})
it('does not falsely record provider failure after an accepted request when history fails',async () => {
 mocks.activity.mockResolvedValueOnce({id:'submitted'}).mockResolvedValueOnce(null)
 await expect(runRentalPublicationAction({listingId:'id',channel:'property24',action:'publish',perform:async()=>({status:'SUBMITTED'})})).rejects.toMatchObject({operationAccepted:true})
 expect(mocks.activity).toHaveBeenCalledTimes(2); expect(mocks.activity.mock.calls[1][0].activityType).toBe('listing_channel_publication_accepted')
})
it('records a failed withdrawal and preserves the provider error',async () => {
 await expect(runRentalPublicationAction({listingId:'id',channel:'private_property',action:'withdraw',perform:async()=>{throw new Error('Portal unavailable')}})).rejects.toThrow('Portal unavailable')
 expect(mocks.activity.mock.calls[0][0].activityType).toBe('listing_channel_withdrawal_failed')
})
