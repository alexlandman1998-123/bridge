import assert from 'node:assert/strict'

import {
  BOND_APPLICATION_DOCUMENT_TIMING,
  BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION,
  BOND_ORIGINATOR_REPRESENTATIVE_ACCEPTANCE_PROFILES,
  buildBondOriginatorMultiProfileAcceptanceReport,
} from '../index.js'

const certified = buildBondOriginatorMultiProfileAcceptanceReport()
assert.equal(BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION, 'phase-8-v1')
assert.equal(certified.status, 'acceptance_certified')
assert.equal(certified.certified, true)
assert.equal(certified.metrics.profileCount, 3)
assert.equal(certified.metrics.scenarioCountPerProfile, 54)
assert.equal(certified.metrics.totalScenarioExecutions, 162)
assert.equal(certified.profileResults.every((profile) => profile.certified), true)
assert.equal(certified.profileResults.every((profile) => profile.metrics.failedCount === 0), true)
assert.equal(certified.profileResults.every((profile) => profile.scenarioResults.every((scenario) => scenario.decision === 'requirements_resolved_not_credit_approved')), true)
assert.match(certified.fingerprint, /^phase-8-v1:/)

const strictProfile = certified.profileResults.find((profile) => profile.profileKey === 'representative_strict_income')
const strictPermanent = strictProfile.scenarioResults.find((scenario) => scenario.key === 'sole:individual:permanent')
const baselinePermanent = certified.profileResults
  .find((profile) => profile.profileKey === 'za_baseline')
  .scenarioResults.find((scenario) => scenario.key === 'sole:individual:permanent')
assert.notDeepEqual(strictPermanent.requirementFingerprints, baselinePermanent.requirementFingerprints)

const missingOwner = {
  ...BOND_ORIGINATOR_REPRESENTATIVE_ACCEPTANCE_PROFILES[1],
  key: 'missing_owner',
  version: 'missing-owner-v1',
  owner: '',
}
const missingOwnerReport = buildBondOriginatorMultiProfileAcceptanceReport({ profiles: [missingOwner] })
assert.equal(missingOwnerReport.certified, false)
assert.ok(missingOwnerReport.profileResults[0].metadataDiagnostics.some((item) => item.code === 'profile_owner_required'))

const weakeningProfile = {
  ...BOND_ORIGINATOR_REPRESENTATIVE_ACCEPTANCE_PROFILES[1],
  key: 'weakening_overlay',
  version: 'weakening-v1',
  overrides: [{
    requirementKey: 'bond_application_offer_to_purchase',
    required: false,
    requiredBefore: BOND_APPLICATION_DOCUMENT_TIMING.requestedAfterOriginatorReview,
  }],
}
const weakeningReport = buildBondOriginatorMultiProfileAcceptanceReport({ profiles: [weakeningProfile] })
assert.equal(weakeningReport.certified, false)
assert.ok(weakeningReport.profileResults[0].profileDiagnostics.some((item) => item.code === 'baseline_requirement_weakening_rejected'))

const expiredProfile = {
  ...BOND_ORIGINATOR_REPRESENTATIVE_ACCEPTANCE_PROFILES[1],
  key: 'expired_overlay',
  version: 'expired-v1',
  effectiveTo: '2026-08-27T23:59:59Z',
}
const expiredReport = buildBondOriginatorMultiProfileAcceptanceReport({ profiles: [expiredProfile] })
assert.equal(expiredReport.certified, false)
assert.ok(expiredReport.profileResults[0].metadataDiagnostics.some((item) => item.code === 'profile_not_effective'))

const unsafeDecisionProfile = {
  ...BOND_ORIGINATOR_REPRESENTATIVE_ACCEPTANCE_PROFILES[1],
  key: 'unsafe_decision_overlay',
  version: 'unsafe-decision-v1',
  autoApprove: true,
}
const unsafeDecisionReport = buildBondOriginatorMultiProfileAcceptanceReport({ profiles: [unsafeDecisionProfile] })
assert.equal(unsafeDecisionReport.certified, false)
assert.ok(unsafeDecisionReport.profileResults[0].metadataDiagnostics.some((item) => item.code === 'inferred_lender_decision_forbidden'))

console.log('Phase 8 multi-profile South African originator acceptance passed')
