import fs from 'node:fs'
import path from 'node:path'
import { APP_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { assessLegalDocumentRolloutPhase4 } from './legal-document-rollout-phase4-policy.mjs'
import { collectLegalDocumentRolloutPhase4Context } from './legal-document-rollout-phase4-context.mjs'

try {
  const context = collectLegalDocumentRolloutPhase4Context()
  const receipt = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'config', 'legal-document-rollout-phase4-pilot-activation.json'), 'utf8'))
  const report = assessLegalDocumentRolloutPhase4({
    receipt,
    phase0Freeze: context.freeze,
    phase0Report: context.phase0Report,
    phase1Receipt: context.phase1Receipt,
    phase1Report: context.phase1Report,
    phase2Receipt: context.phase2Receipt,
    phase2Report: context.phase2Report,
    phase3Receipt: context.phase3Receipt,
    phase3Report: context.phase3Report,
    phase3History: context.phase3History,
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'PILOT_ACTIVATION_RECORDED') process.exitCode = 1
} catch (error) {
  console.error(`Phase 4 pilot verifier blocked: ${error.message}`)
  process.exitCode = 1
}
