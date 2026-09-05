import assert from 'node:assert/strict'
import { assessRentalProductionPreflight } from '../rentalProductionPreflight.js'

const headCommit = 'a'.repeat(40)
const sourceBaseline = { ready: true, chainSha256: `sha256:${'b'.repeat(64)}` }
const candidate = { approved: true, approvalReference: 'REL-1', approvedAt: '2026-09-05T13:00:00.000Z', releaseCommit: headCommit, sourceChainSha256: sourceBaseline.chainSha256, productionProjectRef: 'isdowlnollckzvltkasn', rollbackReference: 'ROLLBACK-1', deploymentFrozen: true }
const input = { stagingCertification: { ready: true }, sourceBaseline, candidate, headCommit, workingTreeClean: true }
assert.equal(assessRentalProductionPreflight(input).ready, true)
assert.equal(assessRentalProductionPreflight({ ...input, workingTreeClean: false }).ready, false)
assert.equal(assessRentalProductionPreflight({ ...input, candidate: { ...candidate, productionProjectRef: 'vaszuxjeoajeuhlcnzzf' } }).ready, false)
assert.equal(assessRentalProductionPreflight(input).applyAllowed, false)

console.log('Rental production preflight Phase 10 contract passed.')
