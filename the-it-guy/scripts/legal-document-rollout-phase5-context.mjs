import fs from 'node:fs'
import path from 'node:path'
import { APP_ROOT, REPO_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { collectLegalDocumentRolloutPhase4Context } from './legal-document-rollout-phase4-context.mjs'
import { collectLegalDocumentRolloutPhase4History } from './legal-document-rollout-phase4-history.mjs'
import { assessLegalDocumentRolloutPhase4 } from './legal-document-rollout-phase4-policy.mjs'

const CONFIG_DIR = path.join(APP_ROOT, 'config')

/**
 * Collects only local Phase 0→4 receipt reports and the committed Phase 4
 * projection needed by Phase 5. It does not query production, a browser, or
 * any provider, and it changes no local or remote state.
 */
export function collectLegalDocumentRolloutPhase5Context() {
  const parent = collectLegalDocumentRolloutPhase4Context()
  const phase4Receipt = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'legal-document-rollout-phase4-pilot-activation.json'), 'utf8'))
  const phase4Report = assessLegalDocumentRolloutPhase4({
    receipt: phase4Receipt,
    phase0Freeze: parent.freeze,
    phase0Report: parent.phase0Report,
    phase1Receipt: parent.phase1Receipt,
    phase1Report: parent.phase1Report,
    phase2Receipt: parent.phase2Receipt,
    phase2Report: parent.phase2Report,
    phase3Receipt: parent.phase3Receipt,
    phase3Report: parent.phase3Report,
    phase3History: parent.phase3History,
  })
  return {
    ...parent,
    phase4Receipt,
    phase4Report,
    phase4History: collectLegalDocumentRolloutPhase4History({ repoRoot: REPO_ROOT, sourceContinuity: parent.sourceContinuity }),
  }
}
