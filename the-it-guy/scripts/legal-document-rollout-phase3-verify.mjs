import fs from 'node:fs'
import path from 'node:path'
import { APP_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { assessLegalDocumentRolloutPhase3 } from './legal-document-rollout-phase3-policy.mjs'
import { collectLegalDocumentRolloutPhase3Context } from './legal-document-rollout-phase3-context.mjs'

try {
  const context = collectLegalDocumentRolloutPhase3Context()
  const receipt = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'config', 'legal-document-rollout-phase3-production-preflight.json'), 'utf8'))
  const report = assessLegalDocumentRolloutPhase3({
    receipt,
    phase0Freeze: context.freeze,
    phase0Report: context.phase0Report,
    phase1Receipt: context.phase1Receipt,
    phase1Report: context.phase1Report,
    phase2Receipt: context.phase2Receipt,
    phase2Report: context.phase2Report,
    phase2History: context.phase2History,
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'PRODUCTION_PREFLIGHT_RECORDED') process.exitCode = 1
} catch (error) {
  console.error(`Phase 3 production-preflight verifier blocked: ${error.message}`)
  process.exitCode = 1
}
