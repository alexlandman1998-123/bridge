import assert from 'node:assert/strict'
import {
  clearBuyerLeadWorkspaceDataLoaderCache,
  loadBuyerLeadWorkspaceData,
} from '../buyerLeadWorkspaceDataLoader.js'

clearBuyerLeadWorkspaceDataLoaderCache()
let requestCount = 0
let resolveRequest
const buyerSnapshot = {
  leads: [{ leadId: 'buyer-1', leadCategory: 'buyer' }],
  contacts: [],
  leadActivities: [],
  tasks: [],
}
const fetchWorkspace = () => {
  requestCount += 1
  return new Promise((resolve) => { resolveRequest = resolve })
}

const firstLoad = loadBuyerLeadWorkspaceData({ organisationId: 'workspace-1', leadId: 'buyer-1', fetchWorkspace, now: () => 100 })
const concurrentLoad = loadBuyerLeadWorkspaceData({ organisationId: 'workspace-1', leadId: 'buyer-1', fetchWorkspace, now: () => 100 })
assert.equal(firstLoad, concurrentLoad, 'concurrent buyer workspace loads should share one promise')
assert.equal(requestCount, 0, 'the repository request starts in a microtask')
await Promise.resolve()
assert.equal(requestCount, 1)
resolveRequest(buyerSnapshot)
assert.equal(await firstLoad, buyerSnapshot)

const cachedLoad = await loadBuyerLeadWorkspaceData({
  organisationId: 'workspace-1',
  leadId: 'buyer-1',
  fetchWorkspace,
  now: () => 200,
})
assert.equal(cachedLoad, buyerSnapshot)
assert.equal(requestCount, 1, 'a warm buyer workspace should use the short-lived completed cache')

clearBuyerLeadWorkspaceDataLoaderCache()
let fullWorkspaceRequestCount = 0
let journeyEnrichmentRequestCount = 0
const enrichedSnapshot = await loadBuyerLeadWorkspaceData({
  organisationId: 'workspace-1',
  leadId: 'buyer-1',
  seedSnapshot: buyerSnapshot,
  fetchWorkspace: async () => {
    fullWorkspaceRequestCount += 1
    return buyerSnapshot
  },
  fetchJourneyEnrichment: async (_organisationId, _leadId, seedSnapshot) => {
    journeyEnrichmentRequestCount += 1
    assert.equal(seedSnapshot, buyerSnapshot)
    return {
      contacts: [{ contactId: 'contact-1' }],
      leadActivities: [{ activityId: 'activity-1', leadId: 'buyer-1' }],
      journeyEnrichmentStatus: 'ready',
    }
  },
  now: () => 250,
})
assert.equal(fullWorkspaceRequestCount, 0, 'a buyer seed must not trigger a duplicate full workspace query')
assert.equal(journeyEnrichmentRequestCount, 1)
assert.equal(enrichedSnapshot.leads[0].leadId, 'buyer-1')
assert.equal(enrichedSnapshot.contacts[0].contactId, 'contact-1')
assert.equal(enrichedSnapshot.leadActivities[0].activityId, 'activity-1')
assert.deepEqual(enrichedSnapshot.tasks, [])

clearBuyerLeadWorkspaceDataLoaderCache()
let sellerRequestCount = 0
const sellerFetcher = async () => {
  sellerRequestCount += 1
  return { leads: [{ leadId: 'seller-1', leadCategory: 'seller' }] }
}
await loadBuyerLeadWorkspaceData({ organisationId: 'workspace-1', leadId: 'seller-1', fetchWorkspace: sellerFetcher, now: () => 300 })
await loadBuyerLeadWorkspaceData({ organisationId: 'workspace-1', leadId: 'seller-1', fetchWorkspace: sellerFetcher, now: () => 301 })
assert.equal(sellerRequestCount, 2, 'seller snapshots must never enter the buyer workspace cache')

await assert.rejects(
  () => loadBuyerLeadWorkspaceData({ organisationId: '', leadId: '' }),
  /requires an organisation and lead/,
)

console.log('buyer lead workspace data loader tests passed')
