import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const readWorkspaceSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
const readAppSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const docSource = await readWorkspaceSource('docs/forward-port-buyer-seller-bond-workflows-20260811.md')
const packageSource = await readAppSource('package.json')
const packageJson = JSON.parse(packageSource)

assert.match(
  execFileSync('git', ['branch', '--show-current'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' }),
  /^codex\/forward-port-buyer-seller-bond-workflows-20260811\s*$/,
  'Phase 8 closeout should run on the forward-port integration branch',
)

for (const phase of ['Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', 'Phase 7']) {
  assert.match(docSource, new RegExp(`## ${phase} Verification`), `${phase} verification should be recorded`)
}

const expectedScripts = {
  'test:agency-pipeline-buyer-offer-workspace-phase2': 'node scripts/agency-pipeline-buyer-offer-workspace-phase2.test.mjs',
  'test:forward-port-seller-workspace-phase3': 'node scripts/forward-port-seller-workspace-phase3.test.mjs',
  'test:forward-port-kingstons-seller-process-phase4': 'node scripts/forward-port-kingstons-seller-process-phase4.test.mjs',
  'test:forward-port-bond-originator-phase5': 'node scripts/forward-port-bond-originator-phase5.test.mjs',
  'test:forward-port-bond-originator-emails-phase6': 'node scripts/forward-port-bond-originator-emails-phase6.test.mjs',
  'test:forward-port-supabase-migrations-phase7': 'node scripts/forward-port-supabase-migrations-phase7.test.mjs',
}

for (const [scriptName, command] of Object.entries(expectedScripts)) {
  assert.equal(packageJson.scripts?.[scriptName], command, `${scriptName} should stay wired for PR verification`)
}

const requiredEvidence = [
  'sidebar-parent-navigation.test.mjs',
  'agency-pipeline-buyer-offer-workspace-phase2.test.mjs',
  'forward-port-seller-workspace-phase3.test.mjs',
  'forward-port-kingstons-seller-process-phase4.test.mjs',
  'forward-port-bond-originator-phase5.test.mjs',
  'forward-port-bond-originator-emails-phase6.test.mjs',
  'forward-port-supabase-migrations-phase7.test.mjs',
  'npm run build',
  'npm test',
  'Do not raw-merge the source branches',
  'No production deployment is authorized from Phase 8',
]

for (const evidence of requiredEvidence) {
  assert.ok(docSource.includes(evidence), `Phase 8 closeout should preserve evidence: ${evidence}`)
}

assert.match(docSource, /origin\/codex\/seller-first-contact-reload/)
assert.match(docSource, /origin\/codex\/kingston-seller-process-release/)
assert.match(docSource, /origin\/codex\/seller-process-next-action-fix/)
assert.match(docSource, /origin\/agent\/legal-document-notification-sequence-phase1/)
assert.match(docSource, /origin\/agent\/document-generation-cleanup-final-closure/)
assert.match(docSource, /origin\/codex\/supabase-preview-ledger-followup-20260811/)

console.log('forward-port reconciliation closeout Phase 8 checks passed')
