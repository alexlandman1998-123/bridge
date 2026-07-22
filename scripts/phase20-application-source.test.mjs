#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase20/application-source.json', 'utf8'))
const recertification = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase34/production-source-recertification.json', 'utf8'))
const clearance = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase39/pull-request-check-clearance.json', 'utf8'))
const sourceCommit = recertification.repository.productionSourceCommit
const candidateCommit = clearance.releaseCandidate.runtimeSourceCommit
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
assert.doesNotThrow(() => git(['cat-file', '-e', `${candidateCommit}^{commit}`]))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', candidateCommit, 'HEAD']))
assert.equal(git(['status', '--porcelain', '--', ...inputPaths]), '', 'Runtime build inputs contain uncommitted changes.')
assert.equal(buildInputFingerprint(sourceCommit), recertification.repository.fullRuntimeBuildInputFingerprint)
assert.equal(git(['rev-parse', `${sourceCommit}:the-it-guy/src`]), recertification.repository.runtimeSourceTree)
assert.equal(buildInputFingerprint(candidateCommit), clearance.releaseCandidate.fullRuntimeBuildInputFingerprint)
assert.equal(buildInputFingerprint('HEAD'), clearance.releaseCandidate.fullRuntimeBuildInputFingerprint)
assert.equal(git(['rev-parse', `${candidateCommit}:the-it-guy/src`]), clearance.releaseCandidate.runtimeSourceTree)
assert.equal(git(['rev-parse', 'HEAD:the-it-guy/src']), clearance.releaseCandidate.runtimeSourceTree)
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
assert.equal(clearance.productionBaseline.sourceCommit, sourceCommit)
assert.equal(clearance.releaseCandidate.promotedToProduction, false)

console.log('Phase 20 passed through Phase 39: the certified production baseline remains traceable and the clean PR candidate is tracked separately.')
