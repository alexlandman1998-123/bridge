import assert from 'node:assert/strict'
import { RENTAL_FOUNDATION_MIGRATION_SOURCES } from '../rentalFoundationMigrationPlan.js'
import { assessRentalReleaseSourceBaselineLock } from '../rentalReleaseSourceBaselineLock.js'

const chainSha256 = `sha256:${'a'.repeat(64)}`
const sourceEntries = RENTAL_FOUNDATION_MIGRATION_SOURCES.map((path, index) => ({ path, sha256: `sha256:${index.toString(16).padStart(64, '0')}` }))
const input = {
  evidenceClearance: { ready: true },
  securityReview: { ready: true },
  sourceEntries,
  chainSha256,
  approval: { approved: true, approvalReference: 'PR-123', approvedAt: '2026-09-05T13:00:00.000Z', chainSha256 },
}

assert.equal(assessRentalReleaseSourceBaselineLock(input).ready, true)
assert.equal(assessRentalReleaseSourceBaselineLock(input).applyAllowed, false)
assert.equal(assessRentalReleaseSourceBaselineLock({ ...input, approval: { ...input.approval, chainSha256: `sha256:${'b'.repeat(64)}` } }).ready, false)
assert.equal(assessRentalReleaseSourceBaselineLock({ ...input, sourceEntries: [...sourceEntries].reverse() }).ready, false)

console.log('Rental release source-baseline lock Phase 5 contract passed.')
