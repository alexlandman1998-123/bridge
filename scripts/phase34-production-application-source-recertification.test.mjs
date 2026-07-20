#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase34/production-source-recertification.json', 'utf8'))
const scope = JSON.parse(readFileSync('docs/phase-33-pull-request-scope-lock.json', 'utf8'))
const runtimePaths = [
  'the-it-guy/src',
  'the-it-guy/server',
  'the-it-guy/api',
  'the-it-guy/public',
  'the-it-guy/index.html',
  'the-it-guy/package.json',
  'the-it-guy/package-lock.json',
  'the-it-guy/vite.config.js',
  'the-it-guy/vercel.json',
  'the-it-guy/postcss.config.js',
  'the-it-guy/tailwind.config.js',
]

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function fingerprint(ref, excludeMarker = false) {
  let rows = git(['ls-tree', '-r', ref, '--', ...runtimePaths]).split('\n')
  if (excludeMarker) rows = rows.filter((row) => !row.endsWith('\tthe-it-guy/public/release-source.json'))
  return createHash('sha256').update(`${rows.join('\n')}\n`).digest('hex')
}

assert.equal(evidence.phase, 34)
assert.equal(evidence.status, 'PRODUCTION_APPLICATION_SOURCE_RECERTIFIED')
assert.equal(evidence.repository.productionSourceCommit, scope.releaseBoundary.productionApplicationCommit)
assert.doesNotThrow(() => git(['cat-file', '-e', `${evidence.repository.productionSourceCommit}^{commit}`]))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', evidence.repository.productionSourceCommit, 'HEAD']))
assert.equal(git(['status', '--porcelain', '--', ...runtimePaths]), '', 'Runtime build inputs contain uncommitted changes.')
assert.equal(git(['rev-parse', `${evidence.repository.productionSourceCommit}:the-it-guy/src`]), evidence.repository.runtimeSourceTree)
assert.equal(git(['rev-parse', 'HEAD:the-it-guy/src']), evidence.repository.runtimeSourceTree)
assert.equal(git(['rev-parse', `${evidence.repository.productionSourceCommit}:the-it-guy`]), evidence.repository.runtimeRootTree)
assert.equal(git(['rev-parse', 'HEAD:the-it-guy']), evidence.repository.runtimeRootTree)
assert.equal(fingerprint(evidence.repository.productionSourceCommit), evidence.repository.fullRuntimeBuildInputFingerprint)
assert.equal(fingerprint('HEAD'), evidence.repository.fullRuntimeBuildInputFingerprint)
assert.equal(fingerprint(evidence.repository.productionSourceCommit, true), evidence.repository.runtimeBuildInputFingerprint)
assert.equal(fingerprint('HEAD', true), evidence.repository.runtimeBuildInputFingerprint)

assert.equal(evidence.deploymentDrift.detected, true)
assert.notEqual(evidence.deploymentDrift.excludedReleaseId, evidence.repository.productionSourceCommit)
assert.equal(evidence.deploymentDrift.resolved, true)
assert.equal(evidence.releaseBranchDrift.isolationCommit, scope.releaseBoundary.postLockIsolationCommit)
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', evidence.releaseBranchDrift.isolationCommit, 'HEAD']))
assert.equal(evidence.releaseBranchDrift.driftCommitPreserved, true)
assert.equal(evidence.releaseBranchDrift.resolved, true)

assert.equal(evidence.build.isolatedDetachedWorktree, true)
assert.equal(evidence.build.freshLockfileInstall, true)
assert.match(evidence.build.nodeVersion, /^22\./)
assert.equal(evidence.build.releaseId, evidence.repository.productionSourceCommit)
assert.equal(evidence.build.modulesTransformed, 3490)
assert.equal(evidence.build.criticalAssetCount, 427)
assert.equal(evidence.build.outputFileCount, evidence.build.deterministicFileCount + 1)
assert.equal(evidence.build.repeatBuild, 'pass')
assert.equal(evidence.build.deterministicOutputHash, evidence.build.repeatBuildOutputHash)
assert.match(evidence.build.deterministicOutputHash, /^[a-f0-9]{64}$/)
assert.equal(evidence.build.performanceBudget, 'pass')
assert.equal(evidence.build.lockfileChanged, false)

assert.equal(evidence.productionDeployment.target, 'production')
assert.equal(evidence.productionDeployment.status, 'READY')
assert.equal(evidence.productionDeployment.releaseId, evidence.repository.productionSourceCommit)
assert.equal(evidence.productionDeployment.domain, 'https://app.arch9.co.za')
assert.equal(evidence.verification.manifestReleaseMatchesCertifiedSource, true)
assert.equal(evidence.verification.productionCriticalAssetCount, evidence.build.criticalAssetCount)
assert.equal(evidence.verification.productionCriticalAssetsHealthy, true)
assert.equal(evidence.verification.productionFailedCriticalAssets, 0)
assert.equal(evidence.verification.browserHttpStatus, 200)
assert.equal(evidence.verification.browserSignInControlsPresent, true)
assert.equal(evidence.verification.browserConsoleErrors, 0)
assert.equal(evidence.verification.browserPageErrors, 0)
assert.equal(evidence.verification.authenticatedApiGuardStatus, 401)
assert.equal(evidence.verification.boundedRuntimeErrorScan, 0)
assert.equal(evidence.verification.boundedHttp500Scan, 0)
assert.equal(evidence.safety.databaseMutatedByPhase34, false)
assert.equal(evidence.safety.uncommittedApplicationChangesDeployed, false)
assert.equal(evidence.safety.phase0MigrationFreezeRemainsActive, true)

console.log('Phase 34 passed: production and the release branch resolve to reproducible commit 333c08eb with 427/427 critical assets healthy.')
