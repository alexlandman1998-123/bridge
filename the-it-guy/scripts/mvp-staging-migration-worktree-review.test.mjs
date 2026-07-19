import assert from 'node:assert/strict'
import fs from 'node:fs'

const evidence = JSON.parse(
  fs.readFileSync('docs/audits/mvp-staging-migration-worktree-review-2026-07-19.json', 'utf8'),
)

assert.equal(evidence.repositoryBaseline.headCommit, 'cf710f8e5141f9884d9a8e2140c70e769e20e0d2')
assert.equal(evidence.repositoryBaseline.sqlFileCount, 494)
assert.equal(evidence.repositoryBaseline.trackedMigrationFileCount, 494)
assert.deepEqual(evidence.worktreeReview.modifiedMigrationFiles, [])
assert.deepEqual(evidence.worktreeReview.deletedTrackedMigrationFiles, [])
assert.deepEqual(evidence.worktreeReview.untrackedMigrationFiles, [])
assert.deepEqual(evidence.worktreeReview.duplicateMigrationVersionIds, [])
assert.equal(evidence.worktreeReview.result, 'clean_and_internally_ordered')
assert.equal(evidence.stagingHistoryConstraint.missingFromStagingCount, 63)
assert.equal(evidence.decision, 'freeze_current_repository_migration_tree_and_do_not_push_historical_gaps')
assert.match(evidence.safeChainRule, /after 20260719130913/)

console.log('mvp-staging-migration-worktree-review: passed')
