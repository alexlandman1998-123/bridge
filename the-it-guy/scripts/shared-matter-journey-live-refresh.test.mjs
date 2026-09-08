import assert from 'node:assert/strict'
import { createLiveRefreshQueue } from '../src/core/transactions/liveRefreshQueue.js'
import { selectStablePortalWorkspace } from '../src/core/transactions/stablePortalWorkspace.js'

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
