import assert from 'node:assert/strict'
import {
  SELLER_LEADS_PERFORMANCE_METRICS,
  createSellerLeadsPerformanceBaseline,
  summarizeSellerLeadsPerformanceResources,
} from '../sellerLeadsPerformanceBaseline.js'

function createPerformanceApi() {
  let now = 100
  const entries = {
    resource: [
      { name: 'https://app.arch9.co.za/assets/AgencyLeadWorkspaceRoutePage-abc123.js', startTime: 20, duration: 480, transferSize: 260000 },
      { name: 'https://example.supabase.co/rest/v1/leads', startTime: 130, duration: 220, transferSize: 3200 },
      { name: 'https://example.supabase.co/rest/v1/contacts', startTime: 140, duration: 240, transferSize: 2800 },
      { name: 'https://app.arch9.co.za/logo.svg', startTime: 150, duration: 30, transferSize: 1000 },
    ],
  }
  return {
    now: () => now,
    setNow: (value) => { now = value },
    getEntriesByType: (type) => entries[type] || [],
  }
}

const performanceApi = createPerformanceApi()
const resourceSummary = summarizeSellerLeadsPerformanceResources({ performanceApi, startedAt: 100 })
assert.deepEqual(resourceSummary, {
  requestCount: 3,
  supabaseRequestCount: 2,
  transferredBytes: 7000,
  longTaskCount: 0,
  longTaskDurationMs: 0,
  routeChunkDurationMs: 480,
  routeChunkTransferBytes: 260000,
})

const recorded = []
const baseline = createSellerLeadsPerformanceBaseline({
  route: '/pipeline/leads/lead-123?tab=documents',
  performanceApi,
  windowApi: {
    __itgRoutePerfTrace: {
      to: '/pipeline/leads/lead-123',
      startedAt: 50,
    },
  },
  recorder: async (metric) => {
    recorded.push(metric)
    return { persisted: true }
  },
})

performanceApi.setNow(950)
await baseline.recordCheckpoint({
  checkpoint: 'first_data',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  metadata: { renderCount: 4, leadCount: 5 },
})
await baseline.recordCheckpoint({ checkpoint: 'first_data' })

assert.equal(recorded.length, 1, 'a checkpoint should only be recorded once')
assert.equal(recorded[0].metricName, SELLER_LEADS_PERFORMANCE_METRICS.firstData)
assert.equal(recorded[0].route, '/pipeline/leads/:leadId')
assert.equal(recorded[0].durationMs, 900)
assert.equal(recorded[0].metadata.timingOrigin, 'route_transition')
assert.equal(recorded[0].metadata.supabaseRequestCount, 2)
assert.equal(recorded[0].metadata.renderCount, 4)
assert.equal(recorded[0].metadata.leadCount, 5)
assert.equal(JSON.stringify(recorded[0]).includes('lead-123'), false, 'performance rows must not include a lead identifier')

console.log('seller leads performance baseline tests passed')
