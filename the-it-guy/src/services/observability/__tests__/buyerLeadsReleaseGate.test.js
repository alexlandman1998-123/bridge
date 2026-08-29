import assert from 'node:assert/strict'
import {
  BUYER_LEADS_RELEASE_GATE_CONTRACT,
  BUYER_LEADS_RELEASE_GATE_LIMITS,
  evaluateBuyerLeadsReleaseGate,
} from '../buyerLeadsReleaseGate.js'

const healthy = evaluateBuyerLeadsReleaseGate({
  durationMs: 1200,
  supabaseRequestCount: 7,
  duplicateSupabaseRequestCount: 0,
  inactiveSpecialistRequestCount: 0,
  longTaskDurationMs: 80,
  routeChunkTransferBytes: 240_000,
})

assert.equal(healthy.contract, BUYER_LEADS_RELEASE_GATE_CONTRACT)
assert.equal(healthy.status, 'within_budget')
assert.equal(healthy.withinBudget, true)
assert.equal(healthy.breaches.length, 0)

const unhealthy = evaluateBuyerLeadsReleaseGate({
  durationMs: BUYER_LEADS_RELEASE_GATE_LIMITS.workspaceReadyMs + 1,
  supabaseRequestCount: BUYER_LEADS_RELEASE_GATE_LIMITS.supabaseRequestCount + 1,
  duplicateSupabaseRequestCount: 2,
  inactiveSpecialistRequestCount: 1,
  longTaskDurationMs: BUYER_LEADS_RELEASE_GATE_LIMITS.longTaskDurationMs + 1,
  routeChunkTransferBytes: BUYER_LEADS_RELEASE_GATE_LIMITS.routeChunkTransferBytes + 1,
})

assert.equal(unhealthy.status, 'breached')
assert.equal(unhealthy.withinBudget, false)
assert.deepEqual(
  unhealthy.breaches.map((breach) => breach.key),
  [
    'workspace_ready_ms',
    'supabase_request_count',
    'duplicate_supabase_request_count',
    'inactive_specialist_request_count',
    'long_task_duration_ms',
    'route_chunk_transfer_bytes',
  ],
)

const unavailableTransferSize = evaluateBuyerLeadsReleaseGate({ durationMs: 500 })
assert.equal(
  unavailableTransferSize.checks.some((check) => check.key === 'route_chunk_transfer_bytes'),
  false,
)

console.log('buyer leads release gate tests passed')
