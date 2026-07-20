#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync(
  'deployment-evidence/2026-07-20-phase38/clean-release-reproduction.json',
  'utf8',
))
const scope = JSON.parse(readFileSync('docs/phase-33-pull-request-scope-lock.json', 'utf8'))

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

assert.equal(evidence.phase, 38)
assert.equal(evidence.status, 'CLEAN_RELEASE_REPRODUCED_WITH_BLOCKERS')
assert.equal(evidence.source.branch, 'codex/mvp-pilot-readiness')
assert.equal(git(['rev-parse', `${evidence.source.commit}^{tree}`]), evidence.source.tree)
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', evidence.source.commit, 'HEAD']))
assert.equal(evidence.source.matchedRemoteHead, true)

assert.equal(evidence.checkout.isolatedGitWorktree, true)
assert.equal(evidence.checkout.detachedHead, true)
assert.equal(evidence.checkout.cleanBeforeExecution, true)
assert.equal(evidence.checkout.repositoryWorktreeReused, false)
assert.equal(evidence.runtime.node.startsWith('v22.'), true)

assert.equal(evidence.lockedInstalls.root.passed, true)
assert.equal(evidence.lockedInstalls.application.passed, true)
assert.equal(evidence.lockedInstalls.root.command, 'npm ci --ignore-scripts')
assert.equal(evidence.lockedInstalls.application.command, 'npm ci --ignore-scripts')

const gates = evidence.deterministicReleaseGates
assert.equal(gates.total, gates.passed + gates.failed)
assert.equal(gates.passed, gates.passedNames.length)
assert.equal(gates.failed, gates.failures.length)
assert.deepEqual(gates.failures.map(({ phase }) => phase), [20, 26, 33, 34])
assert.deepEqual(gates.failures.map(({ code }) => code), [
  'APPLICATION_SOURCE_FINGERPRINT_DRIFT',
  'RELEASE_CANDIDATE_FINGERPRINT_DRIFT',
  'PULL_REQUEST_SCOPE_DRIFT',
  'PRODUCTION_SOURCE_RECERTIFICATION_DRIFT',
])

assert.equal(evidence.applicationRelease.mvpCertification.passed, true)
assert.equal(evidence.applicationRelease.mvpCertification.checks, 24)
assert.equal(evidence.applicationRelease.serviceTests.passed, true)
assert.equal(evidence.applicationRelease.guardedProductionBuild.passed, true)
assert.equal(evidence.applicationRelease.guardedProductionBuild.releaseId, evidence.source.commit)
assert.equal(evidence.applicationRelease.guardedProductionBuild.performanceBudgetPassed, true)

assert.equal(evidence.externalChecks.includedInCleanReproduction, false)
assert.equal(evidence.externalChecks.supabasePreview.status, 'BLOCKED')
assert.equal(evidence.externalChecks.productionPromotion.attempted, false)
assert.equal(evidence.safety.stagingMutated, false)
assert.equal(evidence.safety.productionMutated, false)
assert.equal(evidence.safety.applicationDeployed, false)
assert.equal(evidence.safety.secretsCaptured, false)

for (const path of [
  '.github/workflows/phase38-clean-release-reproduction-gate.yml',
  'deployment-evidence/2026-07-20-phase38/clean-release-reproduction.json',
  'docs/phase-38-clean-release-reproduction.md',
  'scripts/phase38-clean-release-reproduction.test.mjs',
]) assert.ok(scope.allowedAfterIsolationPaths.includes(path), `${path} must be governed by the Phase 33 scope lock.`)

console.log('Phase 38 passed: the remote release was reproduced in a clean checkout and its four remaining governance blockers were preserved explicitly.')
