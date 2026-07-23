import fs from 'node:fs'
import path from 'node:path'
import { APP_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { assessLegalDocumentRolloutPhase5 } from './legal-document-rollout-phase5-policy.mjs'
import { collectLegalDocumentRolloutPhase5Context } from './legal-document-rollout-phase5-context.mjs'

try {
  const context = collectLegalDocumentRolloutPhase5Context()
  const receipt = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'config', 'legal-document-rollout-phase5-pilot-observation.json'), 'utf8'))
  const report = assessLegalDocumentRolloutPhase5({
    receipt,
    phase0Freeze: context.freeze,
    phase0Report: context.phase0Report,
    phase1Receipt: context.phase1Receipt,
    phase1Report: context.phase1Report,
    phase2Receipt: context.phase2Receipt,
    phase2Report: context.phase2Report,
    phase3Receipt: context.phase3Receipt,
    phase3Report: context.phase3Report,
    phase4Receipt: context.phase4Receipt,
    phase4Report: context.phase4Report,
    phase4History: context.phase4History,
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'PILOT_OBSERVATION_RECORDED') process.exitCode = 1
} catch (error) {
  console.error(`Phase 5 pilot-observation verifier blocked: ${error.message}`)
  process.exitCode = 1
}
