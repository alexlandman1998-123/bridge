#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase26/release-candidate.json', 'utf8'))
const production = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase26/production-deployment.json', 'utf8'))
const recertification = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase34/production-source-recertification.json', 'utf8'))
const releaseSource = JSON.parse(readFileSync('the-it-guy/public/release-source.json', 'utf8'))
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

function fingerprint(ref) {
  const tree = git(['ls-tree', '-r', ref, '--', ...runtimePaths])
    .split('\n')
    .filter((line) => !line.endsWith('\tthe-it-guy/public/release-source.json'))
    .join('\n')
  return createHash('sha256').update(`${tree}\n`).digest('hex')
}

function fullFingerprint(ref) {
  const tree = git(['ls-tree', '-r', ref, '--', ...runtimePaths])
  return createHash('sha256').update(`${tree}\n`).digest('hex')
}

assert.equal(evidence.status, 'RELEASE_CANDIDATE_CERTIFIED')
assert.equal(evidence.phase, 26)
assert.doesNotThrow(() => git(['cat-file', '-e', `${evidence.repository.runtimeBaselineCommit}^{commit}`]))
assert.equal(git(['rev-parse', `${evidence.repository.runtimeBaselineCommit}:the-it-guy/src`]), evidence.repository.runtimeSourceTree)
assert.equal(fingerprint(evidence.repository.runtimeBaselineCommit), evidence.repository.runtimeBuildInputFingerprint)
assert.equal(releaseSource.schema, 'arch9_release_source_v1')
assert.equal(releaseSource.phase, 26)
assert.equal(releaseSource.runtimeBaselineCommit, evidence.repository.runtimeBaselineCommit)
assert.equal(releaseSource.runtimeBuildInputFingerprint, evidence.repository.runtimeBuildInputFingerprint)
assert.equal(evidence.repository.concurrentWorkingTreeChangesExcluded, true)
assert.equal(evidence.build.isolatedDetachedWorktree, true)
assert.equal(evidence.build.freshLockfileInstall, true)
assert.match(evidence.build.nodeVersion, /^22\./)
assert.equal(evidence.build.guardedBuild, 'pass')
assert.equal(evidence.build.modulesTransformed, 3490)
assert.equal(evidence.build.criticalAssetCount, 428)
assert.equal(evidence.build.performanceBudget, 'pass')
assert.equal(evidence.build.applicationTestSuite, '9_of_9_pass')
assert.equal(evidence.build.repeatBuild, 'pass')
assert.equal(evidence.build.outputFileCount, evidence.build.deterministicFileCount + 1)
assert.equal(evidence.deployment.strategy, 'git_bound_production_build')
assert.equal(evidence.deployment.releaseSourceMarkerForcesFreshBuild, true)
assert.equal(evidence.dependencyAudit.lockfileChanged, false)
assert.equal(evidence.safety.databaseMutated, false)
assert.equal(evidence.safety.applicationPromoted, false)
assert.equal(evidence.safety.phase0MigrationFreezeRemainsActive, true)

assert.equal(production.status, 'CLEAN_REPRODUCIBLE_APPLICATION_DEPLOYED')
assert.equal(production.repository.releaseCommit, '2dabb3def53608519d5962c37f33a0a4a03f5680')
assert.doesNotThrow(() => git(['cat-file', '-e', `${production.repository.releaseCommit}^{commit}`]))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', production.repository.releaseCommit, 'HEAD']))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', production.repository.releaseCommit, 'origin/codex/mvp-pilot-readiness']))
assert.equal(git(['rev-parse', `${production.repository.releaseCommit}:the-it-guy/src`]), production.repository.runtimeSourceTree)
assert.equal(git(['rev-parse', `${production.repository.releaseCommit}:the-it-guy`]), production.repository.runtimeRootTree)
assert.equal(fullFingerprint(production.repository.releaseCommit), production.repository.runtimeBuildInputFingerprint)
assert.equal(production.repository.releaseCommitRemoteTracked, true)
assert.equal(production.repository.concurrentWorkingTreeChangesExcluded, true)
assert.equal(production.previewDeployment.status, 'READY')
assert.equal(production.previewDeployment.releaseId, production.repository.releaseCommit)
assert.equal(production.productionDeployment.target, 'production')
assert.equal(production.productionDeployment.status, 'READY')
assert.equal(production.productionDeployment.releaseId, production.repository.releaseCommit)
assert.equal(production.productionDeployment.domain, 'https://app.arch9.co.za')
assert.equal(production.verification.guardedProductionBuild, 'pass')
assert.equal(production.verification.releaseIntegrityContract, 'pass')
assert.equal(production.verification.performanceBudget, 'pass')
assert.equal(production.verification.productionCriticalAssetCount, 428)
assert.equal(production.verification.productionCriticalAssetsHealthy, true)
assert.equal(production.verification.productionFailedCriticalAssets, 0)
assert.equal(production.verification.browserHttpStatus, 200)
assert.equal(production.verification.browserSignInControlsPresent, true)
assert.equal(production.verification.browserConsoleErrors, 0)
assert.equal(production.verification.browserPageErrors, 0)
assert.equal(production.verification.authenticatedApiGuardStatus, 401)
assert.equal(production.verification.boundedRuntimeErrorScan, 0)
assert.equal(production.rollback.available, true)
assert.notEqual(production.rollback.previousProductionDeploymentId, production.productionDeployment.id)
assert.equal(production.safety.databaseMutatedByPhase26, false)
assert.equal(production.safety.phase0MigrationFreezeRemainsActive, true)
assert.equal(production.safety.uncommittedApplicationChangesDeployed, false)

assert.equal(recertification.status, 'PRODUCTION_APPLICATION_SOURCE_RECERTIFIED')
assert.equal(fingerprint('HEAD'), recertification.repository.runtimeBuildInputFingerprint)
assert.equal(fullFingerprint('HEAD'), recertification.repository.fullRuntimeBuildInputFingerprint)
assert.equal(recertification.productionDeployment.releaseId, recertification.repository.productionSourceCommit)
assert.equal(recertification.productionDeployment.status, 'READY')
assert.equal(recertification.verification.productionCriticalAssetCount, 427)
assert.equal(recertification.verification.productionCriticalAssetsHealthy, true)
assert.equal(recertification.build.repeatBuild, 'pass')
assert.equal(recertification.safety.uncommittedApplicationChangesDeployed, false)

console.log('Phase 26 passed through Phase 34: the current clean reproducible release is READY with 427/427 assets healthy.')
