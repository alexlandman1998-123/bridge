import assert from 'node:assert/strict'
import { assessRentalE2eCertification, RENTAL_E2E_SCENARIOS } from '../rentalE2eCertification.js'

const stagingRebuild = { ready: true, target: 'abcdefghijklmnoabcde', chainSha256: `sha256:${'a'.repeat(64)}` }
const certification = {
  projectRef: stagingRebuild.target,
  chainSha256: stagingRebuild.chainSha256,
  scenarios: RENTAL_E2E_SCENARIOS.map((id) => ({ id, passed: true, reference: `${id}-ref`, recordedAt: '2026-09-05T13:00:00.000Z' })),
}
assert.equal(assessRentalE2eCertification({ stagingRebuild, certification }).ready, true)
assert.deepEqual(assessRentalE2eCertification({ stagingRebuild, certification: { ...certification, scenarios: certification.scenarios.slice(1) } }).failedScenarios, ['lead_capture_and_qualification'])
for (const id of ['tenant_and_landlord_enquiries_excluded_from_sales', 'lead_branch_and_agent_access', 'application_link_pending_until_submission', 'landlord_lead_signed_mandate_and_linked_listing']) {
  assert.deepEqual(assessRentalE2eCertification({ stagingRebuild, certification: { ...certification, scenarios: certification.scenarios.filter((scenario) => scenario.id !== id) } }).failedScenarios, [id])
}
assert.equal(assessRentalE2eCertification({ stagingRebuild, certification: { ...certification, scenarios: certification.scenarios.map((scenario) => scenario.id === 'application_link_pending_until_submission' ? { ...scenario, reference: '' } : scenario) } }).ready, false)
assert.deepEqual(assessRentalE2eCertification({ stagingRebuild, certification: { ...certification, scenarios: [...certification.scenarios, certification.scenarios[0]] } }).failedScenarios, ['lead_capture_and_qualification'])
assert.equal(assessRentalE2eCertification({ stagingRebuild, certification: { ...certification, chainSha256: `sha256:${'b'.repeat(64)}` } }).ready, false)

console.log('Rental end-to-end certification Phase 9 contract passed.')
