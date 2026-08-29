import assert from 'node:assert/strict'

import {
  BOND_APPLICATION_DOCUMENT_RULES,
  BOND_APPLICATION_DOCUMENT_TIMING,
  BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION,
  BOND_ORIGINATOR_SA_BASELINE_PROFILE_VERSION,
  applyBondOriginatorRequirementProfile,
  buildBondApplicationState,
  cloneBondApplicationValue,
  resolveBondApplicationDocumentRequirements,
  resolveBondOriginatorRequirementProfile,
  validateBondApplicationSubmissionReadiness,
} from '../index.js'
import { legacyBondApplicationFixtures } from '../__fixtures__/legacyBondApplicationFixtures.js'

const portal = cloneBondApplicationValue(legacyBondApplicationFixtures.solePermanentEmployee.portal)
portal.transaction.bond_originator = 'Example Originator'
portal.transaction.bond_originator_company = 'Example Home Loans'
portal.transaction.assigned_bond_originator_email = 'applications@example.test'

const baselineResolution = resolveBondOriginatorRequirementProfile({ portal, asOf: '2026-08-28T12:00:00Z' })
assert.equal(baselineResolution.engineVersion, BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION)
assert.equal(baselineResolution.baselineVersion, BOND_ORIGINATOR_SA_BASELINE_PROFILE_VERSION)
assert.equal(baselineResolution.status, 'sa_baseline_active')
assert.equal(baselineResolution.profile, null)
assert.equal(baselineResolution.trusted, true)
assert.equal(baselineResolution.reviewTasks[0].code, 'originator_profile_not_certified')

const exampleProfile = {
  key: 'example_home_loans',
  version: 'example-2026-08-v1',
  jurisdiction: 'ZA',
  effectiveFrom: '2026-08-01',
  status: 'active',
  originatorKeys: ['Example Home Loans', 'applications@example.test'],
  overrides: [
    {
      requirementKey: 'bond_application_primary_applicant_bank_statements',
      requiredBefore: BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature,
      minimumFileCount: 3,
      evidencePeriodMonths: 3,
      allowMultipleFiles: true,
      addMatchingCanonicalTypes: ['example_originator_bank_statement'],
    },
  ],
  additions: [
    {
      key: 'example_home_loans_income_schedule',
      ruleSetVersion: 'example-2026-08-v1',
      scope: 'participant',
      participantRole: 'primary_applicant',
      canonicalDocumentType: 'proof_of_income',
      title: 'Originator income schedule',
      description: 'Income schedule requested by Example Home Loans.',
      reason: 'Originator overlay requirement.',
      visibleWhen: true,
      requiredWhen: true,
      requiredBefore: BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeBankSubmission,
      satisfactionMode: 'uploaded',
      minimumFileCount: 1,
      category: 'Financial documents',
      order: 200,
      matching: { canonicalTypes: ['example_home_loans_income_schedule'] },
    },
  ],
}

const profiledResolution = resolveBondOriginatorRequirementProfile({
  portal,
  registry: [exampleProfile],
  asOf: '2026-08-28T12:00:00Z',
})
assert.equal(profiledResolution.status, 'originator_profile_active')
assert.equal(profiledResolution.profileKey, 'example_home_loans')
assert.equal(profiledResolution.profileVersion, 'example-2026-08-v1')
assert.match(profiledResolution.fingerprint, /^phase-2-v1:[a-f0-9]{8}$/)

const applied = applyBondOriginatorRequirementProfile({ profileResolution: profiledResolution })
assert.equal(applied.trusted, true)
assert.deepEqual(applied.appliedOverrideKeys, ['bond_application_primary_applicant_bank_statements'])
assert.deepEqual(applied.addedRequirementKeys, ['example_home_loans_income_schedule'])
const strengthened = applied.rules.find((rule) => rule.key === 'bond_application_primary_applicant_bank_statements')
assert.equal(strengthened.minimumFileCount, 3)
assert.equal(strengthened.evidencePeriodMonths, 3)
assert.equal(strengthened.requiredBefore, BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature)
assert.equal(strengthened.originatorProfileVersion, 'example-2026-08-v1')
assert.ok(strengthened.matching.canonicalTypes.includes('example_originator_bank_statement'))
assert.equal(BOND_APPLICATION_DOCUMENT_RULES.find((rule) => rule.key === strengthened.key).minimumFileCount, 1)

const weakeningProfile = {
  ...exampleProfile,
  key: 'unsafe_profile',
  version: 'unsafe-v1',
  overrides: [{
    requirementKey: 'bond_application_offer_to_purchase',
    required: false,
    requiredBefore: BOND_APPLICATION_DOCUMENT_TIMING.requestedAfterOriginatorReview,
  }],
  additions: [],
}
const weakeningResolution = resolveBondOriginatorRequirementProfile({
  portal,
  profile: weakeningProfile,
  asOf: '2026-08-28T12:00:00Z',
})
const weakeningApplied = applyBondOriginatorRequirementProfile({ profileResolution: weakeningResolution })
assert.equal(weakeningApplied.trusted, false)
assert.ok(weakeningApplied.diagnostics.some((item) => item.code === 'baseline_requirement_weakening_rejected'))
const protectedOffer = weakeningApplied.rules.find((rule) => rule.key === 'bond_application_offer_to_purchase')
const baselineOffer = BOND_APPLICATION_DOCUMENT_RULES.find((rule) => rule.key === 'bond_application_offer_to_purchase')
assert.equal(protectedOffer.requiredBefore, baselineOffer.requiredBefore)

const requiredUnknown = resolveBondOriginatorRequirementProfile({
  portal,
  requireOriginatorProfile: true,
  asOf: '2026-08-28T12:00:00Z',
})
assert.equal(requiredUnknown.trusted, false)
assert.equal(requiredUnknown.blockingIssues[0].code, 'originator_profile_required')
const strictApplicationState = buildBondApplicationState(portal, {
  requireOriginatorProfile: true,
  originatorProfileAsOf: '2026-08-28T12:00:00Z',
})
const strictReadiness = validateBondApplicationSubmissionReadiness({
  applicationState: strictApplicationState,
  documentChecklist: { items: [] },
  selectedBankIds: ['bank-1'],
  signerIdentity: { fullName: 'Test Applicant', email: 'test@example.com', participantRole: 'primary_applicant' },
  declarations: [],
  latestSaveStatus: 'saved',
})
assert.ok(strictReadiness.issues.some((item) => item.category === 'requirement_profile' && item.code === 'originator_profile_required'))

const applicationState = buildBondApplicationState(portal, {
  originatorProfileRegistry: [exampleProfile],
  originatorProfileAsOf: '2026-08-28T12:00:00Z',
})
assert.equal(applicationState.requirementProfile.profileVersion, 'example-2026-08-v1')
const resolvedDocuments = resolveBondApplicationDocumentRequirements({ applicationState })
assert.equal(resolvedDocuments.requirementProfileTrusted, true)
assert.equal(resolvedDocuments.requirementProfile.profileVersion, 'example-2026-08-v1')
assert.ok(resolvedDocuments.activeRequirements.some((rule) => rule.key === 'example_home_loans_income_schedule'))
assert.ok(resolvedDocuments.activeRequirements.every((rule) => rule.requirementBaselineVersion === BOND_ORIGINATOR_SA_BASELINE_PROFILE_VERSION))

console.log('Phase 2 bond originator requirement profiles passed')
