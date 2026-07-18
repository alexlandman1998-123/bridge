import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentExperienceRolloutControl, buildDocumentExperienceRolloutControl } from '../documentExperienceRolloutControl.js'

const digest = `sha256:${'a'.repeat(64)}`
const evidenceDigest = `sha256:${'b'.repeat(64)}`
const n4 = { ready: true, status: 'READY_FOR_CONTROLLED_ROLLOUT', decision: 'CONTINUE_CONTROLLED_ROLLOUT', metrics: { eventCount: 25, recoveryRate: 0.1, confirmationRate: 0.9, outcomeRate: 1 } }
const start = '2026-07-18T08:00:00.000Z'

function pilot(overrides = {}) {
  return { ...buildDocumentExperienceRolloutControl({ n4, cohortDigest: digest, evidenceDigest, maxParticipants: 5, operatorRef: 'operator-1', changeReference: 'CHG-100', startedAt: start }), ...overrides }
}

test('keeps a healthy bounded pilot active during observation', () => {
  const control = pilot()
  const result = assessDocumentExperienceRolloutControl({ control, n4, actualCohortDigest: digest, now: Date.parse(start) + 60 * 60 * 1000 })
  assert.equal(result.decision, 'CONTINUE_STAGE')
  assert.equal(result.status, 'ROLLOUT_STAGE_ACTIVE')
})

test('promotes only after the pilot window and sample pass', () => {
  const control = pilot()
  const result = assessDocumentExperienceRolloutControl({ control, n4, actualCohortDigest: digest, now: Date.parse(control.observationEndsAt) + 1000 })
  assert.equal(result.decision, 'PROMOTE_TO_EXPANDED')
})

test('accepts a revision-locked expanded stage from the recorded pilot decision', () => {
  const pilotControl = pilot()
  const pilotDecision = assessDocumentExperienceRolloutControl({ control: pilotControl, n4, actualCohortDigest: digest, now: Date.parse(pilotControl.observationEndsAt) + 1000 })
  const expandedN4 = { ...n4, metrics: { ...n4.metrics, eventCount: 120 } }
  const expanded = buildDocumentExperienceRolloutControl({ n4: expandedN4, stage: 'expanded', cohortDigest: digest, evidenceDigest, maxParticipants: 50, operatorRef: 'operator-1', changeReference: 'CHG-101', startedAt: '2026-07-20T08:00:00.000Z', revision: 2 })
  const result = assessDocumentExperienceRolloutControl({ control: expanded, n4: expandedN4, actualCohortDigest: digest, previousControl: { stage: pilotControl.stage, revision: pilotControl.revision, decision: pilotDecision.decision }, now: Date.parse(expanded.startedAt) + 1000 })
  assert.equal(result.decision, 'CONTINUE_STAGE')
  assert.equal(result.stage, 'expanded')
})

test('holds an under-sampled stage without expanding its cohort', () => {
  const control = pilot()
  const result = assessDocumentExperienceRolloutControl({ control, n4: { ...n4, metrics: { ...n4.metrics, eventCount: 4 } }, actualCohortDigest: digest, now: Date.parse(control.observationEndsAt) + 1000 })
  assert.equal(result.decision, 'EXTEND_OBSERVATION')
  assert.equal(result.blockers[0].code, 'N5_SAMPLE_INSUFFICIENT')
  assert.ok(result.blockers[0].solution.phases.length >= 2)
})

test('automatically pauses on health regression, cohort drift, incident or expiry', () => {
  const control = pilot()
  const result = assessDocumentExperienceRolloutControl({ control, n4: { ...n4, ready: false }, actualCohortDigest: `sha256:${'c'.repeat(64)}`, incidentCount: 1, now: Date.parse(control.expiresAt) + 1 })
  for (const code of ['N5_N4_REGRESSION_STOP', 'N5_COHORT_DRIFT_STOP', 'N5_INCIDENT_STOP', 'N5_CONTROL_EXPIRED']) assert.ok(result.blockers.some((row) => row.code === code), code)
  assert.equal(result.decision, 'PAUSE_ROLLOUT')
})

test('rejects cohort limits above the stage ceiling', () => {
  const result = assessDocumentExperienceRolloutControl({ control: pilot({ maxParticipants: 11 }), n4, actualCohortDigest: digest, now: Date.parse(start) + 1000 })
  assert.ok(result.blockers.some((row) => row.code === 'N5_COHORT_LIMIT_INVALID'))
})
