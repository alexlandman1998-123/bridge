import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CANCELLATION_LANE_PHASE6_SCENARIO_COVERAGE_VERSION,
  CANCELLATION_PHASE6_SCENARIO_MATRIX,
  buildCancellationLanePhase6ScenarioCoveragePlan,
  buildCancellationLaneScenarioProfile,
} from '../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js'

function verifyPlan() {
  const plan = buildCancellationLanePhase6ScenarioCoveragePlan()

  assert.equal(plan.version, CANCELLATION_LANE_PHASE6_SCENARIO_COVERAGE_VERSION)
  assert.equal(plan.status, 'ready_for_phase7')
  assert.equal(plan.phase5Version, 'cancellation-lane-phase5-lodgement-coordination-v1')
  assert.deepEqual(plan.structuralBlockers, [])
  assert.equal(plan.scenarioCount, CANCELLATION_PHASE6_SCENARIO_MATRIX.length)
  assert.equal(plan.scenarios.every((scenario) => scenario.status === 'covered'), true)
  assert.equal(plan.coverageSummary.activeCancellationScenarios, 6)
  assert.equal(plan.coverageSummary.suppressedCancellationScenarios, 1)
  assert.equal(plan.coverageSummary.attentionScenarios, 2)
  assert.equal(plan.coverageSummary.cashFinanceScenarios, 3)
  assert.equal(plan.coverageSummary.bondFinanceScenarios, 5)
  assert.equal(plan.coverageSummary.companySellerScenarios, 1)
  assert.equal(plan.coverageSummary.trustSellerScenarios, 2)
  assert.equal(plan.coverageSummary.figuresRiskScenarios, 1)
  assert.equal(plan.skippedPhase3Dependency.phase3Implemented, false)
}

function verifyCashBuyerCanStillRequireCancellation() {
  const profile = buildCancellationLaneScenarioProfile({
    financeType: 'cash',
    sellerEntityType: 'individual',
    sellerHasExistingBond: true,
  })

  assert.equal(profile.financeType, 'cash')
  assert.equal(profile.requiresCancellationAttorney, true)
  assert.equal(profile.lanePolicy.cancellationLaneActive, true)
  assert.equal(profile.lanePolicy.buyerFinanceDoesNotControlCancellation, true)
  assert.ok(profile.sellerRequirementKeys.includes('seller_existing_bond_confirmation'))
  assert.ok(profile.sellerRequirementKeys.includes('seller_cancellation_documents_signature'))
}

function verifyNoSellerBondSuppressesCancellation() {
  const profile = buildCancellationLaneScenarioProfile({
    financeType: 'bond',
    sellerEntityType: 'individual',
    sellerHasExistingBond: false,
  })

  assert.equal(profile.requiresCancellationAttorney, false)
  assert.equal(profile.lanePolicy.cancellationLaneActive, false)
  assert.equal(profile.lanePolicy.noSellerBondSuppressesCancellation, true)
  assert.ok(profile.sellerRequirementKeys.includes('seller_identity'))
  assert.equal(profile.sellerRequirementKeys.includes('cancellation_figures'), false)
}

function verifyUnknownSellerBondAttention() {
  const profile = buildCancellationLaneScenarioProfile({
    financeType: 'bond',
    sellerEntityType: 'individual',
  })

  assert.equal(profile.status, 'attention')
  assert.equal(profile.requiresCancellationAttorney, false)
  assert.equal(profile.lanePolicy.unknownSellerBondRequiresConfirmation, true)
  assert.ok(profile.attentionReasons.includes('seller_existing_bond_status_unknown'))
  assert.ok(profile.sellerRequirementKeys.includes('seller_existing_bond_status_to_confirm'))
}

function verifyCompanyTrustAndRiskCoverage() {
  const company = buildCancellationLaneScenarioProfile({
    financeType: 'cash',
    sellerEntityType: 'company',
    sellerHasExistingBond: true,
  })
  assert.equal(company.requiresCancellationAttorney, true)
  assert.ok(company.sellerRequirementKeys.includes('seller_company_resolution'))
  assert.ok(company.sellerRequirementKeys.includes('seller_signatory_authority'))

  const trust = buildCancellationLaneScenarioProfile({
    financeType: 'hybrid',
    sellerEntityType: 'trust',
    sellerHasExistingBond: true,
  })
  assert.equal(trust.financeType, 'combination')
  assert.equal(trust.requiresCancellationAttorney, true)
  assert.ok(trust.sellerRequirementKeys.includes('seller_trust_deed'))
  assert.ok(trust.sellerRequirementKeys.includes('seller_trustee_resolution'))

  const risk = buildCancellationLaneScenarioProfile({
    financeType: 'bond',
    sellerEntityType: 'individual',
    sellerHasExistingBond: true,
    figuresExpired: true,
    penaltyRisk: true,
  })
  assert.equal(risk.status, 'attention')
  assert.equal(risk.requiresCancellationAttorney, true)
  assert.ok(risk.attentionReasons.includes('figures_expired_or_stale'))
  assert.ok(risk.attentionReasons.includes('penalty_risk_present'))
  assert.ok(risk.sellerRequirementKeys.includes('figures_refresh_required'))
  assert.ok(risk.sellerRequirementKeys.includes('penalty_notice_risk'))
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-cancellation-lane-phase6-scenario-coverage.md', import.meta.url), 'utf8')
  assert.match(docSource, /Cancellation Lane Phase 6 Scenario Coverage/)
  assert.match(docSource, /Cash buyer, individual seller with existing bond/)
  assert.match(docSource, /Unknown seller bond status/)
  assert.match(docSource, /Expired figures and penalty risk/)
  assert.match(docSource, /node scripts\/verify-attorney-cancellation-lane-phase6\.mjs/)
}

verifyPlan()
verifyCashBuyerCanStillRequireCancellation()
verifyNoSellerBondSuppressesCancellation()
verifyUnknownSellerBondAttention()
verifyCompanyTrustAndRiskCoverage()
verifyDoc()

console.log('Attorney cancellation lane Phase 6 scenario coverage verification passed.')
