import assert from 'node:assert/strict'
import { fetchSharedMatterJourney } from '../src/services/sharedMatterJourneyReader.js'

for (const [code, retryable] of [['57014', true], ['53300', true], ['42501', false], ['22023', false]]) {
  const result = await fetchSharedMatterJourney({ rpc: async () => ({ error: { code, message: 'Read failed' } }) }, 'matter', { audience: 'attorney' })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.retryable, retryable)
}
const network = await fetchSharedMatterJourney({ rpc: async () => { throw new TypeError('Failed to fetch') } }, 'matter')
assert.equal(network.retryable, true)
for (const [code, expectedCalls] of [['57014', 2], ['42501', 1], ['22023', 1]]) {
  let calls = 0
  await fetchSharedMatterJourney({rpc: async () => { calls++; return {error:{code,message:'timeout'}} }}, 'matter', {audience:'developer'})
  assert.equal(calls, expectedCalls, 'Retries must be bounded and never retry authorization failures')
}
console.log('Journey reads distinguish transient failures from authorization/invalid-plan failures PASS')
