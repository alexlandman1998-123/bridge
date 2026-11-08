import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(() => ({session:vi.fn(),activity:vi.fn(),history:vi.fn()}))
vi.mock('../../../lib/supabaseClient',() => ({isSupabaseConfigured:true,supabase:{auth:{getSession:mocks.session}}}))
vi.mock('../../privateListingService',() => ({createPrivateListingActivity:mocks.activity,getPrivateListingActivity:mocks.history}))
import { getRentalPortalStatus, updateRentalPortalStatus, loadRentalListingChannels, reconcileRentalPortalPublication, runRentalPublicationAction } from '../rentalListingChannelService'
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({data:{session:{access_token:'test'}}}); mocks.activity.mockResolvedValue({id:'event'}); mocks.history.mockResolvedValue([]); vi.stubGlobal('fetch',vi.fn(async () => ({ok:true,json:async()=>({})}))) })
afterEach(() => vi.unstubAllGlobals())
it('retains nested rejection details from status changes instead of stringifying objects',async()=>{
 fetch.mockResolvedValue({ok:false,status:422,json:async()=>({report:{status:'BLOCKED',error:{message:'Agency agent mapping is missing.'}}})})
 await expect(updateRentalPortalStatus('id','private_property','Inactive')).rejects.toThrow('Agency agent mapping is missing.')
})
it('does not accept a nested blocked result returned with HTTP 200',async()=>{
 fetch.mockResolvedValue({ok:true,status:200,json:async()=>({report:{status:'BLOCKED',error:{message:'The portal rejected this status.'}}})})
 await expect(updateRentalPortalStatus('id','private_property','Inactive')).rejects.toMatchObject({message:'The portal rejected this status.',definiteRejection:true})
})
it('saves the actual rejection reason in publication history',async()=>{
 await expect(runRentalPublicationAction({listingId:'id',channel:'property24',action:'publish',perform:async()=>({status:'BLOCKED',report:{preview:{technicalBlockers:['missing_agent_mapping']}}})})).rejects.toThrow(/Add agent mapping/)
 expect(mocks.activity.mock.calls[1][0]).toMatchObject({activityType:'listing_channel_publication_failed',metadata:{error:expect.stringContaining('Add agent mapping')}})
})
it('reads the correct sales and rental status routes without recording a new sync for edit eligibility', async () => {
 await getRentalPortalStatus('id','property24',{listingType:'sale',recordSync:false})
 expect(fetch.mock.calls[0][0]).toBe('/api/property24/listings/id/status?environment=production&refresh=false')
 await getRentalPortalStatus('id','property24',{listingType:'rental',recordSync:false})
 expect(fetch.mock.calls[1][0]).toContain('/api/property24/rentals/id/status')
 await getRentalPortalStatus('id','private_property',{recordSync:false})
 expect(fetch.mock.calls[2][0]).toContain('cached=true&recordSync=false')
})
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
it('records an uncertain withdrawal and preserves the provider error',async () => {
 await expect(runRentalPublicationAction({listingId:'id',channel:'private_property',action:'withdraw',perform:async()=>{throw new Error('Portal unavailable')}})).rejects.toThrow('Portal unavailable')
 expect(mocks.activity.mock.calls[0][0].activityType).toBe('rental_channel_publication_uncertain')
})

it('keeps uncertain provider outcomes separate from confirmed rejection',async () => {
 await expect(runRentalPublicationAction({listingId:'id',channel:'property24',action:'publish',perform:async()=>({status:'UNCERTAIN',report:{error:{message:'Receipt repair required'}}})})).rejects.toThrow('Receipt repair required')
 expect(mocks.activity.mock.calls[1][0].activityType).toBe('rental_channel_publication_uncertain')
 mocks.activity.mockClear()
 await expect(runRentalPublicationAction({listingId:'id',channel:'property24',action:'publish',perform:async()=>{throw Object.assign(new Error('Invalid payload'),{definiteRejection:true})}})).rejects.toThrow('Invalid payload')
 expect(mocks.activity.mock.calls[1][0].activityType).toBe('listing_channel_publication_failed')
})
it('uses reconciliation reads and never sends a second publish',async () => {
 fetch.mockResolvedValue({ok:true,json:async()=>({status:'UNCERTAIN',message:'Still unconfirmed'})})
 expect((await reconcileRentalPortalPublication('id','property24')).status).toBe('UNCERTAIN')
 expect(fetch.mock.calls[0][0]).toContain('/reconcile?')
 expect(fetch.mock.calls[0][1].method).toBe('POST')
 await reconcileRentalPortalPublication('id','private_property')
 expect(fetch.mock.calls[1][0]).toContain('/status?environment=production&cached=false')
 expect(fetch.mock.calls[1][1].method).toBe('GET')
})
