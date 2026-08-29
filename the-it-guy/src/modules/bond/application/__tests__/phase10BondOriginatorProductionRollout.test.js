import assert from 'node:assert/strict'

import {
  BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION,
  BOND_ORIGINATOR_PRODUCTION_HEALTH_THRESHOLDS,
  BOND_ORIGINATOR_PRODUCTION_ROLLOUT_VERSION,
  buildBondOriginatorProductionRolloutCertification,
  buildBondOriginatorProductionRolloutTemplate,
} from '../index.js'

function readyInput() {
  return {
    generatedAt: '2026-08-28T14:30:00.000Z',
    phase9Certification: {
      version: BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION,
      status: 'live_certification_ready',
      ready: true,
      fingerprint: 'phase-9-v1:certified',
      build: { artifactId: 'artifact-10', commitSha: 'abcdef123456' },
    },
    deployment: { environment: 'production', artifactId: 'artifact-10', commitSha: 'abcdef123456', deploymentId: 'production-1', promotedAt: '2026-08-28T13:00:00.000Z' },
    rollout: { mode: 'canary', featureFlag: 'bond_originator_flow', cohort: 'internal-originator-pilot', percentage: 5, automaticExpansionEnabled: false, pauseAvailable: true },
    observation: { startedAt: '2026-08-28T13:00:00.000Z', endedAt: '2026-08-28T14:15:00.000Z', observedApplicationCount: 4, syntheticJourneyPassed: true, telemetryContractVersion: 'bond-application-finance-telemetry-v1', evidenceRefs: ['monitor/report-1.json'] },
    health: Object.fromEntries(Object.keys(BOND_ORIGINATOR_PRODUCTION_HEALTH_THRESHOLDS).map((key) => [key, 0])),
    controls: { monitoringOwner: 'operations-lead', supportOwner: 'support-lead', rollbackOwner: 'release-lead', rollbackRunbookAvailable: true, rollbackTestedAt: '2026-08-28T12:00:00.000Z', alertingEnabled: true },
    incidents: [],
    containsPersonalInformation: false,
    auditMutatedProduction: false,
  }
}

const template = buildBondOriginatorProductionRolloutTemplate({ artifactId: 'artifact-10' })
assert.equal(template.deployment.environment, 'production')
assert.equal(template.rollout.automaticExpansionEnabled, false)
assert.equal(buildBondOriginatorProductionRolloutCertification(template).readyForExpansion, false)

const ready = buildBondOriginatorProductionRolloutCertification(readyInput())
assert.equal(BOND_ORIGINATOR_PRODUCTION_ROLLOUT_VERSION, 'phase-10-v1')
assert.equal(ready.status, 'rollout_observed_healthy')
assert.equal(ready.readyForExpansion, true)
assert.equal(ready.metrics.blockerCount, 0)
assert.match(ready.fingerprint, /^phase-10-v1:/)

function assertBlocked(mutator, keys) {
  const input = readyInput()
  mutator(input)
  const result = buildBondOriginatorProductionRolloutCertification(input)
  assert.equal(result.readyForExpansion, false)
  for (const key of keys) assert.ok(result.blockers.some((item) => item.key === key), `${key} should block rollout`)
}

assertBlocked((input) => { input.deployment.artifactId = 'uncertified-artifact' }, ['certified_artifact_promoted'])
assertBlocked((input) => { input.rollout.automaticExpansionEnabled = true }, ['automatic_expansion_disabled'])
assertBlocked((input) => { input.observation.endedAt = '2026-08-28T13:30:00.000Z' }, ['observation_window_complete'])
assertBlocked((input) => { input.observation.observedApplicationCount = 0 }, ['production_traffic_observed'])
assertBlocked((input) => { input.health.apiErrorRate = 0.006 }, ['health_thresholds_passed'])
assertBlocked((input) => { input.health.duplicateActiveRequirementCount = 1; input.health.uploadedDocumentLossCount = 1 }, ['health_thresholds_passed'])
assertBlocked((input) => { input.incidents.push({ id: 'incident-1', severity: 'high', resolved: false }) }, ['no_unresolved_incidents'])
assertBlocked((input) => { input.controls.rollbackRunbookAvailable = false }, ['monitoring_support_rollback_ready'])
assertBlocked((input) => { input.containsPersonalInformation = true; input.auditMutatedProduction = true }, ['privacy_safe_evidence', 'read_only_certification'])

console.log('Phase 10 controlled production rollout certification passed')
