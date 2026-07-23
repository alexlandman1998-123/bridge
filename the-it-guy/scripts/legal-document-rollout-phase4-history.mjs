import { spawnSync } from 'node:child_process'
import { ROLLOUT_CONTROL_RECEIPT_PATHS } from './legal-document-rollout-source-continuity.mjs'

const PHASE4_RECEIPT_PATH = 'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json'

function gitOutput(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '') : ''
}

function text(value) {
  return typeof value === 'string' ? value.trim() : null
}

function normalizedIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(text).filter(Boolean))].sort()
    : []
}

function emptyHistory(receiptCommitSha = null) {
  return {
    receiptCommitSha,
    receiptManifestDigest: null,
    receiptStatus: null,
    phase3ReceiptManifestDigest: null,
    phase3ReceiptCommitSha: null,
    sourceCommitSha: null,
    activationPlanDigest: null,
    cohortDigest: null,
    organisationIds: [],
    runtimeGuardContract: null,
    watchdogContract: null,
  }
}

/**
 * Reads the committed Phase 4 pilot-activation receipt from a verified
 * receipt-only chain.  Phase 5 uses this narrow projection instead of a
 * mutable working-tree document, so a later edit cannot silently change the
 * active cohort, plan marker, or runtime/watchdog contracts it observed.
 *
 * This helper is deliberately local and read-only: it invokes only `git
 * cat-file` against the supplied repository and never contacts a provider.
 */
export function collectLegalDocumentRolloutPhase4History({ repoRoot, sourceContinuity } = {}) {
  const continuity = sourceContinuity && typeof sourceContinuity === 'object' ? sourceContinuity : {}
  if (continuity.status !== 'RECEIPT_ONLY_DESCENDANT' || !Array.isArray(continuity.commits)) return null
  const receiptPath = ROLLOUT_CONTROL_RECEIPT_PATHS.includes(PHASE4_RECEIPT_PATH)
    ? PHASE4_RECEIPT_PATH
    : null
  if (!receiptPath) return null
  const phase4Commits = continuity.commits.filter((commit) => Array.isArray(commit?.changedPaths) && commit.changedPaths.includes(receiptPath))
  if (phase4Commits.length !== 1) return null
  const receiptCommitSha = text(phase4Commits[0]?.sha)
  if (!receiptCommitSha || !/^[0-9a-f]{40}$/i.test(receiptCommitSha)) return emptyHistory(null)

  const content = gitOutput(repoRoot, ['cat-file', '-p', `${receiptCommitSha}:${receiptPath}`])
  try {
    const receipt = JSON.parse(content)
    return {
      receiptCommitSha,
      receiptManifestDigest: text(receipt?.manifestDigest),
      receiptStatus: text(receipt?.status),
      phase3ReceiptManifestDigest: text(receipt?.source?.phase3ReceiptManifestDigest),
      phase3ReceiptCommitSha: text(receipt?.source?.phase3ReceiptCommitSha),
      sourceCommitSha: text(receipt?.source?.commitSha),
      activationPlanDigest: text(receipt?.source?.activationPlanDigest),
      cohortDigest: text(receipt?.cohort?.cohortDigest),
      organisationIds: normalizedIds(receipt?.cohort?.organisationIds),
      runtimeGuardContract: text(receipt?.safety?.runtimeGuardContract),
      watchdogContract: text(receipt?.execution?.monitoring?.watchdogContract),
    }
  } catch {
    return emptyHistory(receiptCommitSha)
  }
}
