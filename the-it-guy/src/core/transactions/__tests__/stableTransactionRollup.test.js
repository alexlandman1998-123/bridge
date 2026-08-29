import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasCanonicalTransactionJourney,
  selectStableTransactionRollup,
} from '../stableTransactionRollup.js'

function createRollup({ transactionId = 'tx-1', derivedAt = '2026-08-29T08:00:00.000Z', canonical = true } = {}) {
  return {
    transactionId,
    derivedAt,
    transactionJourneySnapshot: canonical
      ? {
          schemaVersion: 1,
          transactionId,
          derivedAt,
          milestones: [{ key: 'otp', label: 'OTP', status: 'current' }],
        }
      : null,
  }
}

test('retains a resolved rollup when a duplicate request returns null', () => {
  const resolved = createRollup()
  assert.equal(selectStableTransactionRollup(resolved, null, { transactionId: 'tx-1' }), resolved)
})

test('does not replace a canonical journey with a legacy-only response', () => {
  const resolved = createRollup()
  const legacy = createRollup({ canonical: false, derivedAt: '2026-08-29T08:01:00.000Z' })
  assert.equal(selectStableTransactionRollup(resolved, legacy, { transactionId: 'tx-1' }), resolved)
})

test('does not let an older response win a request race', () => {
  const newest = createRollup({ derivedAt: '2026-08-29T08:05:00.000Z' })
  const older = createRollup({ derivedAt: '2026-08-29T08:02:00.000Z' })
  assert.equal(selectStableTransactionRollup(newest, older, { transactionId: 'tx-1' }), newest)
})

test('accepts a newer canonical response for the active transaction', () => {
  const previous = createRollup({ derivedAt: '2026-08-29T08:02:00.000Z' })
  const newest = createRollup({ derivedAt: '2026-08-29T08:05:00.000Z' })
  assert.equal(selectStableTransactionRollup(previous, newest, { transactionId: 'tx-1' }), newest)
  assert.equal(hasCanonicalTransactionJourney(newest), true)
})

test('rejects a stale response from a previous transaction route', () => {
  const current = createRollup({ transactionId: 'tx-2' })
  const stale = createRollup({ transactionId: 'tx-1', derivedAt: '2026-08-29T08:06:00.000Z' })
  assert.equal(selectStableTransactionRollup(current, stale, { transactionId: 'tx-2' }), current)
})
