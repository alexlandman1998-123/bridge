import { spawnSync } from 'node:child_process'
import { ROLLOUT_CONTROL_RECEIPT_PATHS } from './legal-document-rollout-source-continuity.mjs'

function gitOutput(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '') : ''
}

/**
 * Reads the first committed Phase 1 receipt in a verified receipt-only chain.
 * The policy uses its manifest digest as the immutable parent of the recorded
 * evidence receipt. This helper is read-only and never contacts a remote.
 */
export function collectLegalDocumentRolloutPhase1History({ repoRoot, sourceContinuity } = {}) {
  const continuity = sourceContinuity && typeof sourceContinuity === 'object' ? sourceContinuity : {}
  if (continuity.status !== 'RECEIPT_ONLY_DESCENDANT' || !Array.isArray(continuity.commits)) return null
  const phase1Commits = continuity.commits.filter((commit) => Array.isArray(commit?.changedPaths) && commit.changedPaths.includes(ROLLOUT_CONTROL_RECEIPT_PATHS[1]))
  if (!phase1Commits.length) return null
  const pendingCommitSha = String(phase1Commits[0].sha || '').trim()
  if (!/^[0-9a-f]{40}$/i.test(pendingCommitSha)) return { pendingReceiptManifestDigest: null, pendingReceiptCommitSha: null, pendingReceiptStatus: null, pendingReceiptParentDigest: null }
  const content = gitOutput(repoRoot, ['cat-file', '-p', `${pendingCommitSha}:${ROLLOUT_CONTROL_RECEIPT_PATHS[1]}`])
  try {
    const receipt = JSON.parse(content)
    return {
      pendingReceiptManifestDigest: typeof receipt?.manifestDigest === 'string' ? receipt.manifestDigest.trim() : null,
      pendingReceiptCommitSha: pendingCommitSha,
      pendingReceiptStatus: typeof receipt?.status === 'string' ? receipt.status.trim() : null,
      pendingReceiptParentDigest: receipt?.source?.pendingReceiptManifestDigest ?? null,
    }
  } catch {
    return { pendingReceiptManifestDigest: null, pendingReceiptCommitSha: pendingCommitSha, pendingReceiptStatus: null, pendingReceiptParentDigest: null }
  }
}
