import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
import { publishInitialListingChannels, readInitialListingChannelResults, watchInitialListingPublication, mapPublicationJobs, refreshListingPublicationResults, retryFailedListingChannels, requireSettledListingPublication, listingPublicationBlockMessage } from '../listingInitialPublicationService'
let listingId='00000000-0000-4000-8000-000000000001'
it('explains why an under-review listing sends no adverts and how to continue', () => {
 expect(listingPublicationBlockMessage('listing_review')).toMatch(/No adverts will be sent.*Documents.*activate.*publish/)
 expect(listingPublicationBlockMessage('draft')).toMatch(/draft.*activated/)
 expect(listingPublicationBlockMessage('active')).toBe('')
 expect(listingPublicationBlockMessage('under_offer')).toBe('')
})
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

it.each(['queued', 'processing', 'dispatching', 'uncertain'])('blocks alternative publishing controls for a durable %s request', async state => {
 const deps = receiptDependencies([{ id: 'p24', channel: 'property24', state }])
 await expect(requireSettledListingPublication(listingId, ['property24'], deps)).rejects.toThrow('Check status before sending again')
 expect(deps.fetch).not.toHaveBeenCalled()
 await expect(requireSettledListingPublication(listingId, ['private_property'], deps)).resolves.toHaveLength(1)
})
it('fails closed when an alternative publishing control cannot read durable status', async () => {
 const deps = receiptDependencies([])
 deps.client.from = () => ({ select: () => ({ eq: async () => ({ error: new Error('Offline') }) }) })
 await expect(requireSettledListingPublication(listingId, ['property24'], deps)).rejects.toThrow('Offline')
 expect(deps.fetch).not.toHaveBeenCalled()
})
it.each(['queued', 'processing', 'dispatching', 'uncertain'])('blocks the Kingdom fallback control for the same durable website %s request', async state => {
 const deps = receiptDependencies([{ id: 'web', channel: 'agency_website', state }])
 await expect(requireSettledListingPublication(listingId, ['kingdom_website'], deps)).rejects.toThrow('Check status before sending again')
 expect(deps.fetch).not.toHaveBeenCalled()
})
it('restarts status watching for a retry after the initial request has finished', async () => {
 vi.useFakeTimers()
 let listener
 const dispatchEvent = vi.fn(event => { if (event.type === 'itg:initial-listing-publication') listener?.(event) })
 vi.stubGlobal('window', { dispatchEvent, addEventListener: vi.fn((name, fn) => { if (name === 'itg:initial-listing-publication') listener = fn }), removeEventListener: vi.fn() })
 const jobs = [{ id: 'p24', channel: 'property24', state: 'accepted' }]
 const deps = receiptDependencies(jobs)
 const stop = watchInitialListingPublication(listingId, { client: deps.client, interval: 10 })
 await vi.advanceTimersByTimeAsync(0)
 jobs[0].state = 'queued'; jobs[0].update_request_key = 'retry-key'
 deps.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ jobs }) })
 await publishInitialListingChannels({ ...input(), action: 'update', requestKey: 'retry-key' }, deps)
 await vi.advanceTimersByTimeAsync(10)
 expect(readInitialListingChannelResults(listingId)[0]).toMatchObject({ status: 'publishing', jobState: 'queued' })
 jobs[0].state = 'accepted'
 await vi.advanceTimersByTimeAsync(10)
 expect(readInitialListingChannelResults(listingId)[0].status).toBe('submitted')
 stop()
 expect(window.removeEventListener).toHaveBeenCalledWith('itg:initial-listing-publication', expect.any(Function))
})

it.each(['failed', 'uncertain'])('refreshes a stale %s receipt after another request succeeds, without resending', async state => {
 vi.useFakeTimers()
 const jobs = [{ id: 'p24', channel: 'property24', state, message: 'Old property type error.' }]
 const deps = receiptDependencies(jobs)
 const stop = watchInitialListingPublication(listingId, { client: deps.client, interval: 10, attentionInterval: 30 })
 await vi.advanceTimersByTimeAsync(0)
 expect(readInitialListingChannelResults(listingId)[0].status).toBe(state === 'failed' ? 'needs_attention' : 'uncertain')
 jobs[0] = { ...jobs[0], state: 'accepted', message: 'Submitted.' }
 await vi.advanceTimersByTimeAsync(30)
 expect(readInitialListingChannelResults(listingId)[0]).toMatchObject({ status: 'submitted', retryable: false, message: 'Submitted.' })
 expect(deps.fetch).not.toHaveBeenCalled()
 stop()
})

function publicationWindow() {
 const events = new EventTarget()
 const target = {
  dispatchEvent: vi.fn(event => events.dispatchEvent(event)),
  addEventListener: vi.fn((...args) => events.addEventListener(...args)),
  removeEventListener: vi.fn((...args) => events.removeEventListener(...args)),
 }
 vi.stubGlobal('window', target)
 return target
}

it.each(['focus', 'pageshow'])('checks the current receipt on %s and removes the listener when closed', async eventName => {
 vi.useFakeTimers()
 const target = publicationWindow()
 const jobs = [{ id: 'p24', channel: 'property24', state: 'failed', message: 'Old property type error.' }]
 const deps = receiptDependencies(jobs)
 const stop = watchInitialListingPublication(listingId, { client: deps.client })
 await vi.advanceTimersByTimeAsync(0)
 jobs[0] = { ...jobs[0], state: 'accepted', message: 'Submitted.' }
 target.dispatchEvent(new Event(eventName))
 await vi.advanceTimersByTimeAsync(0)
 expect(readInitialListingChannelResults(listingId)[0].status).toBe('submitted')
 expect(deps.fetch).not.toHaveBeenCalled()
 stop()
 expect(target.removeEventListener).toHaveBeenCalledWith(eventName, expect.any(Function))
})

it('keeps the newer receipt when an earlier check returns its old failure afterwards', async () => {
 vi.useFakeTimers()
 const target = publicationWindow()
 const deps = receiptDependencies([{ id: 'p24', channel: 'property24', state: 'failed' }])
 const stop = watchInitialListingPublication(listingId, { client: deps.client })
 await vi.advanceTimersByTimeAsync(0)
 const pendingReads = []
 deps.client.from = () => ({ select: () => ({ eq: () => new Promise(resolve => pendingReads.push(resolve)) }) })
 target.dispatchEvent(new Event('focus'))
 target.dispatchEvent(new Event('pageshow'))
 expect(pendingReads).toHaveLength(2)
 pendingReads[1]({ data: [{ id: 'p24', channel: 'property24', state: 'accepted', message: 'Submitted.' }] })
 await vi.advanceTimersByTimeAsync(0)
 pendingReads[0]({ data: [{ id: 'p24', channel: 'property24', state: 'failed', message: 'Old property type error.' }] })
 await vi.advanceTimersByTimeAsync(0)
 expect(readInitialListingChannelResults(listingId)[0]).toMatchObject({ status: 'submitted', message: 'Submitted.' })
 stop()
})

it('keeps a genuine failure visible, reads at the slower interval and stops checking when closed', async () => {
 vi.useFakeTimers()
 const deps = receiptDependencies([{ id: 'p24', channel: 'property24', state: 'failed', message: 'Fix the description.' }])
 const from = vi.spyOn(deps.client, 'from')
 const stop = watchInitialListingPublication(listingId, { client: deps.client, interval: 10, attentionInterval: 30 })
 await vi.advanceTimersByTimeAsync(29)
 expect(from).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(1)
 expect(from).toHaveBeenCalledTimes(2)
 expect(readInitialListingChannelResults(listingId)[0]).toMatchObject({ status: 'needs_attention', retryable: true, message: 'Fix the description.' })
 expect(deps.fetch).not.toHaveBeenCalled()
 stop()
 await vi.advanceTimersByTimeAsync(90)
 expect(from).toHaveBeenCalledTimes(2)
})

it('pauses receipt reads while the tab is hidden and refreshes on return', async () => {
 vi.useFakeTimers()
 let hidden = false
 const events = new EventTarget()
 vi.stubGlobal('document', { get hidden() { return hidden }, addEventListener: (...args) => events.addEventListener(...args), removeEventListener: (...args) => events.removeEventListener(...args) })
 const jobs = [{ id: 'p24', channel: 'property24', state: 'failed' }]
 const deps = receiptDependencies(jobs)
 const from = vi.spyOn(deps.client, 'from')
 const stop = watchInitialListingPublication(listingId, { client: deps.client, interval: 10, attentionInterval: 30 })
 await vi.advanceTimersByTimeAsync(0)
 hidden = true
 jobs[0].state = 'accepted'
 await vi.advanceTimersByTimeAsync(60)
 expect(from).toHaveBeenCalledTimes(1)
 hidden = false
 events.dispatchEvent(new Event('visibilitychange'))
 await vi.advanceTimersByTimeAsync(0)
 expect(readInitialListingChannelResults(listingId)[0].status).toBe('submitted')
 expect(from).toHaveBeenCalledTimes(2)
 stop()
})
