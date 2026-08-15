import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CANCELLATION_LANE_PHASE7_ROLLOUT_READINESS_VERSION,
  buildCancellationLanePhase7RolloutReadinessReport,
} from '../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js'

const EXPECTED_CHECK_KEYS = [
  'phase1_journey_map',
  'phase2_action_buttons',
  'phase3_stage_command_gap',
  'phase4_guarantee_coordination',
  'phase5_lodgement_coordination',
  'phase6_scenario_coverage',
  'concurrent_work_policy',
]

function verifyReport() {
  const report = buildCancellationLanePhase7RolloutReadinessReport()

  assert.equal(report.version, CANCELLATION_LANE_PHASE7_ROLLOUT_READINESS_VERSION)
  assert.equal(report.status, 'ready_for_phase8')
  assert.equal(report.rolloutReadiness.decision, 'go_with_phase3_gap')
  assert.equal(report.rolloutReadiness.nextPhase, 'phase8_uat_release_gate')
  assert.deepEqual(report.structuralBlockers, [])
  assert.deepEqual(report.warnings, ['Rollout readiness warning: phase3_stage_command_gap'])
  assert.deepEqual(report.readinessChecks.map((check) => check.key), EXPECTED_CHECK_KEYS)
  assert.equal(report.readinessChecks.filter((check) => check.status === 'pass').length, 6)
  assert.equal(report.readinessChecks.find((check) => check.key === 'phase3_stage_command_gap')?.status, 'warning')
}

function verifyMetrics() {
  const report = buildCancellationLanePhase7RolloutReadinessReport()
  const { metrics } = report.rolloutReadiness

  assert.equal(metrics.cancellationAttorneyLaneCount, 5)
  assert.equal(metrics.cancellationAttorneyStageCount, 19)
  assert.equal(metrics.transferTriggerActionCount, 1)
  assert.equal(metrics.cancellationAttorneyActionCount, 19)
  assert.equal(metrics.guaranteeCoordinationPairCount, 2)
  assert.equal(metrics.lodgementCoordinationPairCount, 2)
  assert.equal(metrics.scenarioCount, 8)
  assert.equal(metrics.attentionScenarioCount, 2)
}

function verifyActionButtonProof() {
  const report = buildCancellationLanePhase7RolloutReadinessReport()
  const proof = report.rolloutReadiness.actionButtonProof

  assert.equal(proof.transferTriggerCovered, true)
  assert.equal(proof.attorneyActionsCovered, true)
  assert.equal(proof.handoffsCovered, true)
  assert.equal(proof.noDeadEndButtons, true)

  const actionButtonCheck = report.readinessChecks.find((check) => check.key === 'phase2_action_buttons')
  assert.equal(actionButtonCheck.status, 'pass')
  assert.equal(actionButtonCheck.evidence.transferTriggerActionCount, 1)
  assert.equal(actionButtonCheck.evidence.cancellationAttorneyActionCount, 19)
}

function verifyWorkflowProof() {
  const report = buildCancellationLanePhase7RolloutReadinessReport()
  const proof = report.rolloutReadiness.workflowProof

  assert.equal(proof.guaranteeCoordinationCovered, true)
  assert.equal(proof.lodgementCoordinationCovered, true)
  assert.equal(proof.scenariosCovered, true)
  assert.equal(proof.concurrentWorkAllowed, true)
  assert.equal(proof.phase3CommandPresetGapTracked, true)

  const phase3Check = report.readinessChecks.find((check) => check.key === 'phase3_stage_command_gap')
  assert.equal(phase3Check.evidence.phase3Implemented, false)
  assert.equal(phase3Check.evidence.genericActionsAvailable, true)
  assert.ok(phase3Check.evidence.outstandingScope.includes('figures_expiry'))
  assert.ok(phase3Check.evidence.outstandingScope.includes('settlement_close_out'))

  assert.match(report.uatFocus.join('\n'), /Cash buyer with seller existing bond/)
  assert.match(report.uatFocus.join('\n'), /Unknown seller bond status/)
  assert.match(report.uatFocus.join('\n'), /Phase 3 gap/)
  assert.match(report.releaseGateInputs.join('\n'), /Phase 8 release gate/)
}

function verifyDocAndSourceTokens() {
  const docSource = readFileSync(new URL('../docs/attorney-cancellation-lane-phase7-rollout-readiness.md', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js', import.meta.url), 'utf8')

  assert.match(docSource, /Cancellation Lane Phase 7 Rollout Readiness/)
  assert.match(docSource, /go_with_phase3_gap/)
  assert.match(docSource, /Phase 3 command-preset gap/)
  assert.match(docSource, /node scripts\/verify-attorney-cancellation-lane-phase7\.mjs/)
  assert.match(serviceSource, /CANCELLATION_LANE_PHASE7_ROLLOUT_READINESS_VERSION/)
  assert.match(serviceSource, /buildCancellationLanePhase7RolloutReadinessReport/)
  assert.match(serviceSource, /phase3_stage_command_gap/)
  assert.match(serviceSource, /go_with_phase3_gap/)
}

verifyReport()
verifyMetrics()
verifyActionButtonProof()
verifyWorkflowProof()
verifyDocAndSourceTokens()

console.log('Attorney cancellation lane Phase 7 rollout readiness verification passed.')
