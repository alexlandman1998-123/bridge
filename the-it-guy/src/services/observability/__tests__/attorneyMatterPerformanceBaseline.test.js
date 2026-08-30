import assert from 'node:assert/strict'
import {
  ATTORNEY_MATTER_PERFORMANCE_METRICS,
  createAttorneyMatterPerformanceBaseline,
} from '../attorneyMatterPerformanceBaseline.js'

function createPerformanceApi() {
  let current = 100
  return {
    now: () => current,
    setNow: (value) => { current = value },
    getEntriesByType: () => [
      { name: 'https://example.supabase.co/rest/v1/transactions?id=eq.private-id', startTime: 120, transferSize: 800 },
      { name: 'https://example.supabase.co/rest/v1/appointments?transaction_id=eq.private-id', startTime: 140, transferSize: 600 },
    ],
  }
}

const performanceApi = createPerformanceApi()
const recorded = []
const baseline = createAttorneyMatterPerformanceBaseline({
  route: '/transactions/3be54ae7-8898-432c-af06-dbbe30c92d80',
  performanceApi,
  recorder: async (payload) => {
    recorded.push(payload)
    return { persisted: true }
  },
})

performanceApi.setNow(1800)
await baseline.record(ATTORNEY_MATTER_PERFORMANCE_METRICS.detailCoreReady, {
  userId: 'user-1',
  workspaceId: 'firm-1',
  metadata: { outcome: 'success' },
})
await baseline.record(ATTORNEY_MATTER_PERFORMANCE_METRICS.datasetReady, {
  userId: 'user-1',
  workspaceId: 'firm-1',
  metadata: { dataset: 'documents' },
  dedupeKey: 'dataset:documents',
})
await baseline.record(ATTORNEY_MATTER_PERFORMANCE_METRICS.datasetReady, {
  userId: 'user-1',
  workspaceId: 'firm-1',
  metadata: { dataset: 'activity' },
  dedupeKey: 'dataset:activity',
})

assert.equal(recorded.length, 3)
assert.equal(recorded[0].route, '/transactions/:transactionId')
assert.equal(recorded[0].metadata.supabaseRequestCount, 2)
assert.equal(recorded[1].metadata.dataset, 'documents')
assert.equal(recorded[2].metadata.dataset, 'activity')
assert.equal(JSON.stringify(recorded).includes('3be54ae7-8898-432c-af06-dbbe30c92d80'), false)

console.log('attorney matter performance baseline tests passed')
