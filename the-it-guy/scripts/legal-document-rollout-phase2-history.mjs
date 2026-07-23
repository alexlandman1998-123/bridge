import { spawnSync } from 'node:child_process'
import { ROLLOUT_CONTROL_RECEIPT_PATHS } from './legal-document-rollout-source-continuity.mjs'

function gitOutput(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '') : ''
}

/**
 * Reads the immutable Phase 2 acceptance receipt from a verified receipt-only
 * chain. Phase 3 binds this committed artifact rather than trusting a mutable
 * working-tree copy of the JSON file. This helper is read-only and never
 * contacts a provider.
 */
export function collectLegalDocumentRolloutPhase2History({ repoRoot, sourceContinuity } = {}) {
  const continuity = sourceContinuity && typeof sourceContinuity === 'object' ? sourceContinuity : {}
  if (continuity.status !== 'RECEIPT_ONLY_DESCENDANT' || !Array.isArray(continuity.commits)) return null
  const phase2Commits = continuity.commits.filter((commit) => Array.isArray(commit?.changedPaths) && commit.changedPaths.includes(ROLLOUT_CONTROL_RECEIPT_PATHS[2]))
  if (!phase2Commits.length) return null
  const receiptCommitSha = String(phase2Commits[0].sha || '').trim()
  if (!/^[0-9a-f]{40}$/i.test(receiptCommitSha)) {
    return {
      receiptCommitSha: null,
      receiptManifestDigest: null,
      receiptStatus: null,
      phase1ReceiptManifestDigest: null,
    }
  }
  const content = gitOutput(repoRoot, ['cat-file', '-p', `${receiptCommitSha}:${ROLLOUT_CONTROL_RECEIPT_PATHS[2]}`])
  try {
    const receipt = JSON.parse(content)
    return {
      receiptCommitSha,
      receiptManifestDigest: typeof receipt?.manifestDigest === 'string' ? receipt.manifestDigest.trim() : null,
      receiptStatus: typeof receipt?.status === 'string' ? receipt.status.trim() : null,
      phase1ReceiptManifestDigest: typeof receipt?.source?.phase1ReceiptManifestDigest === 'string'
        ? receipt.source.phase1ReceiptManifestDigest.trim()
        : null,
    }
  } catch {
    return {
      receiptCommitSha,
      receiptManifestDigest: null,
      receiptStatus: null,
      phase1ReceiptManifestDigest: null,
    }
  }
}
