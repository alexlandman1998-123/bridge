import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SELLER_COMPLIANCE_POLICY_REVIEW_STATUS,
  SELLER_COMPLIANCE_SCENARIOS,
  assessSellerCompliancePolicyReadiness,
  createSellerCompliancePolicyDraft,
} from '../sellerCompliancePolicy.js'

test('phase zero policy stays blocked until every agency approval is recorded', () => {
  const readiness = assessSellerCompliancePolicyReadiness(createSellerCompliancePolicyDraft({ organisationId: 'agency-1' }))
  assert.equal(readiness.ready, false)
  assert.equal(readiness.approvedCount, 0)
  assert.equal(readiness.missing.length, readiness.approvalCount)
})

test('policy has a defined signer and authority route for each seller scenario', () => {
  assert.deepEqual(SELLER_COMPLIANCE_SCENARIOS.multiple_owners.requiredSignerRoles, ['each_owner'])
  assert.deepEqual(SELLER_COMPLIANCE_SCENARIOS.company.authorityEvidence, ['company_resolution'])
  assert.deepEqual(SELLER_COMPLIANCE_SCENARIOS.trust.authorityEvidence, ['trustee_resolution', 'letters_of_authority'])
})

test('approved policy becomes ready only when every required decision is approved', () => {
  const draft = createSellerCompliancePolicyDraft()
  for (const approval of Object.values(draft.approvals)) approval.status = SELLER_COMPLIANCE_POLICY_REVIEW_STATUS.approved
  const readiness = assessSellerCompliancePolicyReadiness(draft)
  assert.equal(readiness.ready, true)
  assert.equal(readiness.missing.length, 0)
})
