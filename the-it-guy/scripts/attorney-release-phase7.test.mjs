import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ATTORNEY_RELEASE_PHASE7_CONFIRMATION, buildAttorneyReleasePhase7Decision } from '../src/services/attorneyReleasePhase7.js'
const releaseFingerprint = 'release-fingerprint'
const phase6Report = { status: 'STABILIZED', sourceFingerprint: 'phase5-ledger', rollbackTriggers: [], evidence: { artifactIntegrityPassed: true, livePropagationCheckPassed: true } }
const approval = { releaseFingerprint, approvedBy: 'Release owner', approvedAt: '2026-09-08T12:00:00.000Z', approvalReference: 'release-123', confirmation: ATTORNEY_RELEASE_PHASE7_CONFIRMATION }
const ready = { releaseFingerprint, phase6Report, observationRefreshPassed: true, codeGatePassed: true, buildPassed: true, approval }
assert.equal(buildAttorneyReleasePhase7Decision(ready).status, 'GO')
assert.equal(buildAttorneyReleasePhase7Decision({ ...ready, phase6Report: { ...phase6Report, status: 'HOLD' } }).status, 'NO_GO')
assert.equal(buildAttorneyReleasePhase7Decision({ ...ready, phase6Report: { ...phase6Report, rollbackTriggers: [{ code: 'REGRESSION' }] } }).status, 'NO_GO')
assert.equal(buildAttorneyReleasePhase7Decision({ ...ready, approval: { ...approval, confirmation: 'yes' } }).status, 'NO_GO')
assert.equal(buildAttorneyReleasePhase7Decision({ ...ready, approval: { ...approval, releaseFingerprint: 'stale' } }).status, 'NO_GO')
assert.equal(buildAttorneyReleasePhase7Decision({ ...ready, observationRefreshPassed: false }).status, 'NO_GO')
const checker = readFileSync(new URL('./check-attorney-release-phase7.mjs', import.meta.url), 'utf8')
assert.match(checker, /observe-attorney-release-phase6-staging\.mjs/)
assert.match(checker, /check-attorney-release-phase6-staging\.mjs/)
assert.match(checker, /test:attorney-release-phase6/)
assert.match(checker, /npm', \['run', 'build'/)
assert.match(checker, /flag: 'wx'/)
assert.match(checker, /mode: 0o400/)
assert.doesNotMatch(checker, /db\.from\([^\n]+\)\.(insert|update|upsert|delete)\(/)
console.log('Attorney release Phase 7 final decision and immutable receipt contract passed.')
