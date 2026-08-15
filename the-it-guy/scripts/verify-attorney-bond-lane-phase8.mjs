import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BOND_LANE_PHASE8_ROLLOUT_READINESS_VERSION,
  buildBondLanePhase8RolloutReadinessReport,
} from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'

const EXPECTED_CHECK_KEYS = [
  'phase1_journey_map',
  'phase2_action_buttons',
  'phase3_stage_commands',
  'phase4_guarantee_coordination',
  'phase5_lodgement_coordination',
  'phase6_originator_evidence_links',
  'phase7_scenario_coverage',
  'read_only_mutation_boundaries',
  'concurrent_work_policy',
]

function verifyReport() {
  const report = buildBondLanePhase8RolloutReadinessReport()

  assert.equal(report.version, BOND_LANE_PHASE8_ROLLOUT_READINESS_VERSION)
  assert.equal(report.status, 'ready_for_phase9')
  assert.equal(report.rolloutReadiness.decision, 'go')
  assert.equal(report.rolloutReadiness.nextPhase, 'phase9_uat_release_gate')
  assert.deepEqual(report.structuralBlockers, [])
  assert.deepEqual(report.readinessChecks.map((check) => check.key), EXPECTED_CHECK_KEYS)
  assert.equal(report.readinessChecks.every((check) => check.status === 'pass'), true)
}

function verifyMetrics() {
  const report = buildBondLanePhase8RolloutReadinessReport()
  const { metrics } = report.rolloutReadiness

  assert.equal(metrics.originatorLaneCount, 5)
  assert.equal(metrics.bondAttorneyLaneCount, 5)
  assert.equal(metrics.bondAttorneyStageCount, 17)
  assert.equal(metrics.originatorActionCount, 12)
  assert.equal(metrics.bondAttorneyActionCount, 17)
  assert.equal(metrics.stageCommandCount, 17)
  assert.equal(metrics.coordinationPairCount, 4)
  assert.equal(metrics.evidenceLinkCount, 9)
  assert.equal(metrics.scenarioCount, 7)
}

function verifyActionButtonProof() {
  const report = buildBondLanePhase8RolloutReadinessReport()
  const proof = report.rolloutReadiness.actionButtonProof

  assert.equal(proof.originatorActionsCovered, true)
  assert.equal(proof.attorneyActionsCovered, true)
  assert.equal(proof.handoffsCovered, true)
  assert.equal(proof.noDeadEndButtons, true)

  const actionButtonCheck = report.readinessChecks.find((check) => check.key === 'phase2_action_buttons')
  assert.equal(actionButtonCheck.status, 'pass')
  assert.equal(actionButtonCheck.evidence.originatorActionCount, 12)
  assert.equal(actionButtonCheck.evidence.attorneyActionCount, 17)
}

function verifyWorkflowProof() {
  const report = buildBondLanePhase8RolloutReadinessReport()
  const proof = report.rolloutReadiness.workflowProof

  assert.equal(proof.readOnlyBoundariesEnforced, true)
  assert.equal(proof.concurrentWorkAllowed, true)
  assert.equal(proof.guaranteeCoordinationCovered, true)
  assert.equal(proof.lodgementCoordinationCovered, true)
  assert.equal(proof.originatorEvidenceCovered, true)
  assert.equal(proof.scenariosCovered, true)

  assert.match(report.uatFocus.join('\n'), /Cash route/)
  assert.match(report.uatFocus.join('\n'), /Company and trust buyers/)
  assert.match(report.uatFocus.join('\n'), /Cancellation trigger/)
  assert.match(report.releaseGateInputs.join('\n'), /Phase 9 release gate/)
}

function verifyDocAndSourceTokens() {
  const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase8-rollout-readiness.md', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/bondLaneJourneyMap.js', import.meta.url), 'utf8')

  assert.match(docSource, /Bond Lane Phase 8 Rollout Readiness/)
  assert.match(docSource, /no dead-end action buttons/)
  assert.match(docSource, /ready_for_phase9/)
  assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase8\.mjs/)
  assert.match(serviceSource, /BOND_LANE_PHASE8_ROLLOUT_READINESS_VERSION/)
  assert.match(serviceSource, /buildBondLanePhase8RolloutReadinessReport/)
  assert.match(serviceSource, /read_only_mutation_boundaries/)
  assert.match(serviceSource, /concurrent_work_policy/)
}

verifyReport()
verifyMetrics()
verifyActionButtonProof()
verifyWorkflowProof()
verifyDocAndSourceTokens()

console.log('Attorney bond lane Phase 8 rollout readiness verification passed.')
