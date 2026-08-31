import assert from 'node:assert/strict'
import {
  TRANSACTION_WORKSPACE_PERFORMANCE_METRICS,
  createTransactionWorkspacePerformanceBaseline,
  summarizeTransactionWorkspaceResources,
} from '../transactionWorkspacePerformanceBaseline.js'

function createPerformanceApi() {
  let current = 100
  const resources = [
    { name: 'https://example.supabase.co/rest/v1/transactions?id=eq.secret-id', startTime: 120, transferSize: 1000 },
    { name: 'https://example.supabase.co/rest/v1/documents?transaction_id=eq.secret-id', startTime: 130, transferSize: 2000 },
    { name: 'https://example.supabase.co/rest/v1/documents?transaction_id=eq.secret-id', startTime: 140, transferSize: 2500 },
    { name: 'https://example.supabase.co/rest/v1/performance_metrics', startTime: 150, transferSize: 500 },
    { name: 'https://app.arch9.co.za/logo.svg', startTime: 160, transferSize: 300 },
  ]
  return {
    now: () => current,
    setNow: (value) => { current = value },
    getEntriesByType: (type) => type === 'resource' ? resources : [],
  }
}

const performanceApi = createPerformanceApi()
assert.deepEqual(summarizeTransactionWorkspaceResources({ performanceApi, startedAt: 100 }), {
  requestCount: 4,
  supabaseRequestCount: 3,
  duplicateRequestCount: 1,
  transferredBytes: 5800,
  endpointCounts: { documents: 2, transactions: 1 },
})

const recorded = []
const baseline = createTransactionWorkspacePerformanceBaseline({
  route: '/transactions/secret-transaction-id?tab=documents',
  performanceApi,
  recorder: async (payload) => {
    recorded.push(payload)
    return { persisted: true }
  },
})

performanceApi.setNow(850)
await baseline.recordCheckpoint({ checkpoint: 'core_ready', userId: 'user-1', workspaceId: 'workspace-1' })
await baseline.recordCheckpoint({ checkpoint: 'core_ready' })
await baseline.recordDatasetReady({ dataset: 'documents', userId: 'user-1', workspaceId: 'workspace-1' })
await baseline.recordDatasetReady({ dataset: 'documents' })

const refresh = baseline.startBackgroundRefresh({ reason: 'poll_interval' })
performanceApi.setNow(1250)
await refresh.finish({ userId: 'user-1', workspaceId: 'workspace-1' })
await refresh.finish()

assert.equal(recorded.length, 3)
assert.equal(recorded[0].metricName, TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.coreReady)
assert.equal(recorded[0].durationMs, 750)
assert.equal(recorded[0].route, '/transactions/:transactionId')
assert.equal(recorded[0].metadata.supabaseRequestCount, 3)
assert.equal(recorded[0].metadata.duplicateRequestCount, 1)
assert.equal(recorded[0].metadata.temperature, 'cold')
assert.equal(recorded[0].metadata.timingOrigin, 'component_mount')
assert.equal(recorded[1].metricName, TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.datasetReady)
assert.equal(recorded[1].metadata.dataset, 'documents')
assert.equal(recorded[2].metricName, TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.backgroundRefresh)
assert.equal(recorded[2].metadata.reason, 'poll_interval')
assert.equal(JSON.stringify(recorded).includes('secret-transaction-id'), false)

const routeTransitionRecorded = []
performanceApi.setNow(2000)
const warmBaseline = createTransactionWorkspacePerformanceBaseline({
  route: '/transactions/another-secret-id',
  performanceApi,
  windowApi: { __itgRoutePerfTrace: { to: '/transactions/another-secret-id', startedAt: 1500 } },
  recorder: async (payload) => routeTransitionRecorded.push(payload),
})
await warmBaseline.recordCheckpoint({ checkpoint: 'core_ready' })
assert.equal(routeTransitionRecorded[0].durationMs, 500)
assert.equal(routeTransitionRecorded[0].metadata.temperature, 'warm')
assert.equal(routeTransitionRecorded[0].metadata.timingOrigin, 'route_transition')

console.log('transaction workspace performance baseline tests passed')
