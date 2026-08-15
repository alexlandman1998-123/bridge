import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS,
  buildAttorneyWorkflowActionCommand,
} from '../src/constants/attorneyWorkflowUsability.js'
import {
  CANCELLATION_LANE_PHASE9_ACTION_COMMAND_RELEASE_VERSION,
  CANCELLATION_PHASE6_SCENARIO_MATRIX,
  CANCELLATION_PHASE9_RELEASE_CHECKLIST,
  buildCancellationLanePhase9ActionCommandReleaseReport,
} from '../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js'

function scenarioGate(report, key) {
  const gate = report.scenarioGates.find((scenario) => scenario.key === key)
  assert.ok(gate, `Missing scenario gate: ${key}`)
  return gate
}

function checkStatus(gate, key) {
  const check = gate.checks.find((item) => item.key === key)
  assert.ok(check, `Missing check ${key} for ${gate.key}`)
  return check.status
}

function verifyReleaseGateReport() {
  const report = buildCancellationLanePhase9ActionCommandReleaseReport()

  assert.equal(report.version, CANCELLATION_LANE_PHASE9_ACTION_COMMAND_RELEASE_VERSION)
  assert.equal(report.status, 'ready_for_controlled_rollout')
  assert.equal(report.releaseGateStatus, 'go')
  assert.equal(report.decision, 'go')
  assert.equal(report.phase8Version, 'cancellation-lane-phase8-uat-release-gate-v1')
  assert.equal(report.phase8DecisionRetired, true)
  assert.deepEqual(report.structuralBlockers, [])
  assert.deepEqual(report.reviewItems, [])
  assert.equal(report.signoff.requiredChecklistCount, 9)
  assert.equal(report.signoff.requiredActionCount, 19)
  assert.equal(report.signoff.commandBackedActionCount, 19)
  assert.equal(report.signoff.scenarioCount, CANCELLATION_PHASE6_SCENARIO_MATRIX.length)
  assert.equal(report.signoff.goScenarioCount, 6)
  assert.equal(report.signoff.reviewScenarioCount, 2)
  assert.equal(report.signoff.blockedScenarioCount, 0)
  assert.equal(report.signoff.blockerCount, 0)
  assert.equal(report.signoff.reviewCount, 0)
  assert.equal(report.signoff.expectedReviewCount, 3)
  assert.deepEqual(report.signoff.requiredSignoffRoles, ['cancellation_attorney', 'transfer_attorney', 'bond_attorney', 'operations_owner'])
}

function verifyCommandPresetCoverage() {
  const report = buildCancellationLanePhase9ActionCommandReleaseReport()

  assert.equal(Object.keys(CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS).length, 19)
  assert.equal(report.stageSpecificCommands.length, 19)
  assert.equal(report.actionCommandProof.allCancellationActionsCommandBacked, true)
  assert.deepEqual(report.actionCommandProof.noteOnlyStageKeys, [
    'notice_period_captured',
    'notice_penalty_risk_captured',
    'settlement_proof_captured',
  ])
  assert.deepEqual(report.actionCommandProof.documentCommandStageKeys, [
    'cancellation_figures_received',
    'cancellation_guarantees_received',
    'seller_cancellation_documents_signed',
  ])
  assert.equal(report.actionCommandProof.nonLinearWorkflowPreserved, true)
  assert.equal(report.stageSpecificCommands.every((command) => command.hasPreset), true)
  assert.equal(report.stageSpecificCommands.every((command) => command.executable), true)
  assert.equal(report.stageSpecificCommands.every((command) => command.commandMatchesPresetType), true)
  assert.equal(report.stageSpecificCommands.every((command) => command.commandUsesPresetChecklist), true)

  const figures = report.stageSpecificCommands.find((command) => command.stageKey === 'cancellation_figures_received')
  assert.equal(figures.commandType, 'request_document')
  assert.equal(figures.workPacket.visibility, 'professional_shared')
  assert.equal(figures.workPacket.audience, 'bank')

  const penalty = report.stageSpecificCommands.find((command) => command.stageKey === 'notice_penalty_risk_captured')
  assert.equal(penalty.commandType, 'add_note')
  assert.equal(penalty.workPacket.priority, 'urgent')

  const signedDocs = report.stageSpecificCommands.find((command) => command.stageKey === 'seller_cancellation_documents_signed')
  assert.equal(signedDocs.commandType, 'request_document')
  assert.equal(signedDocs.workPacket.audience, 'seller')
  assert.equal(signedDocs.workPacket.visibility, 'client_visible')
}

function verifyRuntimeCommandHook() {
  const command = buildAttorneyWorkflowActionCommand({
    id: 'phase9_runtime_figures',
    type: 'request_document',
    label: 'Capture Figures',
    target: 'bank',
    laneKey: 'cancellation',
    stageKey: 'cancellation_figures_received',
  }, {
    laneKey: 'cancellation',
    stageKey: 'cancellation_figures_received',
    now: '2026-08-15T00:00:00.000Z',
  })

  assert.equal(command.commandType, 'request_document')
  assert.equal(command.label, 'Capture Figures')
  assert.equal(command.workPacket.laneKey, 'cancellation')
  assert.equal(command.workPacket.stageKey, 'cancellation_figures_received')
  assert.equal(command.workPacket.audience, 'bank')
  assert.ok(command.workPacket.checklist.includes('Check settlement amount and expiry.'))
  assert.match(command.draft.description, /Cancellation figures received/)
}

function verifyReleaseChecklist() {
  const report = buildCancellationLanePhase9ActionCommandReleaseReport()

  assert.equal(report.uatChecklist, CANCELLATION_PHASE9_RELEASE_CHECKLIST)
  assert.equal(report.uatChecklist.length, 9)
  assert.equal(report.uatChecklist.every((item) => item.id && item.label && item.expectedOutcome && item.proofKey && item.required), true)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /Confirm cancellation stage presets/)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /Preserve non-linear workflow/)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /Retire Phase 3 warning/)
}

function verifyScenarioGates() {
  const report = buildCancellationLanePhase9ActionCommandReleaseReport()

  const cashExistingBond = scenarioGate(report, 'cash_buyer_individual_seller_existing_bond')
  assert.equal(cashExistingBond.releaseGateStatus, 'go')
  assert.equal(cashExistingBond.profile.financeType, 'cash')
  assert.equal(cashExistingBond.profile.requiresCancellationAttorney, true)
  assert.equal(cashExistingBond.profile.lanePolicy.buyerFinanceDoesNotControlCancellation, true)
  assert.equal(checkStatus(cashExistingBond, 'attorney_action_commands'), 'ready')
  assert.equal(checkStatus(cashExistingBond, 'coordination_commands'), 'ready')
  assert.equal(checkStatus(cashExistingBond, 'non_linear_workflow'), 'ready')

  const noSellerBond = scenarioGate(report, 'cash_buyer_no_seller_bond')
  assert.equal(noSellerBond.releaseGateStatus, 'go')
  assert.equal(noSellerBond.profile.requiresCancellationAttorney, false)
  assert.equal(noSellerBond.profile.lanePolicy.noSellerBondSuppressesCancellation, true)
  assert.equal(checkStatus(noSellerBond, 'attorney_action_commands'), 'ready')

  const unknownBond = scenarioGate(report, 'unknown_seller_bond_status')
  assert.equal(unknownBond.releaseGateStatus, 'review')
  assert.equal(unknownBond.profile.requiresCancellationAttorney, false)
  assert.equal(unknownBond.profile.lanePolicy.unknownSellerBondRequiresConfirmation, true)
  assert.equal(checkStatus(unknownBond, 'seller_bond_status'), 'review')
  assert.equal(checkStatus(unknownBond, 'lane_activation'), 'review')

  const company = scenarioGate(report, 'company_seller_existing_bond')
  assert.equal(company.releaseGateStatus, 'go')
  assert.ok(company.profile.sellerRequirementKeys.includes('seller_signatory_authority'))

  const trust = scenarioGate(report, 'trust_seller_existing_bond')
  assert.equal(trust.releaseGateStatus, 'go')
  assert.ok(trust.profile.sellerRequirementKeys.includes('seller_trustee_resolution'))

  const risk = scenarioGate(report, 'expired_figures_penalty_risk')
  assert.equal(risk.releaseGateStatus, 'review')
  assert.equal(risk.profile.requiresCancellationAttorney, true)
  assert.equal(checkStatus(risk, 'figures_notice_risk'), 'review')
}

function verifySelectedMatterReview() {
  const report = buildCancellationLanePhase9ActionCommandReleaseReport({
    facts: {
      financeType: 'bond',
      sellerEntityType: 'individual',
    },
    scenarioLabel: 'Selected unknown seller bond matter',
  })

  assert.equal(report.status, 'review_required')
  assert.equal(report.releaseGateStatus, 'review')
  assert.equal(report.selectedScenarioGate.releaseGateStatus, 'review')
  assert.equal(report.selectedScenarioGate.profile.requiresCancellationAttorney, false)
  assert.ok(report.reviewItems.some((item) => item.includes('Seller Bond Status needs review')))
  assert.deepEqual(report.structuralBlockers, [])
}

function verifySelectedMatterGo() {
  const report = buildCancellationLanePhase9ActionCommandReleaseReport({
    facts: {
      financeType: 'cash',
      sellerEntityType: 'company',
      sellerHasExistingBond: true,
    },
  })

  assert.equal(report.status, 'ready_for_controlled_rollout')
  assert.equal(report.releaseGateStatus, 'go')
  assert.equal(report.selectedScenarioGate.releaseGateStatus, 'go')
  assert.equal(report.selectedScenarioGate.profile.requiresCancellationAttorney, true)
  assert.ok(report.selectedScenarioGate.profile.sellerRequirementKeys.includes('seller_company_resolution'))
}

function verifyDocAndSourceTokens() {
  const docSource = readFileSync(new URL('../docs/attorney-cancellation-lane-phase9-action-command-release.md', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js', import.meta.url), 'utf8')
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')

  assert.match(docSource, /Cancellation Lane Phase 9 Action Command Release/)
  assert.match(docSource, /buildCancellationLanePhase9ActionCommandReleaseReport/)
  assert.match(docSource, /ready_for_controlled_rollout/)
  assert.match(docSource, /node scripts\/verify-attorney-cancellation-lane-phase9\.mjs/)
  assert.match(serviceSource, /CANCELLATION_LANE_PHASE9_ACTION_COMMAND_RELEASE_VERSION/)
  assert.match(serviceSource, /CANCELLATION_PHASE9_RELEASE_CHECKLIST/)
  assert.match(serviceSource, /buildCancellationLanePhase9ActionCommandReleaseReport/)
  assert.match(usabilitySource, /CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS/)
  assert.match(usabilitySource, /buildCancellationAttorneyStageSpecificCommand/)
}

verifyReleaseGateReport()
verifyCommandPresetCoverage()
verifyRuntimeCommandHook()
verifyReleaseChecklist()
verifyScenarioGates()
verifySelectedMatterReview()
verifySelectedMatterGo()
verifyDocAndSourceTokens()

console.log('Attorney cancellation lane Phase 9 action command release verification passed.')
