#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase26/release-candidate.json', 'utf8'))
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

assert.equal(evidence.status, 'RELEASE_CANDIDATE_CERTIFIED')
assert.equal(evidence.phase, 26)
assert.doesNotThrow(() => git(['cat-file', '-e', `${evidence.repository.runtimeBaselineCommit}^{commit}`]))
assert.equal(git(['rev-parse', `${evidence.repository.runtimeBaselineCommit}:the-it-guy/src`]), evidence.repository.runtimeSourceTree)
assert.equal(fingerprint(evidence.repository.runtimeBaselineCommit), evidence.repository.runtimeBuildInputFingerprint)
assert.equal(fingerprint('HEAD'), evidence.repository.runtimeBuildInputFingerprint)
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

console.log('Phase 26 release candidate passed: clean Node 22 build, deterministic assets, and concurrent changes excluded.')
