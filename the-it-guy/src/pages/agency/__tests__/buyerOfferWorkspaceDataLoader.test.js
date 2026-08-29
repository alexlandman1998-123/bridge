import assert from 'node:assert/strict'
import {
  clearBuyerOfferWorkspaceDataLoaderCache,
  loadBuyerOfferWorkspaceData,
} from '../buyerOfferWorkspaceDataLoader.js'

clearBuyerOfferWorkspaceDataLoaderCache()
let requestCount = 0
let resolveRequest
const fetchWorkspace = (payload) => {
  requestCount += 1
  assert.deepEqual(payload.appointmentIds, ['appointment-1', 'appointment-2'])
  return new Promise((resolve) => { resolveRequest = resolve })
}
const baseRequest = {
  organisationId: 'workspace-1',
  leadId: 'buyer-1',
  appointmentIds: ['appointment-2', 'appointment-1', 'appointment-1'],
  listingIds: ['listing-1'],
  fetchWorkspace,
  now: () => 100,
}

const firstLoad = loadBuyerOfferWorkspaceData(baseRequest)
const concurrentLoad = loadBuyerOfferWorkspaceData({
  ...baseRequest,
  appointmentIds: ['appointment-1', 'appointment-2'],
})
assert.equal(firstLoad, concurrentLoad, 'concurrent offer workspace loads should share one promise')
await Promise.resolve()
assert.equal(requestCount, 1)
resolveRequest({ offers: [{ offerId: 'offer-1' }], sessions: [{ sessionId: 'session-1' }] })
assert.deepEqual(await firstLoad, {
  offers: [{ offerId: 'offer-1' }],
  sessions: [{ sessionId: 'session-1' }],
})

await loadBuyerOfferWorkspaceData({ ...baseRequest, now: () => 200 })
assert.equal(requestCount, 1, 'a warm offer workspace should use the short-lived cache')

let revisionRequestCount = 0
await loadBuyerOfferWorkspaceData({
  ...baseRequest,
  revision: 1,
  now: () => 201,
  fetchWorkspace: async () => {
    revisionRequestCount += 1
    return { offers: [], sessions: [] }
  },
})
assert.equal(revisionRequestCount, 1, 'a mutation revision must force a fresh request')

clearBuyerOfferWorkspaceDataLoaderCache()
let failedRequestCount = 0
const failingFetcher = async () => {
  failedRequestCount += 1
  throw new Error('offers unavailable')
}
await assert.rejects(
  () => loadBuyerOfferWorkspaceData({ ...baseRequest, fetchWorkspace: failingFetcher }),
  /offers unavailable/,
)
await assert.rejects(
  () => loadBuyerOfferWorkspaceData({ ...baseRequest, fetchWorkspace: failingFetcher }),
  /offers unavailable/,
)
assert.equal(failedRequestCount, 2, 'failed loads must not poison the completed cache')

await assert.rejects(
  () => loadBuyerOfferWorkspaceData({ organisationId: '', leadId: '' }),
  /requires an organisation and lead/,
)

console.log('buyer offer workspace data loader tests passed')
