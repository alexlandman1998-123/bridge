#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase21/release-branch-review.json', 'utf8'))

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

assert.equal(evidence.status, 'RELEASE_BRANCH_PUSHED_REVIEWED_DRAFT')
assert.equal(evidence.branch.name, 'codex/mvp-pilot-readiness')
assert.equal(evidence.branch.pushed, true)
assert.equal(evidence.branch.aheadOfRemoteAfterPush, 0)
assert.doesNotThrow(() => git(['cat-file', '-e', `${evidence.branch.reviewedHead}^{commit}`]))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', evidence.branch.reviewedHead, 'HEAD']))
assert.equal(evidence.pullRequest.number, 1)
assert.equal(evidence.pullRequest.base, 'main')
assert.equal(evidence.pullRequest.draft, true)
assert.equal(evidence.pullRequest.mergeable, true)
assert.ok(evidence.pullRequest.labels.includes('database-reconciliation'))
assert.equal(evidence.checks.successful, 12)
assert.equal(evidence.checks.pending, 0)
assert.equal(evidence.checks.failedRepositoryOwned, 0)
assert.equal(evidence.checks.failedExternal, 1)
assert.equal(evidence.checks.externalFailure.actionableLogAvailable, false)
assert.equal(evidence.safety.pullRequestMerged, false)
assert.equal(evidence.safety.applicationPromotedByPhase21, false)
assert.equal(evidence.safety.databaseMutatedByPhase21, false)
assert.equal(evidence.safety.phase0MigrationFreezeRemainsActive, true)

console.log('Phase 21 release branch review tests passed: branch pushed, repository checks green, draft retained for external review blocker.')
