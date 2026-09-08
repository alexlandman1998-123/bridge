import assert from 'node:assert/strict'
import { HIGH_LEVEL_RELEASE_CHECKS, evaluateHighLevelJourneyRelease } from './high-level-journey-release-gate.mjs'
import { ROLES, SCENARIOS, OUTCOMES, SAFETY_CHECKS, scenarioLanes } from './shared-journey-release-gate.mjs'

// Synthetic fixtures are never written as staging evidence.
const now = Date.parse('2026-09-08T18:00:00Z'), sourceDigest = 'a'.repeat(64)
const local = { status: 'passed', sourceDigest }
const staging = { schemaVersion: 1, environment: 'staging', projectRef: 'vaszuxjeoajeuhlcnzzf',
  deploymentId: 'test-only', reviewedBy: 'test-only', sourceDigest, recordedAt: new Date(now).toISOString(),
  transitions: SCENARIOS.flatMap(scenario => scenarioLanes(scenario).flatMap(laneKey => OUTCOMES.map(outcome => ({
    scenario, laneKey, outcome, matterId: 'fixture', taskId: 'fixture', beforeRevision: 1, afterRevision: 2,
    committedAt: new Date(now - 20000).toISOString(), reads: ROLES.map(role => ({ role,
      revision: 2, taskId: 'fixture', taskStatus: outcome === 'reopened' ? 'not_started' : outcome,
      snapshotDigest: 'b'.repeat(64), observedAt: new Date(now - 10000).toISOString() })),
  })))), checks: Object.fromEntries([...SAFETY_CHECKS, ...HIGH_LEVEL_RELEASE_CHECKS].map(key =>
    [key, { status: 'passed', evidenceRef: 'synthetic-test-only' }])) }
const gate = (e = staging) => evaluateHighLevelJourneyRelease({ local, staging: e, now })
assert.equal(gate().decision, 'ready_for_controlled_release')
assert.equal(gate(null).decision, 'blocked')
for (const key of [...SAFETY_CHECKS, ...HIGH_LEVEL_RELEASE_CHECKS]) {
  const missing = structuredClone(staging); delete missing.checks[key]
  assert.equal(gate(missing).decision, 'blocked')
}
for (const change of [e => e.projectRef = 'isdowlnollckzvltkasn', e => e.sourceDigest = 'c'.repeat(64),
  e => e.transitions[0].reads.pop(), e => e.transitions[0].reads[0].revision = 1,
  e => e.recordedAt = '2020-01-01', e => e.checks[HIGH_LEVEL_RELEASE_CHECKS[0]].evidenceRef = '']) {
  const bad = structuredClone(staging); change(bad); assert.equal(gate(bad).decision, 'blocked')
}
assert.equal(gate().productionChanged, false)
console.log('High-level release gate: staging identity, migration, commercial parity, source binding and missing evidence PASS')
