import { REPO_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { collectLegalDocumentRolloutPhase5History } from './legal-document-rollout-phase5-history.mjs'

/**
 * Phase 6 has no runtime context. It reads only the explicitly named Phase 5
 * receipt blob from local Git, so an editable Phase 5 working-tree file
 * cannot change the proposed successor scope.
 */
export function collectLegalDocumentRolloutPhase6Context({ phase5ReceiptCommitSha } = {}) {
  return {
    phase5History: collectLegalDocumentRolloutPhase5History({
      repoRoot: REPO_ROOT,
      receiptCommitSha: phase5ReceiptCommitSha,
    }),
  }
}
