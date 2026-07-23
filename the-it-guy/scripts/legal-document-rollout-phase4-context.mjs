import fs from 'node:fs'
import path from 'node:path'
import { APP_ROOT, REPO_ROOT } from './legal-document-rollout-phase1-artifacts.mjs'
import { collectLegalDocumentRolloutPhase3Context } from './legal-document-rollout-phase3-context.mjs'
import { collectLegalDocumentRolloutPhase3History } from './legal-document-rollout-phase3-history.mjs'
import { assessLegalDocumentRolloutPhase3 } from './legal-document-rollout-phase3-policy.mjs'

const CONFIG_DIR = path.join(APP_ROOT, 'config')

/**
 * Collects the local-only P0→P3 reports and immutable P3 history required by
 * Phase 4. It never calls a provider, opens a browser, or changes runtime.
 */
export function collectLegalDocumentRolloutPhase4Context() {
  const parent = collectLegalDocumentRolloutPhase3Context()
  const phase3Receipt = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'legal-document-rollout-phase3-production-preflight.json'), 'utf8'))
  const phase3Report = assessLegalDocumentRolloutPhase3({
    receipt: phase3Receipt,
    phase0Freeze: parent.freeze,
    phase0Report: parent.phase0Report,
    phase1Receipt: parent.phase1Receipt,
    phase1Report: parent.phase1Report,
    phase2Receipt: parent.phase2Receipt,
    phase2Report: parent.phase2Report,
    phase2History: parent.phase2History,
  })
  return {
    ...parent,
    phase3Receipt,
    phase3Report,
    phase3History: collectLegalDocumentRolloutPhase3History({ repoRoot: REPO_ROOT, sourceContinuity: parent.sourceContinuity }),
  }
}
