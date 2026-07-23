import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectLegalDocumentRolloutPhase4History } from './legal-document-rollout-phase4-history.mjs'

const PHASE4_PATH = 'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json'
const digest = (character) => `sha256:${character.repeat(64)}`
const organisationId = '11111111-1111-4111-8111-111111111111'

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  return String(result.stdout || '').trim()
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-document-phase4-history-'))
try {
  git(repo, ['init', '-q'])
  fs.mkdirSync(path.join(repo, 'the-it-guy/config'), { recursive: true })
  const receipt = {
    status: 'pilot_activation_recorded',
    manifestDigest: digest('a'),
    source: {
      phase3ReceiptManifestDigest: digest('b'),
      phase3ReceiptCommitSha: 'b'.repeat(40),
      commitSha: 'c'.repeat(40),
      activationPlanDigest: digest('d'),
    },
    cohort: {
      organisationIds: [organisationId],
      cohortDigest: digest('e'),
    },
    safety: {
      runtimeGuardContract: 'legal-document-pilot-release-v1',
    },
    execution: {
      monitoring: {
        watchdogContract: 'phase5-f2-f3-f4-v2',
      },
    },
  }
  fs.writeFileSync(path.join(repo, PHASE4_PATH), `${JSON.stringify(receipt)}\n`, 'utf8')
  git(repo, ['add', PHASE4_PATH])
  git(repo, ['-c', 'user.name=Phase Five Test', '-c', 'user.email=phase5@example.test', 'commit', '-qm', 'record phase four receipt'])
  const receiptCommitSha = git(repo, ['rev-parse', 'HEAD'])

  const history = collectLegalDocumentRolloutPhase4History({
    repoRoot: repo,
    sourceContinuity: {
      status: 'RECEIPT_ONLY_DESCENDANT',
      commits: [{ sha: receiptCommitSha, changedPaths: [PHASE4_PATH] }],
    },
  })
  assert.deepEqual(history, {
    receiptCommitSha,
    receiptManifestDigest: digest('a'),
    receiptStatus: 'pilot_activation_recorded',
    phase3ReceiptManifestDigest: digest('b'),
    phase3ReceiptCommitSha: 'b'.repeat(40),
    sourceCommitSha: 'c'.repeat(40),
    activationPlanDigest: digest('d'),
    cohortDigest: digest('e'),
    organisationIds: [organisationId],
    runtimeGuardContract: 'legal-document-pilot-release-v1',
    watchdogContract: 'phase5-f2-f3-f4-v2',
  })
  assert.equal(collectLegalDocumentRolloutPhase4History({
    repoRoot: repo,
    sourceContinuity: { status: 'RECEIPT_ONLY_DESCENDANT', commits: [] },
  }), null)
  assert.equal(collectLegalDocumentRolloutPhase4History({
    repoRoot: repo,
    sourceContinuity: { status: 'INVALID', commits: [{ sha: receiptCommitSha, changedPaths: [PHASE4_PATH] }] },
  }), null)
} finally {
  fs.rmSync(repo, { recursive: true, force: true })
}

console.log('Legal-document Phase 4 committed-history projection contract passed.')
