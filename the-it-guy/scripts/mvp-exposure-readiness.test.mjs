import assert from 'node:assert/strict'
import {
  evaluateMvpExposureReadiness,
  MVP_REQUIRED_STAGING_SCENARIOS,
} from '../src/core/transactions/mvpExposureReadiness.js'

const now = new Date('2026-07-19T18:00:00.000Z')
const scenario = (key) => ({
  key,
  leadToRegistrationPassed: true,
  postDeployCheck: {
    passed: true,
    transactionId: `transaction-${key}`,
    batchRecord: {
      transactionId: `transaction-${key}`,
      idempotencyKey: `idempotency-${key}`,
      participantBootstrapComplete: true,
      documentBootstrapComplete: true,
      workflowBootstrapComplete: true,
    },
  },
})
const evidence = {
  environment: 'staging',
  collectedAt: '2026-07-19T17:30:00.000Z',
  operator: { name: 'Pilot operator' },
  deployment: { contractCheckPassed: true, atomicCreationMigrationApplied: true },
  notificationSafety: { testDataSuppressionPassed: true, outboxSmokePassed: true },
  scenarios: MVP_REQUIRED_STAGING_SCENARIOS.map(scenario),
}
const localChecks = { releaseCertificationPassed: true, pilotSessionPassed: true, supportRunbookPassed: true }

assert.equal(evaluateMvpExposureReadiness({ localChecks, stagingEvidence: evidence, now }).decision, 'ready_for_controlled_exposure')
assert.ok(evaluateMvpExposureReadiness({ localChecks, stagingEvidence: null, now }).blockers.includes('staging_evidence_missing'))
assert.ok(evaluateMvpExposureReadiness({ localChecks, stagingEvidence: { ...evidence, collectedAt: '2026-07-17T17:30:00.000Z' }, now }).blockers.includes('staging_evidence_stale_or_invalid'))
assert.ok(evaluateMvpExposureReadiness({ localChecks, stagingEvidence: { ...evidence, scenarios: evidence.scenarios.slice(1) }, now }).blockers.includes('staging_scenario_missing:cash_individual'))

console.log('mvp-exposure-readiness: passed')
