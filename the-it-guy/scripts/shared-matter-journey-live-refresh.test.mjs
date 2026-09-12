import assert from 'node:assert/strict'
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
console.log('Live refresh: retry, acknowledgement, coalescing, disposal and portal revision guards passed.')
