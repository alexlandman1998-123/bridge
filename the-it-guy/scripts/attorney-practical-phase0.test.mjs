import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildAttorneyPracticalPhase0Decision } from '../src/services/attorneyPracticalReleasePhase0.js'
const bytes = readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url)); const contract = JSON.parse(bytes); const contractFingerprint = createHash('sha256').update(bytes).digest('hex')
const approval = { contractFingerprint, approvedBy: 'Release owner', approvedAt: '2026-09-06T12:00:00.000Z', approvalReference: 'uat-bar-1', confirmation: 'ACCEPT_ATTORNEY_RELEASE_BAR' }
assert.equal(buildAttorneyPracticalPhase0Decision({ contract, contractFingerprint, approval }).status, 'ACCEPTED')
assert.equal(buildAttorneyPracticalPhase0Decision({ contract, contractFingerprint, approval: null }).status, 'READY_FOR_APPROVAL')
assert.equal(buildAttorneyPracticalPhase0Decision({ contract: { ...contract, viewports: ['desktop'] }, contractFingerprint, approval }).status, 'INVALID')
assert.equal(buildAttorneyPracticalPhase0Decision({ contract: { ...contract, soak: { ...contract.soak, minimumHours: 0 } }, contractFingerprint, approval }).status, 'INVALID')
assert.equal(buildAttorneyPracticalPhase0Decision({ contract, contractFingerprint, approval: { ...approval, contractFingerprint: 'stale' } }).status, 'READY_FOR_APPROVAL')
const checker = readFileSync(new URL('./check-attorney-practical-phase0.mjs', import.meta.url), 'utf8')
assert.match(checker, /productionMutated: false/)
assert.doesNotMatch(checker, /db\.from\([^\n]+\)\.(insert|update|upsert|delete)\(/)
console.log('Attorney practical release Phase 0 acceptance contract passed.')
