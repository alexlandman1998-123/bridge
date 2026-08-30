import assert from 'node:assert/strict'
import {
  LEAD_WORKSPACE_LOADING_COMPLETED_EVENT,
  LEAD_WORKSPACE_OPERATIONAL_HEALTH_CONTRACT,
  assessLeadWorkspaceOperationalHealth,
  buildLeadWorkspaceOperationalRollup,
} from '../leadWorkspaceOperationalHealth.js'

function readyTrace(elapsedMs = 4_000) {
  return {
    outcome: 'ready',
    startedAt: 1_000,
    completedAt: 1_000 + elapsedMs,
    loadingPresentationCount: 2,
    terminalPresentationCount: 0,
    stages: [{ stage: 'route_chunk_loading' }, { stage: 'core_lead_ready' }, { stage: 'workspace_ready' }],
  }
}

const healthy = assessLeadWorkspaceOperationalHealth(readyTrace(), {
  leadCategory: 'seller',
  warmSnapshot: true,
  workspaceTab: 'overview',
})
assert.equal(healthy.status, 'healthy')
assert.equal(healthy.severity, 'info')
assert.deepEqual(healthy.reasonCodes, [])
assert.equal(healthy.metadata.operationalHealthContract, LEAD_WORKSPACE_OPERATIONAL_HEALTH_CONTRACT)
assert.equal(healthy.metadata.leadCategory, 'seller')
assert.equal(healthy.metadata.warmSnapshot, true)

const degraded = assessLeadWorkspaceOperationalHealth(readyTrace(12_000))
assert.equal(degraded.status, 'degraded')
assert.equal(degraded.severity, 'warning')
assert.deepEqual(degraded.reasonCodes, ['READY_TIME_DEGRADED'])

const terminal = assessLeadWorkspaceOperationalHealth({
  outcome: 'unavailable',
  startedAt: 1_000,
  completedAt: 2_000,
  loadingPresentationCount: 1,
  terminalPresentationCount: 1,
  stages: [{ stage: 'workspace_hydrating' }, { stage: 'unavailable' }],
})
assert.equal(terminal.status, 'critical')
assert.equal(terminal.severity, 'error')
assert.deepEqual(terminal.reasonCodes, ['TERMINAL_OUTCOME', 'TERMINAL_PRESENTATION'])

const event = (metadata) => ({ event_name: LEAD_WORKSPACE_LOADING_COMPLETED_EVENT, metadata })
const goodSamples = Array.from({ length: 20 }, (_, index) => event({
  ...healthy.metadata,
  elapsedMs: 2_000 + index * 100,
  warmSnapshot: index % 2 === 0,
}))
const healthyRollup = buildLeadWorkspaceOperationalRollup(goodSamples)
assert.equal(healthyRollup.decision, 'healthy')
assert.equal(healthyRollup.sampleCount, 20)
assert.equal(healthyRollup.readyRate, 1)
assert.equal(healthyRollup.readyP95Ms, 3_800)

const insufficientRollup = buildLeadWorkspaceOperationalRollup(goodSamples.slice(0, 5))
assert.equal(insufficientRollup.decision, 'observe')

const badSamples = [
  ...goodSamples.slice(0, 18).map((sample) => event({ ...sample.metadata, elapsedMs: 12_000 })),
  event(terminal.metadata),
  event(terminal.metadata),
]
const rollbackRollup = buildLeadWorkspaceOperationalRollup(badSamples)
assert.equal(rollbackRollup.decision, 'rollback_recommended')
assert.deepEqual(rollbackRollup.rollbackReasonCodes, [
  'READY_RATE_BELOW_TARGET',
  'CRITICAL_RATE_ABOVE_TARGET',
  'TERMINAL_RATE_ABOVE_TARGET',
  'READY_P95_ABOVE_TARGET',
])

console.log('lead workspace operational health tests passed')
