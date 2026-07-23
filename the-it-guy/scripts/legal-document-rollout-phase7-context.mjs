import { REPO_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { collectLegalDocumentRolloutPhase6History } from './legal-document-rollout-phase6-history.mjs'
import { collectLegalDocumentRolloutPhase7StaticBoundaryFacts } from './legal-document-rollout-phase7-static-boundary.mjs'

/**
 * Phase 7 has no live runtime context. Both the Phase 6 parent and every
 * source fact are read from explicitly named local Git commits; mutable
 * workspace files are never a source of authority.
 */
export function collectLegalDocumentRolloutPhase7Context({ phase6ReceiptCommitSha, implementationCommitSha } = {}) {
  const phase6History = collectLegalDocumentRolloutPhase6History({
    repoRoot: REPO_ROOT,
    receiptCommitSha: phase6ReceiptCommitSha,
  })
  return {
    phase6History,
    staticBoundaryFacts: collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
      repoRoot: REPO_ROOT,
      phase6ReceiptCommitSha: phase6History.receiptCommitSha,
      implementationCommitSha,
    }),
  }
}
