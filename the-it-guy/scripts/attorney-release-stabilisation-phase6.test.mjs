import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAttorneyReleaseStabilisationDecision } from '../src/services/attorneyReleaseStabilisation.js'
const sourceFingerprint = 'phase5-ledger-fingerprint'
const phase5Ledger = { environment: 'staging', projectRef: 'staging-ref', ledgerFingerprint: sourceFingerprint, batches: [{ mode: 'apply', beforeGapCount: 129, afterGapCount: 0, repairedCount: 129 }] }
const healthy = {
  phase5Ledger,
  observation: { sourceFingerprint, observedAt: '2026-09-05T12:00:00.000Z', cohortSize: 2, observationHours: 72, totalActions: 36, actionsByRole: { transfer_attorney: 16, bond_attorney: 10, cancellation_attorney: 10 }, successfulActionRate: 1, propagationP95Seconds: 45, securityIncidents: 0, visibilityBreaches: 0, dataIntegrityFailures: 0, unexpectedPermissionAllows: 0, unresolvedCriticalIncidents: 0 },
  currentPropagation: { status: 'healthy', gapCount: 0 },
  rollbackReadiness: { sourceFingerprint, owner: 'Release owner', approvalReference: 'release-123', verifiedAt: '2026-09-05T11:00:00.000Z' },
  evaluatedAt: '2026-09-05T12:05:00.000Z',
}
assert.equal(buildAttorneyReleaseStabilisationDecision(healthy).status, 'STABILIZED')
assert.equal(buildAttorneyReleaseStabilisationDecision({ ...healthy, phase5Ledger: { ...phase5Ledger, batches: [] } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleaseStabilisationDecision({ ...healthy, observation: { ...healthy.observation, observationHours: 24 } }).status, 'HOLD')
assert.equal(buildAttorneyReleaseStabilisationDecision({ ...healthy, observation: { ...healthy.observation, observedAt: '2026-09-05T11:00:00.000Z' } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleaseStabilisationDecision({ ...healthy, observation: { ...healthy.observation, visibilityBreaches: 1 } }).status, 'ROLLBACK')
assert.equal(buildAttorneyReleaseStabilisationDecision({ ...healthy, currentPropagation: { status: 'degraded', gapCount: 1 } }).status, 'ROLLBACK')
for (const key of ['securityIncidents', 'dataIntegrityFailures', 'unexpectedPermissionAllows']) assert.equal(buildAttorneyReleaseStabilisationDecision({ ...healthy, observation: { ...healthy.observation, [key]: 1 } }).status, 'ROLLBACK')
const checker = readFileSync(new URL('./check-attorney-release-phase6-staging.mjs', import.meta.url), 'utf8')
const observer = readFileSync(new URL('./observe-attorney-release-phase6-staging.mjs', import.meta.url), 'utf8')
assert.match(checker, /ATTORNEY_RELEASE_PHASE5_LEDGER_FILE/)
assert.match(checker, /check-attorney-release-phase3-staging\.mjs/)
assert.doesNotMatch(checker, /db\.from\([^\n]+\)\.(insert|update|upsert|delete)\(/)
assert.match(observer, /transaction_sync_command_receipts/)
assert.match(observer, /assertAttorneyStagingTarget/)
assert.doesNotMatch(observer, /db\.from\([^\n]+\)\.(insert|update|upsert|delete)\(/)
console.log('Attorney release Phase 6 live observation contract passed.')
