import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentExperienceLaunchHealth } from '../documentExperienceLaunchGate.js'

const n1 = { ready: true, status: 'READY_FOR_N2' }
const n2 = { ready: true, status: 'READY_FOR_N3' }
const base = { contract: 'arch9-document-experience-telemetry-v1', state: 'draft', actionId: null, category: null, severity: 'info' }
const event = (eventName, surface, audience, packetType, viewport) => ({ ...base, eventName: `document_experience_${eventName}`, surface, audience, packetType, viewport })
const coverage = [
  event('journey_viewed', 'workspace', 'principal', 'mandate', 'desktop'),
  event('journey_viewed', 'workspace', 'agent', 'otp', 'mobile'),
  event('journey_viewed', 'workspace', 'attorney', 'mandate', 'desktop'),
  event('journey_viewed', 'signer_portal', 'seller', 'mandate', 'mobile'),
  event('journey_viewed', 'signer_portal', 'buyer', 'otp', 'desktop'),
  event('primary_action_selected', 'workspace', 'agent', 'mandate', 'desktop'),
]

test('opens a controlled rollout only with complete healthy evidence', () => {
  const result = assessDocumentExperienceLaunchHealth({ n1, n2, telemetryAvailable: true, events: coverage })
  assert.equal(result.status, 'READY_FOR_CONTROLLED_ROLLOUT')
  assert.equal(result.decision, 'CONTINUE_CONTROLLED_ROLLOUT')
  assert.equal(result.ready, true)
})

test('returns a phased solution for every blocker', () => {
  const result = assessDocumentExperienceLaunchHealth({ events: [] })
  assert.equal(result.status, 'DOCUMENT_EXPERIENCE_HOLD')
  assert.ok(result.blockers.length > 5)
  for (const row of result.blockers) {
    assert.ok(row.solution.summary)
    assert.ok(row.solution.phases.length >= 2)
  }
})

test('holds high recovery, abandoned confirmation and missing outcome paths', () => {
  const stress = [...coverage]
  for (let index = 0; index < 10; index += 1) stress.push(event(index < 5 ? 'recovery_selected' : 'primary_action_selected', 'workspace', 'agent', 'mandate', 'desktop'))
  for (let index = 0; index < 5; index += 1) stress.push(event('commit_opened', 'workspace', 'agent', 'mandate', 'desktop'))
  stress.push(event('commit_confirmed', 'workspace', 'agent', 'mandate', 'desktop'))
  const result = assessDocumentExperienceLaunchHealth({ n1, n2, telemetryAvailable: true, events: stress })
  assert.ok(result.blockers.some((row) => row.code === 'N4_RECOVERY_RATE_HIGH'))
  assert.ok(result.blockers.some((row) => row.code === 'N4_CONFIRMATION_ABANDONMENT_HIGH'))
})

test('holds confirmed commits that do not produce outcome receipts', () => {
  const missingOutcomes = [...coverage]
  for (let index = 0; index < 5; index += 1) {
    missingOutcomes.push(event('commit_opened', 'workspace', 'agent', 'mandate', 'desktop'))
    missingOutcomes.push(event('commit_confirmed', 'workspace', 'agent', 'mandate', 'desktop'))
  }
  missingOutcomes.push(event('outcome_shown', 'workspace', 'agent', 'mandate', 'desktop'))
  const result = assessDocumentExperienceLaunchHealth({ n1, n2, telemetryAvailable: true, events: missingOutcomes })
  assert.ok(result.blockers.some((row) => row.code === 'N4_OUTCOME_RATE_LOW'))
})

test('rejects non-catalog or sensitive telemetry fields', () => {
  const unsafe = [...coverage, { ...coverage[0], signerEmail: 'person@example.test', metadata: { token: 'secret' } }]
  const result = assessDocumentExperienceLaunchHealth({ n1, n2, telemetryAvailable: true, events: unsafe })
  assert.ok(result.blockers.some((row) => row.code === 'N4_PRIVACY_BOUNDARY_FAILED'))
  assert.doesNotMatch(JSON.stringify(result.metrics), /person@|secret/)
})
