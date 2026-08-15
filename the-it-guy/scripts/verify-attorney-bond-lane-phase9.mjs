import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BOND_LANE_PHASE9_UAT_RELEASE_GATE_VERSION,
  BOND_PHASE7_SCENARIO_MATRIX,
  BOND_PHASE9_UAT_CHECKLIST,
  buildBondLanePhase9UatReleaseGateReport,
} from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'

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
  const report = buildBondLanePhase9UatReleaseGateReport()

  assert.equal(report.version, BOND_LANE_PHASE9_UAT_RELEASE_GATE_VERSION)
  assert.equal(report.status, 'ready_for_controlled_rollout')
  assert.equal(report.releaseGateStatus, 'go')
  assert.equal(report.decision, 'go')
  assert.equal(report.phase8Version, 'bond-lane-phase8-rollout-readiness-v1')
  assert.deepEqual(report.structuralBlockers, [])
  assert.deepEqual(report.reviewItems, [])
  assert.equal(report.signoff.requiredChecklistCount, 9)
  assert.equal(report.signoff.scenarioCount, BOND_PHASE7_SCENARIO_MATRIX.length)
  assert.equal(report.signoff.goScenarioCount, 6)
  assert.equal(report.signoff.reviewScenarioCount, 1)
  assert.equal(report.signoff.blockedScenarioCount, 0)
  assert.equal(report.signoff.blockerCount, 0)
  assert.equal(report.signoff.reviewCount, 0)
  assert.equal(report.signoff.expectedReviewCount, 2)
  assert.deepEqual(report.signoff.requiredSignoffRoles, ['bond_attorney', 'transfer_attorney', 'bond_originator', 'operations_owner'])
}

function verifyUatChecklist() {
  const report = buildBondLanePhase9UatReleaseGateReport()

  assert.equal(report.uatChecklist, BOND_PHASE9_UAT_CHECKLIST)
  assert.equal(report.uatChecklist.length, 9)
  assert.equal(report.uatChecklist.every((item) => item.id && item.label && item.expectedOutcome && item.proofKey && item.required), true)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /finance route lane activation/)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /Coordinate guarantees/)
  assert.match(report.uatChecklist.map((item) => item.label).join('\n'), /Run legal structure and cancellation scenarios/)
}

function verifyScenarioGates() {
  const report = buildBondLanePhase9UatReleaseGateReport()

  const cash = scenarioGate(report, 'cash_individual_unmarried')
  assert.equal(cash.releaseGateStatus, 'go')
  assert.equal(cash.profile.requiresBondAttorney, false)
  assert.equal(cash.profile.lanePolicy.cashRouteSuppressesBondLanes, true)
  assert.equal(checkStatus(cash, 'attorney_actions'), 'ready')
  assert.equal(checkStatus(cash, 'coordination'), 'ready')

  const bond = scenarioGate(report, 'bond_married_out_of_community')
  assert.equal(bond.releaseGateStatus, 'go')
  assert.equal(bond.profile.requiresBondOriginator, true)
  assert.equal(bond.profile.requiresBondAttorney, true)
  assert.ok(bond.profile.buyerRequirementKeys.includes('buyer_antenuptial_contract'))
  assert.equal(checkStatus(bond, 'originator_evidence'), 'ready')
  assert.equal(checkStatus(bond, 'attorney_actions'), 'ready')
  assert.equal(checkStatus(bond, 'coordination'), 'ready')

  const companyTrust = scenarioGate(report, 'bond_company_buyer_trust_seller_cancellation')
  assert.equal(companyTrust.releaseGateStatus, 'go')
  assert.equal(companyTrust.profile.requiresCancellationAttorney, true)
  assert.ok(companyTrust.profile.buyerRequirementKeys.includes('buyer_company_resolution'))
  assert.equal(checkStatus(companyTrust, 'cancellation_routing'), 'ready')

  const trustHybrid = scenarioGate(report, 'hybrid_trust_buyer_company_seller_cancellation')
  assert.equal(trustHybrid.releaseGateStatus, 'go')
  assert.equal(trustHybrid.profile.financeType, 'combination')
  assert.ok(trustHybrid.profile.buyerRequirementKeys.includes('buyer_trustee_resolution'))

  const unknown = scenarioGate(report, 'unknown_finance_company_buyer')
  assert.equal(unknown.releaseGateStatus, 'review')
  assert.equal(unknown.profile.requiresBondAttorney, false)
  assert.equal(unknown.profile.lanePolicy.unknownFinanceRequiresConfirmation, true)
  assert.equal(checkStatus(unknown, 'finance_route'), 'review')
  assert.equal(checkStatus(unknown, 'lane_activation'), 'review')
}

function verifySelectedMatterReview() {
  const report = buildBondLanePhase9UatReleaseGateReport({
    facts: {
      buyerEntityType: 'company',
      sellerEntityType: 'individual',
      sellerHasExistingBond: false,
    },
    scenarioLabel: 'Selected unknown finance company matter',
  })

  assert.equal(report.status, 'review_required')
  assert.equal(report.releaseGateStatus, 'review')
  assert.equal(report.selectedScenarioGate.releaseGateStatus, 'review')
  assert.equal(report.selectedScenarioGate.profile.requiresBondAttorney, false)
  assert.ok(report.reviewItems.some((item) => item.includes('Finance Route needs review')))
  assert.deepEqual(report.structuralBlockers, [])
}

function verifySelectedMatterGo() {
  const report = buildBondLanePhase9UatReleaseGateReport({
    facts: {
      financeType: 'bond',
      buyerEntityType: 'trust',
      sellerEntityType: 'company',
      sellerHasExistingBond: true,
    },
  })

  assert.equal(report.status, 'ready_for_controlled_rollout')
  assert.equal(report.releaseGateStatus, 'go')
  assert.equal(report.selectedScenarioGate.releaseGateStatus, 'go')
  assert.equal(report.selectedScenarioGate.profile.requiresBondAttorney, true)
  assert.equal(report.selectedScenarioGate.profile.requiresCancellationAttorney, true)
  assert.ok(report.selectedScenarioGate.profile.buyerRequirementKeys.includes('buyer_trust_deed'))
}

function verifyDocAndSourceTokens() {
  const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase9-uat-release-gate.md', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/bondLaneJourneyMap.js', import.meta.url), 'utf8')

  assert.match(docSource, /Bond Lane Phase 9 UAT And Release Gate/)
  assert.match(docSource, /buildBondLanePhase9UatReleaseGateReport/)
  assert.match(docSource, /unknown finance/)
  assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase9\.mjs/)
  assert.match(serviceSource, /BOND_LANE_PHASE9_UAT_RELEASE_GATE_VERSION/)
  assert.match(serviceSource, /BOND_PHASE9_UAT_CHECKLIST/)
  assert.match(serviceSource, /buildBondLanePhase9UatReleaseGateReport/)
  assert.match(serviceSource, /ready_for_controlled_rollout/)
}

verifyReleaseGateReport()
verifyUatChecklist()
verifyScenarioGates()
verifySelectedMatterReview()
verifySelectedMatterGo()
verifyDocAndSourceTokens()

console.log('Attorney bond lane Phase 9 UAT release gate verification passed.')
