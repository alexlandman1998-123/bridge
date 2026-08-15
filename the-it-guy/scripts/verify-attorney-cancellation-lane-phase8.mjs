import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CANCELLATION_LANE_PHASE8_UAT_RELEASE_GATE_VERSION,
  CANCELLATION_PHASE6_SCENARIO_MATRIX,
  CANCELLATION_PHASE8_UAT_CHECKLIST,
  buildCancellationLanePhase8UatReleaseGateReport,
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
  const report = buildCancellationLanePhase8UatReleaseGateReport()

  assert.equal(report.version, CANCELLATION_LANE_PHASE8_UAT_RELEASE_GATE_VERSION)
  assert.equal(report.status, 'ready_for_controlled_uat_with_warning')
  assert.equal(report.releaseGateStatus, 'go_with_phase3_gap')
  assert.equal(report.decision, 'go_with_phase3_gap')
  assert.equal(report.phase7Version, 'cancellation-lane-phase7-rollout-readiness-v1')
  assert.deepEqual(report.structuralBlockers, [])
  assert.deepEqual(report.reviewItems, [])
  assert.equal(report.signoff.requiredChecklistCount, 9)
  assert.equal(report.signoff.scenarioCount, CANCELLATION_PHASE6_SCENARIO_MATRIX.length)
  assert.equal(report.signoff.goScenarioCount, 6)
  assert.equal(report.signoff.reviewScenarioCount, 2)
  assert.equal(report.signoff.blockedScenarioCount, 0)
  assert.equal(report.signoff.blockerCount, 0)
  assert.equal(report.signoff.reviewCount, 0)
  assert.equal(report.signoff.expectedReviewCount, 3)
  assert.equal(report.signoff.warningCount, 9)
  assert.deepEqual(report.signoff.requiredSignoffRoles, ['cancellation_attorney', 'transfer_attorney', 'bond_attorney', 'operations_owner'])
}

function verifyUatChecklist() {
  const report = buildCancellationLanePhase8UatReleaseGateReport()

  assert.equal(report.uatChecklist, CANCELLATION_PHASE8_UAT_CHECKLIST)
  assert.equal(report.uatChecklist.length, 9)
  assert.equal(report.uatChecklist.every((item) => item.id && item.label && item.expectedOutcome && item.proofKey && item.required), true)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /seller bond activation/)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /Coordinate cancellation guarantees/)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /Phase 3 command-preset decision/)
}

function verifyScenarioGates() {
  const report = buildCancellationLanePhase8UatReleaseGateReport()

  const cashExistingBond = scenarioGate(report, 'cash_buyer_individual_seller_existing_bond')
  assert.equal(cashExistingBond.releaseGateStatus, 'go_with_phase3_gap')
  assert.equal(cashExistingBond.profile.financeType, 'cash')
  assert.equal(cashExistingBond.profile.requiresCancellationAttorney, true)
  assert.equal(cashExistingBond.profile.lanePolicy.buyerFinanceDoesNotControlCancellation, true)
  assert.equal(checkStatus(cashExistingBond, 'attorney_actions'), 'ready')
  assert.equal(checkStatus(cashExistingBond, 'guarantee_coordination'), 'ready')
  assert.equal(checkStatus(cashExistingBond, 'phase3_command_preset_gap'), 'warning')

  const noSellerBond = scenarioGate(report, 'cash_buyer_no_seller_bond')
  assert.equal(noSellerBond.releaseGateStatus, 'go_with_phase3_gap')
  assert.equal(noSellerBond.profile.requiresCancellationAttorney, false)
  assert.equal(noSellerBond.profile.lanePolicy.noSellerBondSuppressesCancellation, true)
  assert.equal(checkStatus(noSellerBond, 'attorney_actions'), 'ready')
  assert.equal(checkStatus(noSellerBond, 'guarantee_coordination'), 'ready')

  const unknownBond = scenarioGate(report, 'unknown_seller_bond_status')
  assert.equal(unknownBond.releaseGateStatus, 'review')
  assert.equal(unknownBond.profile.requiresCancellationAttorney, false)
  assert.equal(unknownBond.profile.lanePolicy.unknownSellerBondRequiresConfirmation, true)
  assert.equal(checkStatus(unknownBond, 'seller_bond_status'), 'review')
  assert.equal(checkStatus(unknownBond, 'lane_activation'), 'review')

  const company = scenarioGate(report, 'company_seller_existing_bond')
  assert.equal(company.releaseGateStatus, 'go_with_phase3_gap')
  assert.equal(company.profile.requiresCancellationAttorney, true)
  assert.ok(company.profile.sellerRequirementKeys.includes('seller_company_resolution'))

  const risk = scenarioGate(report, 'expired_figures_penalty_risk')
  assert.equal(risk.releaseGateStatus, 'review')
  assert.equal(risk.profile.requiresCancellationAttorney, true)
  assert.equal(checkStatus(risk, 'figures_notice_risk'), 'review')
}

function verifySelectedMatterReview() {
  const report = buildCancellationLanePhase8UatReleaseGateReport({
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

function verifySelectedMatterWarningReady() {
  const report = buildCancellationLanePhase8UatReleaseGateReport({
    facts: {
      financeType: 'cash',
      sellerEntityType: 'company',
      sellerHasExistingBond: true,
    },
  })

  assert.equal(report.status, 'ready_for_controlled_uat_with_warning')
  assert.equal(report.releaseGateStatus, 'go_with_phase3_gap')
  assert.equal(report.selectedScenarioGate.releaseGateStatus, 'go_with_phase3_gap')
  assert.equal(report.selectedScenarioGate.profile.requiresCancellationAttorney, true)
  assert.ok(report.selectedScenarioGate.profile.sellerRequirementKeys.includes('seller_signatory_authority'))
}

function verifyDocAndSourceTokens() {
  const docSource = readFileSync(new URL('../docs/attorney-cancellation-lane-phase8-uat-release-gate.md', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js', import.meta.url), 'utf8')

  assert.match(docSource, /Cancellation Lane Phase 8 UAT Release Gate/)
  assert.match(docSource, /buildCancellationLanePhase8UatReleaseGateReport/)
  assert.match(docSource, /go_with_phase3_gap/)
  assert.match(docSource, /node scripts\/verify-attorney-cancellation-lane-phase8\.mjs/)
  assert.match(serviceSource, /CANCELLATION_LANE_PHASE8_UAT_RELEASE_GATE_VERSION/)
  assert.match(serviceSource, /CANCELLATION_PHASE8_UAT_CHECKLIST/)
  assert.match(serviceSource, /buildCancellationLanePhase8UatReleaseGateReport/)
  assert.match(serviceSource, /ready_for_controlled_uat_with_warning/)
}

verifyReleaseGateReport()
verifyUatChecklist()
verifyScenarioGates()
verifySelectedMatterReview()
verifySelectedMatterWarningReady()
verifyDocAndSourceTokens()

console.log('Attorney cancellation lane Phase 8 UAT release gate verification passed.')
