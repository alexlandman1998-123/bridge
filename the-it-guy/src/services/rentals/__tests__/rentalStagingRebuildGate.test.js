import assert from 'node:assert/strict'
import { assessRentalStagingRebuildGate } from '../rentalStagingRebuildGate.js'

const chainSha256 = `sha256:${'a'.repeat(64)}`
const base = {
  sourceBaseline: { ready: true, chainSha256 },
  localReceipt: { confirmed: true, reference: 'LOCAL-1', recordedAt: '2026-09-05T13:00:00.000Z', chainSha256 },
  target: { approved: true, approvalReference: 'STAGE-1', approvedAt: '2026-09-05T13:01:00.000Z', mode: 'fresh', projectRef: 'abcdefghijklmnoabcde', outboundIntegrationsFrozen: true },
  evidence: {},
}
assert.equal(assessRentalStagingRebuildGate(base).ready, true)
assert.equal(assessRentalStagingRebuildGate({ ...base, target: { ...base.target, projectRef: 'isdowlnollckzvltkasn' } }).ready, false)
assert.equal(assessRentalStagingRebuildGate({ ...base, localReceipt: { ...base.localReceipt, chainSha256: `sha256:${'b'.repeat(64)}` } }).ready, false)
assert.equal(assessRentalStagingRebuildGate({ ...base, target: { ...base.target, mode: 'replace_disposable', projectRef: 'vaszuxjeoajeuhlcnzzf' }, evidence: { stagingRecovery: { confirmed: true, recoveryMode: 'disposable' } } }).ready, true)

console.log('Rental staging rebuild gate Phase 8 contract passed.')
