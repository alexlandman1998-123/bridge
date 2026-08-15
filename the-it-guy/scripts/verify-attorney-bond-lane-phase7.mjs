import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BOND_LANE_PHASE7_SCENARIO_COVERAGE_VERSION,
  BOND_PHASE7_SCENARIO_MATRIX,
  buildBondLanePhase7ScenarioCoveragePlan,
  buildBondLaneScenarioProfile,
} from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'

function verifyPlan() {
  const plan = buildBondLanePhase7ScenarioCoveragePlan()

  assert.equal(plan.version, BOND_LANE_PHASE7_SCENARIO_COVERAGE_VERSION)
  assert.equal(plan.status, 'ready_for_phase8')
  assert.deepEqual(plan.structuralBlockers, [])
  assert.equal(plan.scenarioCount, BOND_PHASE7_SCENARIO_MATRIX.length)
  assert.equal(plan.scenarios.every((scenario) => scenario.status === 'covered'), true)
  assert.equal(plan.coverageSummary.cashScenarios, 2)
  assert.equal(plan.coverageSummary.bondScenarios, 4)
  assert.equal(plan.coverageSummary.unknownFinanceScenarios, 1)
  assert.equal(plan.coverageSummary.cancellationScenarios, 2)
  assert.equal(plan.coverageSummary.companyBuyerScenarios, 2)
  assert.equal(plan.coverageSummary.trustBuyerScenarios, 1)
  assert.equal(plan.coverageSummary.marriedBuyerScenarios, 2)
  assert.equal(plan.coverageSummary.multipleBuyerScenarios, 1)
}

function verifyCashSuppression() {
  const profile = buildBondLaneScenarioProfile({
    financeType: 'cash',
    buyerEntityType: 'individual',
    buyerMaritalStatus: 'single',
    sellerEntityType: 'individual',
    sellerHasExistingBond: false,
  })

  assert.equal(profile.requiresBondOriginator, false)
  assert.equal(profile.requiresBondAttorney, false)
  assert.equal(profile.requiresCancellationAttorney, false)
  assert.equal(profile.lanePolicy.cashRouteSuppressesBondLanes, true)
  assert.equal(profile.lanePolicy.concurrentWorkAllowed, true)
  assert.ok(profile.buyerRequirementKeys.includes('buyer_identity'))
  assert.ok(!profile.buyerRequirementKeys.includes('buyer_income_documents'))
}

function verifyMarriedAndMultipleBuyerCoverage() {
  const married = buildBondLaneScenarioProfile({
    financeType: 'bond',
    buyerEntityType: 'individual',
    buyerMaritalStatus: 'married_out_of_community',
    sellerEntityType: 'individual',
  })
  assert.equal(married.requiresBondAttorney, true)
  assert.ok(married.buyerRequirementKeys.includes('buyer_marital_status'))
  assert.ok(married.buyerRequirementKeys.includes('buyer_antenuptial_contract'))
  assert.ok(!married.buyerRequirementKeys.includes('buyer_spouse_consent'))

  const multiple = buildBondLaneScenarioProfile({
    financeType: 'bond',
    buyerEntityType: 'individual',
    hasMultipleBuyers: true,
    sellerEntityType: 'individual',
  })
  assert.ok(multiple.buyerRequirementKeys.includes('co_buyer_finance_applications'))
}

function verifyCompanyTrustAndCancellationCoverage() {
  const company = buildBondLaneScenarioProfile({
    financeType: 'bond',
    buyerEntityType: 'company',
    sellerEntityType: 'trust',
    sellerHasExistingBond: true,
  })
  assert.equal(company.requiresBondOriginator, true)
  assert.equal(company.requiresBondAttorney, true)
  assert.equal(company.requiresCancellationAttorney, true)
  assert.ok(company.buyerRequirementKeys.includes('buyer_company_resolution'))
  assert.ok(company.buyerRequirementKeys.includes('buyer_company_financials'))

  const trust = buildBondLaneScenarioProfile({
    financeType: 'hybrid',
    buyerEntityType: 'trust',
    sellerEntityType: 'company',
    sellerHasExistingBond: true,
  })
  assert.equal(trust.financeType, 'combination')
  assert.equal(trust.requiresBondAttorney, true)
  assert.ok(trust.buyerRequirementKeys.includes('buyer_trust_deed'))
  assert.ok(trust.buyerRequirementKeys.includes('buyer_trustee_resolution'))
}

function verifyUnknownFinanceAttention() {
  const profile = buildBondLaneScenarioProfile({
    buyerEntityType: 'company',
    sellerEntityType: 'individual',
  })

  assert.equal(profile.financeType, 'unknown')
  assert.equal(profile.status, 'attention')
  assert.equal(profile.requiresBondOriginator, false)
  assert.equal(profile.requiresBondAttorney, false)
  assert.equal(profile.lanePolicy.unknownFinanceRequiresConfirmation, true)
  assert.ok(profile.buyerRequirementKeys.includes('buyer_company_registration'))
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase7-scenario-coverage.md', import.meta.url), 'utf8')
  assert.match(docSource, /Bond Lane Phase 7 Scenario Coverage/)
  assert.match(docSource, /Cash individual buyer/)
  assert.match(docSource, /Company buyer, trust seller/)
  assert.match(docSource, /Unknown finance company buyer/)
  assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase7\.mjs/)
}

verifyPlan()
verifyCashSuppression()
verifyMarriedAndMultipleBuyerCoverage()
verifyCompanyTrustAndCancellationCoverage()
verifyUnknownFinanceAttention()
verifyDoc()

console.log('Attorney bond lane Phase 7 scenario coverage verification passed.')
