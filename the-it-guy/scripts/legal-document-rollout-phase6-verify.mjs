import fs from 'node:fs'
import path from 'node:path'
import { APP_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { assessLegalDocumentRolloutPhase6 } from './legal-document-rollout-phase6-policy.mjs'
import { collectLegalDocumentRolloutPhase6Context } from './legal-document-rollout-phase6-context.mjs'

try {
  const receipt = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'config', 'legal-document-rollout-phase6-successor-proposal.json'), 'utf8'))
  const context = collectLegalDocumentRolloutPhase6Context({ phase5ReceiptCommitSha: receipt.source?.phase5ReceiptCommitSha })
  const report = assessLegalDocumentRolloutPhase6({ receipt, phase5History: context.phase5History })
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'SUCCESSOR_PROPOSAL_RECORDED') process.exitCode = 1
} catch (error) {
  console.error(`Phase 6 successor-proposal verifier blocked: ${error.message}`)
  process.exitCode = 1
}
