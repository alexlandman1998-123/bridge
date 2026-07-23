import { spawnSync } from 'node:child_process'
import { ROLLOUT_CONTROL_RECEIPT_PATHS } from './legal-document-rollout-source-continuity.mjs'

function gitOutput(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '') : ''
}

/**
 * Reads the committed Phase 3 preflight receipt from a verified receipt-only
 * chain. Phase 4 must bind this immutable content, never an editable working
 * tree copy. This helper is read-only and never contacts a provider.
 */
export function collectLegalDocumentRolloutPhase3History({ repoRoot, sourceContinuity } = {}) {
  const continuity = sourceContinuity && typeof sourceContinuity === 'object' ? sourceContinuity : {}
  if (continuity.status !== 'RECEIPT_ONLY_DESCENDANT' || !Array.isArray(continuity.commits)) return null
  const phase3Commits = continuity.commits.filter((commit) => Array.isArray(commit?.changedPaths) && commit.changedPaths.includes(ROLLOUT_CONTROL_RECEIPT_PATHS[3]))
  if (!phase3Commits.length) return null
  const receiptCommitSha = String(phase3Commits[0].sha || '').trim()
  if (!/^[0-9a-f]{40}$/i.test(receiptCommitSha)) {
    return {
      receiptCommitSha: null,
      receiptManifestDigest: null,
      receiptStatus: null,
      phase2ReceiptManifestDigest: null,
      phase2ReceiptCommitSha: null,
      sourceCommitSha: null,
    }
  }
  const content = gitOutput(repoRoot, ['cat-file', '-p', `${receiptCommitSha}:${ROLLOUT_CONTROL_RECEIPT_PATHS[3]}`])
  try {
    const receipt = JSON.parse(content)
    return {
      receiptCommitSha,
      receiptManifestDigest: typeof receipt?.manifestDigest === 'string' ? receipt.manifestDigest.trim() : null,
      receiptStatus: typeof receipt?.status === 'string' ? receipt.status.trim() : null,
      phase2ReceiptManifestDigest: typeof receipt?.source?.phase2ReceiptManifestDigest === 'string'
        ? receipt.source.phase2ReceiptManifestDigest.trim()
        : null,
      phase2ReceiptCommitSha: typeof receipt?.source?.phase2ReceiptCommitSha === 'string'
        ? receipt.source.phase2ReceiptCommitSha.trim()
        : null,
      sourceCommitSha: typeof receipt?.source?.commitSha === 'string' ? receipt.source.commitSha.trim() : null,
    }
  } catch {
    return {
      receiptCommitSha,
      receiptManifestDigest: null,
      receiptStatus: null,
      phase2ReceiptManifestDigest: null,
      phase2ReceiptCommitSha: null,
      sourceCommitSha: null,
    }
  }
}
