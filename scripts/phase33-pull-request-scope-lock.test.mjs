#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const scope = JSON.parse(readFileSync('docs/phase-33-pull-request-scope-lock.json', 'utf8'))

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

const release = scope.releaseBoundary
assert.equal(scope.status, 'PULL_REQUEST_SCOPE_LOCKED')
assert.equal(scope.pullRequest.number, 1)
assert.equal(scope.pullRequest.base, 'main')
assert.equal(scope.pullRequest.head, 'codex/mvp-pilot-readiness')
assert.equal(scope.included.productionLedgerRows, 511)
assert.equal(scope.controls.newRuntimeFeaturesAllowed, false)
assert.equal(scope.controls.newMigrationsAllowed, false)
assert.equal(scope.controls.scopeAmendmentRequiresExplicitApproval, true)

for (const commit of [
  release.productionApplicationCommit,
  release.phase32GovernanceCommit,
  release.excludedConcurrentCommit,
  release.scopeIsolationCommit,
]) assert.doesNotThrow(() => git(['cat-file', '-e', `${commit}^{commit}`]))

assert.equal(git(['rev-parse', `${release.scopeIsolationCommit}^`]), release.excludedConcurrentCommit)
assert.equal(
  git(['rev-parse', `${release.scopeIsolationCommit}^{tree}`]),
  git(['rev-parse', `${release.phase32GovernanceCommit}^{tree}`]),
  'The isolation commit must restore the exact Phase 32 tree.',
)
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', release.productionApplicationCommit, release.phase32GovernanceCommit]))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', release.scopeIsolationCommit, 'HEAD']))

for (const migration of scope.excluded.deferredMigrations) {
  assert.equal(existsSync(`supabase/migrations/${migration}`), false, `${migration} must remain outside PR #1`)
}

const changedAfterIsolation = [...new Set([
  git(['diff', '--name-only', `${release.scopeIsolationCommit}..HEAD`]),
  git(['diff', '--name-only']),
  git(['ls-files', '--others', '--exclude-standard']),
].flatMap((value) => value.split('\n')).filter(Boolean))].sort()
assert.deepEqual(changedAfterIsolation, [...scope.allowedAfterIsolationPaths].sort())

const excludedDiff = git(['diff', '--name-only', `${release.excludedConcurrentCommit}^`, release.excludedConcurrentCommit])
assert.match(excludedDiff, /202607200014_attorney_matter_module_activation\.sql/)
assert.match(excludedDiff, /202607209904_attorney_workflow_transfer_controller_guard_phase4\.sql/)
assert.match(excludedDiff, /legalDocumentEditor/)
assert.match(excludedDiff, /send-email/)

console.log('Phase 33 pull-request scope lock passed: certified release retained and concurrent feature work excluded without history loss.')
