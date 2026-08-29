import assert from 'node:assert/strict'

import {
  BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION,
  BOND_APPLICATION_INTERPRETER_VERSION,
  BOND_APPLICATION_ORIGINATOR_PACK_VERSION,
  BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION,
  BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION,
  BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION,
  BOND_ORIGINATOR_PROMOTION_MAX_EVIDENCE_AGE_HOURS,
  BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION,
  BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION,
  CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION,
  buildBondOriginatorAcceptanceScenarioMatrix,
  buildBondOriginatorProductionPromotionArtifact,
} from '../index.js'

function readyInput() {
  const packFingerprint = 'phase-5-v1:pack-ready'
  return {
    generatedAt: '2026-08-28T12:00:00.000Z',
    environment: 'staging',
    build: { commitSha: 'abcdef123456', artifactId: 'vercel-artifact-1' },
    scenarioResults: buildBondOriginatorAcceptanceScenarioMatrix().map((scenario) => ({ key: scenario.key, passed: true })),
    interpretation: { version: BOND_APPLICATION_INTERPRETER_VERSION, trusted: true, blockingIssues: [] },
    requirementProfile: {
      engineVersion: BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION,
      trusted: true,
      fingerprint: 'phase-2-v1:profile',
      profile: { key: 'za_baseline' },
    },
    documentReconciliation: {
      reconciliationVersion: BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION,
      diagnostics: [],
    },
    participantEntityCompleteness: {
      version: BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION,
      complete: true,
      blockingIssues: [],
    },
    packManifest: {
      version: BOND_APPLICATION_ORIGINATOR_PACK_VERSION,
      status: 'ready',
      ready: true,
      fingerprint: packFingerprint,
    },
    handoffPackage: {
      idempotencyKey: 'phase-6-v1:handoff',
      status: 'ready_for_originator',
      controlledHandoff: {
        version: CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION,
        packFingerprint,
        automaticBankSubmission: false,
        networkDeliveryPerformed: false,
      },
    },
    multiProfileAcceptance: {
      version: BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION,
      certified: true,
      status: 'acceptance_certified',
      metrics: { profileCount: 3, scenarioCountPerProfile: 54 },
    },
    evidence: {
      functionalContractVersion: BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION,
      observedAt: '2026-08-28T11:00:00.000Z',
      activeHandoffCount: 1,
    },
    operationalControls: {
      monitoringOwner: 'operations-lead',
      monitoringCadence: 'daily',
      supportOwner: 'support-lead',
      rollbackOwner: 'product-lead',
      pausePathTested: true,
      rollbackRunbookAvailable: true,
    },
    mutatedProduction: false,
  }
}

const ready = buildBondOriginatorProductionPromotionArtifact(readyInput())
assert.equal(BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION, 'phase-7-v1')
assert.equal(BOND_ORIGINATOR_PROMOTION_MAX_EVIDENCE_AGE_HOURS, 24)
assert.equal(ready.ready, true)
assert.equal(ready.status, 'promotion_ready')
assert.equal(ready.metrics.scenarioCount, 54)
assert.equal(ready.metrics.blockerCount, 0)
assert.match(ready.fingerprint, /^phase-7-v1:/)
assert.equal(ready.checks.every((item) => item.passed), true)

const missingScenarioInput = readyInput()
missingScenarioInput.scenarioResults.pop()
const missingScenario = buildBondOriginatorProductionPromotionArtifact(missingScenarioInput)
assert.equal(missingScenario.ready, false)
assert.ok(missingScenario.blockers.some((item) => item.key === 'acceptance_matrix_complete'))

const duplicateScenarioInput = readyInput()
duplicateScenarioInput.scenarioResults.push(duplicateScenarioInput.scenarioResults[0])
const duplicateScenario = buildBondOriginatorProductionPromotionArtifact(duplicateScenarioInput)
assert.ok(duplicateScenario.blockers.some((item) => item.key === 'acceptance_matrix_complete'))

const staleInput = readyInput()
staleInput.evidence.observedAt = '2026-08-26T11:00:00.000Z'
const stale = buildBondOriginatorProductionPromotionArtifact(staleInput)
assert.ok(stale.blockers.some((item) => item.key === 'evidence_fresh'))

const unsafeInput = readyInput()
unsafeInput.evidence.activeHandoffCount = 2
unsafeInput.handoffPackage.controlledHandoff.automaticBankSubmission = true
unsafeInput.operationalControls.pausePathTested = false
unsafeInput.mutatedProduction = true
const unsafe = buildBondOriginatorProductionPromotionArtifact(unsafeInput)
for (const key of ['controlled_handoff_bound', 'single_active_handoff', 'support_and_rollback_ready', 'read_only_promotion_audit']) {
  assert.ok(unsafe.blockers.some((item) => item.key === key), `${key} should block promotion`)
}

console.log('Phase 7 bond originator production promotion artifact passed')
