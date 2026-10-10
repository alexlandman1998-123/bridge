import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
import { publishInitialListingChannels, readInitialListingChannelResults, watchInitialListingPublication, mapPublicationJobs } from '../listingInitialPublicationService'
const listingId='00000000-0000-4000-8000-000000000001'
const input = (channels=['property24']) => ({ listingId, listingStatus:'active', channels })
function dependencies() {
 return { client:{auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})}}, fetch:vi.fn(async()=>({ok:true,json:async()=>({jobs:[{id:'job',channel:'property24',state:'queued',message:'Queued for publication.'}]})})) }
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
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
  expect(readInitialListingChannelResults(listingId)[0].status).toBe('needs_attention')
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
