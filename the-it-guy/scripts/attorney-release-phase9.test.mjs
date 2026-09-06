import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAttorneyReleasePhase9Decision } from '../src/services/attorneyReleasePhase9.js'
const deploymentId = 'dpl_canary'; const planFingerprint = 'plan-fingerprint'; const evaluatedAt = '2026-09-09T12:05:00.000Z'
const executionReceipt = { status: 'CANARY_ACTIVE', immutable: true, deploymentId, planFingerprint }
const observation = { deploymentId, planFingerprint, observedAt: '2026-09-09T12:00:00.000Z', observationHours: 24, totalActions: 18, actionsByRole: { transfer_attorney: 8, bond_attorney: 5, cancellation_attorney: 5 }, successfulActionRate: 1, propagationP95Seconds: 30, propagationStatus: 'healthy', propagationGapCount: 0, runtimeErrorCount: 0, clientUnsafeProjectionCount: 0, securityIncidents: 0, visibilityBreaches: 0, dataIntegrityFailures: 0, unexpectedPermissionAllows: 0, unresolvedCriticalIncidents: 0 }
const ready = { executionReceipt, receiptIntegrityPassed: true, observation, evidenceIntegrityPassed: true, evaluatedAt }
assert.equal(buildAttorneyReleasePhase9Decision(ready).status, 'VERIFIED')
assert.equal(buildAttorneyReleasePhase9Decision({ ...ready, executionReceipt: null }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase9Decision({ executionReceipt: null, observation: null, evaluatedAt }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase9Decision({ ...ready, observation: { ...observation, observationHours: 2 } }).status, 'OBSERVE')
assert.equal(buildAttorneyReleasePhase9Decision({ ...ready, observation: { ...observation, propagationGapCount: 1 } }).status, 'ROLLBACK')
assert.equal(buildAttorneyReleasePhase9Decision({ ...ready, observation: { ...observation, visibilityBreaches: 1 }, evidenceIntegrityPassed: false }).status, 'ROLLBACK')
assert.equal(buildAttorneyReleasePhase9Decision({ ...ready, observation: { ...observation, runtimeErrorCount: 1 } }).status, 'ROLLBACK')
assert.equal(buildAttorneyReleasePhase9Decision({ ...ready, observation: { ...observation, observedAt: '2026-09-09T11:00:00.000Z' } }).status, 'BLOCKED')
const checker = readFileSync(new URL('./check-attorney-release-phase9.mjs', import.meta.url), 'utf8')
assert.match(checker, /receiptIntegrityPassed/); assert.match(checker, /evidenceIntegrityPassed/)
assert.match(checker, /mutatedProduction: false/); assert.match(checker, /rollbackPerformed: false/)
assert.match(checker, /flag: 'wx'/); assert.match(checker, /mode: 0o400/)
assert.doesNotMatch(checker, /vercel (deploy|promote|rollback)/)
assert.doesNotMatch(checker, /db\.from\([^\n]+\)\.(insert|update|upsert|delete)\(/)
console.log('Attorney release Phase 9 canary assurance and rollback decision contract passed.')
