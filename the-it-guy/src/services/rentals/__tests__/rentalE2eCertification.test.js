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
assert.equal(assessRentalE2eCertification({ stagingRebuild, certification: { ...certification, chainSha256: `sha256:${'b'.repeat(64)}` } }).ready, false)

console.log('Rental end-to-end certification Phase 9 contract passed.')
