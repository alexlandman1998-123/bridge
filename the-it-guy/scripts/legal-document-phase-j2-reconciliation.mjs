import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import {
  captureLegalDocumentGenerationBaseline,
  reconcileLegalDocumentGenerationFailure,
} from '../src/core/documents/legalDocumentGenerationReconciliation.js'
import { assessLegalDocumentGenerationReconciliationReadiness } from '../src/core/documents/legalDocumentGenerationReconciliationReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const j1 = runJson('scripts/legal-document-phase-j1-recovery.mjs')
const oldVersion = { id: 'fixture-old', version_number: 1, render_status: 'generated' }
const newVersion = { id: 'fixture-new', version_number: 2, render_status: 'generated' }
const baseline = captureLegalDocumentGenerationBaseline([oldVersion])
const scenarioDefinitions = [
  ['duplicate_new_version', { code: 'GENERATION_ALREADY_IN_PROGRESS' }, [[oldVersion], [newVersion, oldVersion]], true],
  ['timeout_new_version', new Error('Generation timed out.'), [[newVersion, oldVersion]], true],
  ['old_version_not_reused', { code: 'GENERATION_TIMEOUT' }, [[oldVersion], [oldVersion]], false],
  ['render_failure_not_polled', { code: 'PDF_RENDER_FAILED' }, [[newVersion, oldVersion]], false],
  ['transient_read_failure', { code: 'GENERATION_TIMEOUT' }, [new Error('read unavailable'), [newVersion, oldVersion]], true],
]
const scenarios = []
for (const [name, error, outcomes, expectedConfirmed] of scenarioDefinitions) {
  let index = 0
  const result = await reconcileLegalDocumentGenerationFailure({ error, baseline, delaysMs: outcomes.map(() => 0), wait: async () => {}, loadStatus: async () => { const outcome = outcomes[Math.min(index++, outcomes.length - 1)]; if (outcome instanceof Error) throw outcome; return { versions: outcome } } })
  scenarios.push({ name, expectedConfirmed, confirmed: result.confirmed, attempted: result.attempted, checks: result.checks, passed: result.confirmed === expectedConfirmed && (name !== 'render_failure_not_polled' || result.attempted === false) })
}
const surfaceFiles = { workspace: 'src/components/documents/LegalDocumentWorkspace.jsx', packet_panel: 'src/components/documents/DocumentPacketWorkflowPanel.jsx', document_builder: 'src/pages/settings/SettingsSigningTemplatesPage.jsx' }
const surfaces = Object.entries(surfaceFiles).filter(([, file]) => { const source = fs.readFileSync(file, 'utf8'); return source.includes('captureLegalDocumentGenerationBaseline') && source.includes('reconcileLegalDocumentGenerationFailure') }).map(([name]) => name)
const feederSuppressionCovered = ['src/pages/agency/AgencyPipelinePage.jsx', 'src/pages/UnitDetail.jsx'].every((file) => fs.readFileSync(file, 'utf8').includes('isAmbiguousLegalDocumentGenerationFailure'))
const assessment = assessLegalDocumentGenerationReconciliationReadiness({ j1: j1 || {}, scenarios, surfaces, feederSuppressionCovered })
const solutions = {
  J2_J1_NOT_READY: 'Complete J1 user-facing recovery and its upstream I3 gate before certifying reconciliation.',
  J2_RECONCILIATION_CONTRACT_INCOMPLETE: 'Poll read-only after ambiguous failures and accept only a generated version newer than the pre-click baseline.',
  J2_RECOVERY_SURFACE_UNCOVERED: 'Add baseline-aware reconciliation to the workspace, packet panel, and document builder.',
  J2_PREMATURE_ERROR_SURFACE_PRESENT: 'Suppress feeder-page errors while the workspace reconciles an ambiguous result.',
}
console.log(JSON.stringify({ phase: 'J2', status: assessment.ready ? 'READY_FOR_J3' : 'NO_GO', blockerCount: assessment.reasons.length, blockers: assessment.reasons.map((code) => ({ code, solution: solutions[code] })), evidence: { j1Status: j1?.status || 'UNAVAILABLE', scenarios, surfaces, feederSuppressionCovered }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
