#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase20/application-source.json', 'utf8'))
const recertification = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase34/production-source-recertification.json', 'utf8'))
const sourceCommit = recertification.repository.productionSourceCommit
const inputPaths = evidence.runtimeBuildInputs

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function buildInputFingerprint(ref) {
  const tree = git(['ls-tree', '-r', ref, '--', ...inputPaths])
  return createHash('sha256').update(`${tree}\n`).digest('hex')
}

assert.equal(evidence.status, 'APPLICATION_SOURCE_STABILISED')
assert.doesNotThrow(() => git(['cat-file', '-e', `${sourceCommit}^{commit}`]))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', sourceCommit, 'HEAD']))
assert.equal(git(['status', '--porcelain', '--', ...inputPaths]), '', 'Runtime build inputs contain uncommitted changes.')
assert.equal(buildInputFingerprint(sourceCommit), recertification.repository.fullRuntimeBuildInputFingerprint)
assert.equal(buildInputFingerprint('HEAD'), recertification.repository.fullRuntimeBuildInputFingerprint)
assert.equal(git(['rev-parse', `${sourceCommit}:the-it-guy/src`]), recertification.repository.runtimeSourceTree)
assert.equal(git(['rev-parse', 'HEAD:the-it-guy/src']), recertification.repository.runtimeSourceTree)
assert.equal(recertification.productionDeployment.releaseId, sourceCommit)
assert.equal(recertification.productionDeployment.target, 'production')
assert.equal(recertification.productionDeployment.status, 'READY')
assert.equal(evidence.verification.guardedBuild, 'pass')
assert.equal(evidence.verification.releaseIntegrityContract, 'pass')
assert.equal(evidence.verification.buildReleaseManifest, 'pass')
assert.equal(evidence.verification.performanceBudget, 'pass')
assert.equal(evidence.verification.conditionalDocumentContracts, '11/11_pass')
assert.equal(recertification.verification.productionCriticalAssetCount, recertification.build.criticalAssetCount)
assert.equal(recertification.verification.productionCriticalAssetsHealthy, true)
assert.equal(recertification.verification.productionFailedCriticalAssets, 0)
assert.equal(evidence.scope.applicationRedeployedByPhase20, false)
assert.equal(evidence.scope.productionConfigurationChangedByPhase20, false)
assert.equal(evidence.scope.databaseMutatedByPhase20, false)
assert.equal(evidence.scope.phase0MigrationFreezeRemainsActive, true)

console.log('Phase 20 application source tests passed through Phase 34: production release 333c08eb is committed, reproducible, and traceable.')
