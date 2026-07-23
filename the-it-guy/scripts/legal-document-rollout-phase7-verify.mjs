import fs from 'node:fs'
import path from 'node:path'
import { APP_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { assessLegalDocumentRolloutPhase7 } from './legal-document-rollout-phase7-policy.mjs'
import { collectLegalDocumentRolloutPhase7Context } from './legal-document-rollout-phase7-context.mjs'

try {
  const receiptPath = path.join(APP_ROOT, 'config', 'legal-document-rollout-phase7-successor-implementation-boundary.json')
  const stat = fs.lstatSync(receiptPath)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o644) throw new Error('Canonical Phase 7 receipt must be a regular non-symlink mode-0644 file.')
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
  const context = collectLegalDocumentRolloutPhase7Context({
    phase6ReceiptCommitSha: receipt.source?.phase6ReceiptCommitSha,
    implementationCommitSha: receipt.source?.implementationCommitSha,
  })
  const report = assessLegalDocumentRolloutPhase7({
    receipt,
    phase6History: context.phase6History,
    staticBoundaryFacts: context.staticBoundaryFacts,
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'IMPLEMENTATION_BOUNDARY_RECORDED') process.exitCode = 1
} catch (error) {
  console.error(`Phase 7 implementation-boundary verifier blocked: ${error.message}`)
  process.exitCode = 1
}
