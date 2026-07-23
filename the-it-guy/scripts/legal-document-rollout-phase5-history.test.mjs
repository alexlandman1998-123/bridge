import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectLegalDocumentRolloutPhase5History, ROLLOUT_PHASE5_RECEIPT_PATH } from './legal-document-rollout-phase5-history.mjs'
import { rolloutPhase5ManifestDigest } from './legal-document-rollout-phase5-policy.mjs'
import { sha256Digest } from './legal-document-rollout-phase1-artifacts.mjs'

const digest = (character) => `sha256:${character.repeat(64)}`
const organisationId = '11111111-1111-4111-8111-111111111111'

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  return String(result.stdout || '').trim()
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-document-phase5-history-'))
try {
  git(repo, ['init', '-q'])
  fs.mkdirSync(path.join(repo, path.dirname(ROLLOUT_PHASE5_RECEIPT_PATH)), { recursive: true })
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_5',
    contract: 'legal-document-production-pilot-observation-v1',
    status: 'pilot_observation_recorded',
    environment: { productionProjectRef: 'productionref001', productionOrigin: 'https://productionref001.supabase.co', productionUrl: 'https://legal.example.test' },
    source: {
      phase4ReceiptCommitSha: 'a'.repeat(40),
      phase4ReceiptManifestDigest: digest('b'),
      commitSha: 'c'.repeat(40),
      packageLockSha256: digest('d'),
      activationPlanDigest: digest('e'),
      observationPlanDigest: digest('f'),
    },
    cohort: { organisationIds: [organisationId], cohortDigest: sha256Digest(organisationId), requiredPacketTypes: ['mandate', 'otp'] },
    safety: { runtimeGuardContract: 'legal-document-pilot-release-v1', watchdogContract: 'phase5-f2-f3-f4-v2' },
    evidence: { observationRecordedAt: '2026-07-07T00:00:00.000Z' },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase5ManifestDigest(receipt)
  fs.writeFileSync(path.join(repo, ROLLOUT_PHASE5_RECEIPT_PATH), `${JSON.stringify(receipt)}\n`, 'utf8')
  git(repo, ['add', ROLLOUT_PHASE5_RECEIPT_PATH])
  git(repo, ['-c', 'user.name=Phase Six Test', '-c', 'user.email=phase6@example.test', 'commit', '-qm', 'record phase five receipt'])
  const receiptCommitSha = git(repo, ['rev-parse', 'HEAD'])

  const history = collectLegalDocumentRolloutPhase5History({ repoRoot: repo, receiptCommitSha })
  assert.equal(history.receiptCommitSha, receiptCommitSha)
  assert.equal(history.receiptOnlyCommit, true)
  assert.equal(history.receiptManifestDigestValid, true)
  assert.equal(history.receiptStatus, 'pilot_observation_recorded')
  assert.equal(history.phase4ReceiptCommitSha, 'a'.repeat(40))
  assert.deepEqual(history.organisationIds, [organisationId])
  assert.deepEqual(history.requiredPacketTypes, ['mandate', 'otp'])
  assert.equal(history.observationRecordedAt, '2026-07-07T00:00:00.000Z')
  assert.equal(collectLegalDocumentRolloutPhase5History({ repoRoot: repo, receiptCommitSha: 'z'.repeat(40) }).receiptCommitSha, null)
} finally {
  fs.rmSync(repo, { recursive: true, force: true })
}

console.log('Legal-document Phase 5 committed-history projection contract passed.')
