#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync(
  'deployment-evidence/2026-07-20-phase39/pull-request-check-clearance.json',
  'utf8',
))
const scope = JSON.parse(readFileSync('docs/phase-33-pull-request-scope-lock.json', 'utf8'))
const supabaseConfig = readFileSync('supabase/config.toml', 'utf8')

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

assert.equal(evidence.phase, 39)
assert.equal(evidence.status, 'PULL_REQUEST_SOURCE_CHECKS_CLEARED')
assert.equal(evidence.pullRequest.number, 1)
assert.equal(evidence.productionBaseline.sourceCommit, scope.releaseBoundary.productionApplicationCommit)
assert.equal(evidence.productionBaseline.stillCertified, true)
assert.equal(evidence.releaseCandidate.runtimeSourceCommit, scope.approvedRuntimeCorrections.runtimeSourceCommit)
assert.doesNotThrow(() => git(['cat-file', '-e', `${evidence.releaseCandidate.runtimeSourceCommit}^{commit}`]))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', evidence.releaseCandidate.runtimeSourceCommit, 'HEAD']))
assert.equal(git(['rev-parse', `${evidence.releaseCandidate.runtimeSourceCommit}:the-it-guy/src`]), evidence.releaseCandidate.runtimeSourceTree)
assert.equal(git(['rev-parse', 'HEAD:the-it-guy/src']), evidence.releaseCandidate.runtimeSourceTree)
assert.equal(evidence.releaseCandidate.differsFromProductionBaseline, true)
assert.equal(evidence.releaseCandidate.promotedToProduction, false)
assert.equal(evidence.releaseCandidate.build.isolatedDetachedWorktree, true)
assert.equal(evidence.releaseCandidate.build.freshLockfileInstall, true)
assert.equal(evidence.releaseCandidate.build.applicationTestSuite, '9_of_9_pass')
assert.equal(evidence.releaseCandidate.build.guardedBuild, 'pass')
assert.equal(evidence.releaseCandidate.build.performanceBudget, 'pass')
assert.deepEqual(evidence.sourceCheckRepairs.map(({ phase }) => phase), [20, 26, 33, 34])
assert.equal(evidence.externalChecks.supabasePreview.status, 'SMTP_REPAIRED_AND_HISTORICAL_BASELINE_RESTORED')
assert.equal(evidence.externalChecks.supabasePreview.previewMailer, 'supabase_restricted_development_mailer')
assert.equal(evidence.externalChecks.supabasePreview.productionMailer, 'resend_remote_override')
assert.equal(evidence.externalChecks.supabasePreview.secretCapturedInEvidence, false)
const previewBaseline = evidence.externalChecks.supabasePreview.previewBaseline
const previewBaselinePath = `supabase/migrations/${previewBaseline.migration}`
assert.equal(previewBaseline.sourceCommit, '4ee5387b8bbc1540e5545c11c22fedfbd552d4d0')
assert.equal(
  createHash('sha256').update(readFileSync(previewBaselinePath)).digest('hex'),
  previewBaseline.sha256,
)
assert.match(readFileSync(previewBaselinePath, 'utf8'), /Historical schema snapshot from commit 4ee5387b/)
assert.doesNotThrow(() => git(['show', `${previewBaseline.sourceCommit}:the-it-guy/sql/schema.sql`]))
assert.equal(previewBaseline.bootstrapRepairs.length, 6)
assert.equal(previewBaseline.productionLedgerAttestationRequiredBeforeMerge, true)
assert.equal(evidence.externalChecks.supabasePreview.previewReset.withData, false)
assert.equal(evidence.externalChecks.supabasePreview.previewReset.productionAffected, false)
assert.equal(evidence.externalChecks.supabasePreview.previewReset.stagingAffected, false)
assert.equal(evidence.externalChecks.vercelPreview.statusAtCertification, 'PASS')
assert.equal(evidence.safety.productionApplicationPromoted, false)
assert.equal(evidence.safety.productionDatabaseMutated, false)
assert.equal(evidence.safety.stagingDatabaseMutated, false)
assert.equal(evidence.safety.migrationInventoryChanged, true)
assert.equal(evidence.safety.productionSmtpCredentialChanged, false)
assert.equal(evidence.safety.unrelatedRuntimePathsApproved, false)

const productionRemoteIndex = supabaseConfig.indexOf('[remotes.production]')
assert.ok(productionRemoteIndex > 0, 'The production-specific Supabase configuration must be declared.')
const previewDefaults = supabaseConfig.slice(0, productionRemoteIndex)
const productionOverride = supabaseConfig.slice(productionRemoteIndex)
assert.match(previewDefaults, /\[auth\.rate_limit\][\s\S]*?email_sent = 2/)
assert.doesNotMatch(previewDefaults, /\[auth\.email\.smtp\]/)
assert.match(productionOverride, /project_id = "isdowlnollckzvltkasn"/)
assert.match(productionOverride, /\[remotes\.production\.auth\.rate_limit\][\s\S]*?email_sent = 1000/)
assert.match(productionOverride, /\[remotes\.production\.auth\.email\.smtp\]/)
assert.match(productionOverride, /pass = "env\(SMTP_PASSWORD\)"/)

console.log('Phase 39 passed: the four source-check contracts distinguish the certified production baseline from the tested PR candidate.')
