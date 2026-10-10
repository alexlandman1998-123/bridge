import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
import { publishInitialListingChannels, readInitialListingChannelResults, watchInitialListingPublication, mapPublicationJobs, refreshListingPublicationResults, retryFailedListingChannels } from '../listingInitialPublicationService'
let listingId='00000000-0000-4000-8000-000000000001'
const input = (channels=['property24']) => ({ listingId, listingStatus:'active', channels })
function dependencies() {
 return { client:{auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})}}, fetch:vi.fn(async()=>({ok:true,json:async()=>({jobs:[{id:'job',channel:'property24',state:'queued',message:'Queued for publication.'}]})})) }
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();listingId=crypto.randomUUID()})
describe('durable initial publication',()=>{
 it.each(['sale','rental','developer'])('queues %s via the same durable endpoint and never calls providers from the browser',async listingType=>{
  const deps=dependencies(); const result=await publishInitialListingChannels({...input(['property24','property24']),listingType},deps)
  expect(deps.fetch).toHaveBeenCalledTimes(1)
  expect(deps.fetch.mock.calls[0][0]).toBe('/api/listings/publication-jobs')
  expect(JSON.parse(deps.fetch.mock.calls[0][1].body)).toEqual({listingId,channels:['property24']})
  expect(result[0]).toMatchObject({status:'publishing',jobId:'job'})
 })
 it('keeps drafts private',async()=>{
  const deps=dependencies();expect(await publishInitialListingChannels({...input(),listingStatus:'draft'},deps)).toEqual([]);expect(deps.fetch).not.toHaveBeenCalled()
 })
 it('waits for durable acceptance and preserves failures for recovery',async()=>{
  const deps=dependencies();let finish;deps.fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  let done=false;const pending=publishInitialListingChannels(input(),deps).then(()=>{done=true})
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));expect(done).toBe(false)
  finish({ok:true,json:async()=>({jobs:[{id:'same-job',channel:'property24',state:'queued'}]})});await pending;expect(done).toBe(true)
  deps.fetch.mockRejectedValueOnce(new Error('Connection lost'))
  await expect(publishInitialListingChannels(input(),deps)).rejects.toThrow('Connection lost')
  expect(readInitialListingChannelResults(listingId)[0].status).toBe('uncertain')
  expect(deps.fetch).toHaveBeenCalledTimes(2)
 })
 it('rejects partial queue acknowledgements instead of abandoning a selected channel',async()=>{
  await expect(publishInitialListingChannels(input(['property24','private_property']),dependencies())).rejects.toThrow('could not be confirmed')
 })
 it('maps uncertain and failed receipts without claiming a live listing',()=>{
  expect(mapPublicationJobs(['accepted','uncertain','failed','cancelled'].map(state=>({channel:'property24',state}))).map(row=>row.status)).toEqual(['submitted','uncertain','needs_attention','needs_attention'])
 })
 it('recovers job receipts after reload and stops polling when finished',async()=>{
  vi.useFakeTimers();const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent})
  const responses=[{data:[{id:'job',channel:'property24',state:'dispatching'}]},{data:[{id:'job',channel:'property24',state:'accepted'}]}]
  const eq=vi.fn(async()=>responses.shift());const client={from:()=>({select:()=>({eq})})}
  const stop=watchInitialListingPublication(listingId,{client,interval:10});await vi.advanceTimersByTimeAsync(0)
  expect(readInitialListingChannelResults(listingId)[0].status).toBe('publishing')
  await vi.advanceTimersByTimeAsync(10);expect(readInitialListingChannelResults(listingId)[0].status).toBe('submitted')
  await vi.advanceTimersByTimeAsync(100);expect(eq).toHaveBeenCalledTimes(2)
  expect(dispatchEvent.mock.calls.filter(([e])=>e.type==='itg:listings-updated')).toHaveLength(1);stop()
 })
})

it.each(['sale','rental','developer'])('queues saved %s updates for every selected channel', async listingType => {
 const deps=dependencies()
 deps.fetch.mockResolvedValue({ok:true,json:async()=>({jobs:['property24','private_property','agency_website'].map(channel=>({id:channel,channel,state:'queued'}))})})
 const requestKey='00000000-0000-4000-8000-000000000009'
 const result=await publishInitialListingChannels({...input(['property24','private_property','agency_website']),listingType,action:'update',requestKey},deps)
 expect(JSON.parse(deps.fetch.mock.calls[0][1].body)).toEqual({listingId,channels:['property24','private_property','agency_website'],action:'update',requestKey})
 expect(result).toHaveLength(3)
})

function receiptDependencies(jobs) {
 const deps = dependencies()
 deps.client.from = () => ({ select: () => ({ eq: async () => ({ data: jobs }) }) })
 return deps
}
it('rechecks durable receipts and retries only confirmed failures in selected channels', async () => {
 const jobs = [
  { id:'p24',channel:'property24',state:'accepted' },
  { id:'pp',channel:'private_property',state:'failed',message:'Fix the description.' },
  { id:'web',channel:'agency_website',state:'uncertain' },
 ]
 const deps=receiptDependencies(jobs)
 deps.fetch.mockResolvedValue({ok:true,json:async()=>({jobs:[{...jobs[1],state:'queued'}]})})
 await retryFailedListingChannels({...input(['property24','private_property','agency_website']),requestKey:'retry-key'},deps)
 expect(JSON.parse(deps.fetch.mock.calls[0][1].body)).toEqual({listingId,channels:['private_property'],action:'update',requestKey:'retry-key'})
 expect(readInitialListingChannelResults(listingId).map(row=>[row.key,row.status])).toEqual([['property24','submitted'],['agency_website','uncertain'],['private_property','publishing']])
})
it.each(['accepted','queued','processing','dispatching','uncertain'])('does not replay a %s receipt even if the screen previously showed a failure', async state => {
 const deps=receiptDependencies([{id:'p24',channel:'property24',state}])
 expect(await retryFailedListingChannels({...input(),requestKey:'retry-key'},deps)).toEqual([])
 expect(deps.fetch).not.toHaveBeenCalled()
})
it('does not retry if the authoritative status cannot be read', async () => {
 const deps=receiptDependencies([])
 deps.client.from=()=>({select:()=>({eq:async()=>({error:new Error('Offline')})})})
 await expect(retryFailedListingChannels({...input(),requestKey:'retry-key'},deps)).rejects.toThrow('Offline')
 expect(deps.fetch).not.toHaveBeenCalled()
})
it('restores terminal receipts in setup after a full reload', async () => {
 const deps=receiptDependencies([{id:'p24',channel:'property24',state:'failed',message:'Description required.'}])
 expect(await refreshListingPublicationResults(listingId,deps)).toEqual([expect.objectContaining({retryable:true,status:'needs_attention'})])
})

it('does not mistake an older successful receipt for an update whose response was lost', async () => {
 const id='00000000-0000-4000-8000-000000000099'
 const deps=receiptDependencies([{id:'p24',channel:'property24',state:'accepted',update_request_key:'old-request'}])
 deps.fetch.mockRejectedValueOnce(new Error('Connection lost'))
 await expect(publishInitialListingChannels({...input(),listingId:id,action:'update',requestKey:'new-request'},deps)).rejects.toThrow('Connection lost')
 expect((await refreshListingPublicationResults(id,deps))[0]).toMatchObject({status:'needs_attention',retryable:false,message:'These saved changes were not queued. Send them from Review.'})
 deps.client.from=()=>({select:()=>({eq:async()=>({data:[{id:'p24',channel:'property24',state:'accepted',update_request_key:'new-request'}]})})})
 expect((await refreshListingPublicationResults(id,deps))[0].status).toBe('submitted')
})

it('ignores an older status read that completes after a new update is queued', async () => {
 const deps=receiptDependencies([{id:'old',channel:'property24',state:'accepted',update_request_key:'old-request'}])
 await publishInitialListingChannels({...input(),action:'update',requestKey:'new-request'},deps)
 expect((await refreshListingPublicationResults(listingId,deps))[0].status).toBe('publishing')
})
it('does not replace current progress after the status watcher is cancelled', async () => {
 const deps=receiptDependencies([{id:'old',channel:'property24',state:'accepted'}])
 await publishInitialListingChannels(input(),deps)
 await refreshListingPublicationResults(listingId,{...deps,shouldApply:()=>false})
 expect(readInitialListingChannelResults(listingId)[0].status).toBe('publishing')
})
