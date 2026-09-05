import assert from 'node:assert/strict'
import { assessRentalProductionReleaseAuthority } from '../rentalProductionReleaseAuthority.js'

const preflightReceipt = { confirmed: true, reference: 'PRE-1', recordedAt: '2026-09-05T13:00:00.000Z', releaseCommit: 'a'.repeat(40), sourceChainSha256: `sha256:${'b'.repeat(64)}`, productionProjectRef: 'isdowlnollckzvltkasn' }
const authority = { approved: true, approvalReference: 'REL-1', approvedAt: '2026-09-05T13:01:00.000Z', releaseCommit: preflightReceipt.releaseCommit, sourceChainSha256: preflightReceipt.sourceChainSha256, productionProjectRef: 'isdowlnollckzvltkasn', rollbackReference: 'ROLL-1', operations: ['database_migrations', 'application_deployment', 'post_release_smoke_checks'] }
assert.equal(assessRentalProductionReleaseAuthority({ preflightReceipt, authority }).ready, true)
assert.equal(assessRentalProductionReleaseAuthority({ preflightReceipt, authority: { ...authority, operations: ['database_migrations'] } }).ready, false)
assert.equal(assessRentalProductionReleaseAuthority({ preflightReceipt, authority: { ...authority, releaseCommit: 'c'.repeat(40) } }).ready, false)
assert.equal(assessRentalProductionReleaseAuthority({ preflightReceipt, authority }).applyAllowed, false)

console.log('Rental production release-authority Phase 11 contract passed.')
