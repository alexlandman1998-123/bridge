import assert from 'node:assert/strict'
import fs from 'node:fs'

const recovery = JSON.parse(
  fs.readFileSync('docs/audits/mvp-staging-migration-failure-recovery-2026-07-19.json', 'utf8'),
)

assert.equal(recovery.decision, 'stop_preserve_evidence_and_recover_forward_only')
assert.ok(recovery.immediateActions.some((action) => action.includes('SQLSTATE')))
assert.ok(recovery.prohibitedActions.some((action) => action.includes('migration repair')))
assert.ok(recovery.prohibitedActions.some((action) => action.includes('production-like leads, offers, transactions')))
assert.match(recovery.failurePaths.preflightOrDdlFailure.expectedDatabaseState, /transactional/)
assert.match(recovery.failurePaths.postCommitContractOrSmokeFailure.recovery, /append-only correction migration/)
assert.ok(recovery.resumeCriteria.some((criterion) => criterion.includes('append-only history')))

console.log('mvp-staging-migration-failure-recovery: passed')
