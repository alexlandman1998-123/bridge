import assert from 'node:assert/strict'
import {
  BUYER_LEADS_PERFORMANCE_METRICS,
  createBuyerLeadsPerformanceBaseline,
  summarizeBuyerWorkspaceResources,
} from '../buyerLeadsPerformanceBaseline.js'

function createPerformanceApi() {
  let currentTime = 100
  const entries = {
    resource: [
      { name: 'https://app.arch9.co.za/assets/AgencyLeadWorkspaceRoutePage-a1.js', startTime: 20, duration: 420, transferSize: 1800 },
      { name: 'https://demo.supabase.co/rest/v1/offers?lead_id=eq.1', startTime: 120, duration: 180, transferSize: 2400 },
      { name: 'https://demo.supabase.co/rest/v1/offers?lead_id=eq.1', startTime: 130, duration: 190, transferSize: 2400 },
      { name: 'https://demo.supabase.co/rest/v1/lead_activities?lead_id=eq.1', startTime: 140, duration: 150, transferSize: 1200 },
      { name: 'https://demo.supabase.co/rest/v1/contacts?id=eq.1', startTime: 150, duration: 120, transferSize: 800 },
    ],
    longtask: [{ startTime: 170, duration: 64 }],
  }
  return {
    now: () => currentTime,
    setNow: (value) => { currentTime = value },
    getEntriesByType: (type) => entries[type] || [],
  }
}

const performanceApi = createPerformanceApi()
assert.deepEqual(summarizeBuyerWorkspaceResources({ performanceApi, startedAt: 100, activeTab: 'offers' }), {
  requestCount: 4,
  supabaseRequestCount: 4,
  transferredBytes: 6800,
  longTaskCount: 1,
  longTaskDurationMs: 64,
  routeChunkDurationMs: 420,
  routeChunkTransferBytes: 1800,
  duplicateSupabaseRequestCount: 1,
  specialistRequestCounts: { offers: 2, activity: 1 },
  inactiveSpecialistRequestCount: 1,
})

const recorded = []
const baseline = createBuyerLeadsPerformanceBaseline({
  route: '/pipeline/leads/buyer-lead-123?tab=offers',
  performanceApi,
  windowApi: { __itgRoutePerfTrace: { to: '/pipeline/leads/buyer-lead-123', startedAt: 50 } },
  recorder: async (metric) => {
    recorded.push(metric)
    return { persisted: true }
  },
})

performanceApi.setNow(900)
await baseline.recordCheckpoint({
  checkpoint: 'workspace_ready',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  metadata: { workspaceTab: 'offers', renderCount: 3 },
})
await baseline.recordCheckpoint({ checkpoint: 'workspace_ready' })

assert.equal(recorded.length, 1)
assert.equal(recorded[0].metricName, BUYER_LEADS_PERFORMANCE_METRICS.workspaceReady)
assert.equal(recorded[0].route, '/pipeline/leads/:leadId')
assert.equal(recorded[0].durationMs, 850)
assert.equal(recorded[0].metadata.contract, 'arch9-buyer-leads-performance-baseline-v2')
assert.equal(recorded[0].metadata.duplicateSupabaseRequestCount, 1)
assert.equal(recorded[0].metadata.inactiveSpecialistRequestCount, 1)
assert.equal(recorded[0].metadata.releaseGateContract, 'arch9-buyer-leads-release-gate-v1')
assert.equal(recorded[0].metadata.releaseGateStatus, 'breached')
assert.deepEqual(recorded[0].metadata.releaseGateBreaches, [
  'duplicate_supabase_request_count',
  'inactive_specialist_request_count',
])
assert.equal(recorded[0].metadata.workspaceTab, 'offers')
assert.equal(recorded[0].metadata.leadCategory, 'buyer')
assert.equal(JSON.stringify(recorded[0]).includes('buyer-lead-123'), false, 'performance rows must not include a lead identifier')

console.log('buyer leads performance baseline tests passed')
