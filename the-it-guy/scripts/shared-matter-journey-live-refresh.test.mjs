import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createLiveRefreshQueue } from '../src/core/transactions/liveRefreshQueue.js'
import { selectStablePortalWorkspace } from '../src/core/transactions/stablePortalWorkspace.js'
import { shouldRefreshPortalDetails } from '../src/core/transactions/portalRefreshPolicy.js'

let calls = 0, errors = 0, fail = true
const queue = createLiveRefreshQueue({ refresh: async () => { calls++; if (fail) throw Error('offline') }, onError: () => errors++ })
await queue.request({ version: 5 })
assert.equal(queue.acknowledged, -1)
assert.equal(errors, 1)
fail = false
await queue.request({ version: 5 })
assert.equal(queue.acknowledged, 5)
await queue.request({ version: 4 })
assert.equal(calls, 2)
await queue.request({ reason: 'focus' })
assert.equal(calls, 3)

let release, reads = 0, successes = 0
const racing = createLiveRefreshQueue({ refresh: async () => { reads++; if (reads === 1) await new Promise(r => { release = r }) }, onSuccess: () => successes++ })
const first = racing.request({ version: 1 })
await Promise.resolve()
racing.request({ version: 2 })
racing.request({ version: 3 })
release()
await first
assert.equal(reads, 2)
assert.equal(racing.acknowledged, 3)
assert.equal(successes, 2)

let unblock, boundedReads = 0
const bounded = createLiveRefreshQueue({ refresh: async () => {
  boundedReads++
  if (boundedReads === 1) await new Promise(resolve => { unblock = resolve })
} })
const slow = bounded.request({ version: 8 })
await Promise.resolve()
assert.equal(bounded.busy, true)
for (let n = 0; n < 20; n++) {
  bounded.request({ version: 8 })
  bounded.request({ reason: 'portal_poll', idleOnly: true })
}
unblock()
await slow
assert.equal(boundedReads, 1, 'unchanged signals and polls must not perpetuate a slow read')
assert.equal(bounded.busy, false)
await bounded.request({ version: 9 })
assert.equal(boundedReads, 2, 'a genuine new revision must still refresh')
assert.equal(shouldRefreshPortalDetails({ previousRevision: 8, revision: 8, lastFullReadAt: 1000, now: 16000 }), false)
assert.equal(shouldRefreshPortalDetails({ previousRevision: 8, revision: 9, lastFullReadAt: 1000, now: 16000 }), true)
assert.equal(shouldRefreshPortalDetails({ previousRevision: 8, revision: 8, lastFullReadAt: 1000, now: 61000 }), true)

// Exercise the portal callback itself: a linked matter without a ready legal
// projection must still reconcile agent/listing changes through secure reads.
const portalSource = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const callbackSource = portalSource.match(/useTransactionLiveRefresh\(\{[\s\S]*?onRefresh: async \(\) => \{([\s\S]*?)\n    },\n    enabled:/)?.[1]
assert.ok(callbackSource, 'portal transaction refresh callback must be present')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const refreshPortal = new AsyncFunction('context', `const { portalLoadScopeRef, hydratingPortal, portalDetailsRefreshRef, fetchClientPortalJourneySnapshotByToken, token, portalDataWorkspace, sellerPortalAccessToken, setWorkspaceData, workspaceData, shouldRefreshPortalDetails, selectStablePortalWorkspace, loadPortal, Date } = context; ${callbackSource}`)
for (const legalJourney of [undefined, { status: 'unavailable', retryable: true }, { status: 'denied', retryable: false }]) {
  let secureReads = 0
  const fullReadRef = { current: { scope: 'seller', at: 1000 } }
  const context = {
    portalLoadScopeRef: { current: 'seller' }, hydratingPortal: false,
    portalDetailsRefreshRef: fullReadRef,
    fetchClientPortalJourneySnapshotByToken: async () => ({ legalJourney }),
    token: 'seller-test', portalDataWorkspace: 'selling', sellerPortalAccessToken: 'test-session',
    setWorkspaceData: () => {}, workspaceData: {}, selectStablePortalWorkspace,
    shouldRefreshPortalDetails: (args) => shouldRefreshPortalDetails({ ...args, now: 16000 }),
    loadPortal: async () => { secureReads++; return true }, Date: { now: () => 16000 },
  }
  assert.equal(await refreshPortal(context), false, 'a missing legal journey must not trigger a heavy read every poll')
  assert.equal(secureReads, 0)
  context.shouldRefreshPortalDetails = (args) => shouldRefreshPortalDetails({ ...args, now: 61000 })
  context.Date = { now: () => 61000 }
  assert.equal(await refreshPortal(context), true, 'listing data must reconcile even before the legal journey is ready')
  assert.equal(secureReads, 1)
  assert.equal(fullReadRef.current.at, 61000)
}

let finish, committed = 0
const disposed = createLiveRefreshQueue({ refresh: () => new Promise(r => { finish = r }), onSuccess: () => committed++ })
const inFlight = disposed.request({ version: 10 })
await Promise.resolve()
disposed.request({ version: 11 })
disposed.stop()
finish()
await inFlight
assert.equal(committed, 0)
assert.equal(disposed.acknowledged, -1)

const falseResult = createLiveRefreshQueue({ refresh: async () => false })
await falseResult.request({ version: 7 })
assert.equal(falseResult.acknowledged, -1)
const workspace = (revision, transactionId = 'matter') => ({ transactionJourneySnapshot: {
  legalJourney: { status: 'ready', snapshot: { transactionId, revision } },
} })
const latest = workspace(9), stale = workspace(8)
assert.equal(selectStablePortalWorkspace(latest, stale).transactionJourneySnapshot.legalJourney.snapshot.revision, 9)
assert.equal(selectStablePortalWorkspace(latest, workspace(10)).transactionJourneySnapshot.legalJourney.snapshot.revision, 10)
assert.equal(selectStablePortalWorkspace(latest, workspace(1, 'other')).transactionJourneySnapshot.legalJourney.snapshot.revision, 1)
const unavailable = { transactionJourneySnapshot: { legalJourney: { status: 'unavailable', snapshot: null } } }
assert.equal(selectStablePortalWorkspace(latest, unavailable), unavailable)
assert.equal(selectStablePortalWorkspace(latest, null), null)
const savedAppointments = [{ id: 'booking', status: 'Confirmed', participants: [{ rsvpStatus: 'Accepted' }] }]
const savedWorkspace = { ...latest, appointments: savedAppointments, legacyPortalData: { appointments: savedAppointments } }
const olderWorkspace = { ...stale, appointments: [{ id: 'booking', status: 'Pending Confirmation' }], legacyPortalData: { appointments: [{ id: 'booking', status: 'Pending Confirmation' }] } }
assert.deepEqual(selectStablePortalWorkspace(savedWorkspace, olderWorkspace).appointments, savedAppointments)
assert.deepEqual(selectStablePortalWorkspace(savedWorkspace, olderWorkspace).legacyPortalData.appointments, savedAppointments)
assert.equal(selectStablePortalWorkspace(savedWorkspace, unavailable), unavailable, 'A denied or unavailable read must not revive older appointments.')
const nextWorkspace = { ...workspace(10), appointments: [{ id: 'booking', status: 'Cancelled' }] }
assert.equal(selectStablePortalWorkspace(savedWorkspace, nextWorkspace), nextWorkspace)
console.log('Live refresh: retry, acknowledgement, coalescing, disposal and portal revision guards passed.')

// Exercise the actual background loader: a seller reconciliation must request
// full data, preserve approved uploads on failure, and clear data on denial.
const backgroundBody = portalSource.match(/    if \(background\) \{([\s\S]*?)\n    const startedAt = Date\.now\(\)/)?.[1]
assert.ok(backgroundBody)
const backgroundLoader = new AsyncFunction('context', `const { isCurrentLoad, setError, setHydratingPortal, withClientPortalLoadTimeout, isDemoRoute, getProspectDemoClientPortalWorkspaceData, token, portalDataWorkspace, getClientPortalWorkspaceData, isSellerPortalToken, effectiveSellerPortalAccessToken, CLIENT_PORTAL_BACKGROUND_LOAD_TIMEOUT_MS, portalContextsRef, setWorkspaceData, selectStablePortalWorkspace, setPortal, setSellerPortalAuth, isSellerPortalAuthRequiredError, requireSellerReauthentication, console } = context; if (true) { ${backgroundBody}`)
let displayedWorkspace = { documentCenter: { uploadedDocuments: [{ id: 'approved', status: 'approved' }] } }
let displayedPortal = { listing: { id: 'listing' } }
let requestedMode
const completeWorkspace = { documentCenter: { uploadedDocuments: [{ id: 'approved', status: 'approved' }] }, legacyPortalData: displayedPortal }
const refreshContext = {
  isCurrentLoad: () => true, setError: () => {}, setHydratingPortal: () => {},
  withClientPortalLoadTimeout: (promise) => promise, isDemoRoute: false,
  token: 'seller-link', portalDataWorkspace: 'seller', isSellerPortalToken: true,
  effectiveSellerPortalAccessToken: 'session', CLIENT_PORTAL_BACKGROUND_LOAD_TIMEOUT_MS: 15000,
  portalContextsRef: { current: {} },
  getClientPortalWorkspaceData: async (_, __, options) => { requestedMode = options.mode; return completeWorkspace },
  setWorkspaceData: (update) => { displayedWorkspace = typeof update === 'function' ? update(displayedWorkspace) : update },
  selectStablePortalWorkspace, setPortal: (value) => { displayedPortal = value }, setSellerPortalAuth: () => {},
  isSellerPortalAuthRequiredError: () => false, requireSellerReauthentication: () => {},
  console: { log() {}, warn() {} },
}
assert.equal(await backgroundLoader(refreshContext), true)
assert.equal(requestedMode, 'full')
assert.equal(displayedWorkspace.documentCenter.uploadedDocuments[0].status, 'approved')
refreshContext.getClientPortalWorkspaceData = async () => { throw new Error('Temporary timeout') }
assert.equal(await backgroundLoader(refreshContext), false)
assert.equal(displayedWorkspace.documentCenter.uploadedDocuments[0].status, 'approved')
refreshContext.getClientPortalWorkspaceData = async () => { throw Object.assign(new Error('Denied'), { code: '42501' }) }
assert.equal(await backgroundLoader(refreshContext), false)
assert.equal(displayedWorkspace, null)
assert.equal(displayedPortal, null)
console.log('Seller reconciliation: complete snapshot, temporary failure retention and denied-access clearing passed.')
