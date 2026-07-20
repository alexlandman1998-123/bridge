import assert from 'node:assert/strict'
import { pairSplitLedgerVersions, REVIEWED_SPLIT_BASELINE } from './supabase-reviewed-split-baseline.mjs'

assert.equal(REVIEWED_SPLIT_BASELINE.size, 17)

const exact = pairSplitLedgerVersions(
  new Set(['202606010001']),
  new Set(['202606010001']),
)
assert.deepEqual(exact.splitVersions, ['202606010001'])
assert.deepEqual([...exact.splitRemoteVersions], ['202606010001'])

const secondPrecision = pairSplitLedgerVersions(
  new Set(['202606010001']),
  new Set(['20260601000100']),
)
assert.deepEqual(secondPrecision.splitVersions, ['202606010001'])
assert.deepEqual([...secondPrecision.splitRemoteVersions], ['20260601000100'])

const unreviewed = pairSplitLedgerVersions(
  new Set(['202607192010']),
  new Set(['20260719201000']),
)
assert.deepEqual(unreviewed.splitVersions, [])
assert.deepEqual([...unreviewed.splitRemoteVersions], [])

console.log('Supabase reviewed split baseline classification passed.')
