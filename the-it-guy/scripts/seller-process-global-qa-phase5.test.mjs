import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const phase5Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase5-global-qa.md'), 'utf8')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const requiredScripts = Object.freeze({
  'test:seller-process-global-qa-phase5': 'node scripts/seller-process-global-qa-phase5.test.mjs',
  'verify:seller-process-global-qa': 'npm run test:seller-process-global-qa-phase5',
  'test:seller-post-mandate-document-contract': 'node scripts/seller-post-mandate-document-contract.test.mjs',
  'test:seller-post-mandate-document-portal-behavior': 'node scripts/seller-post-mandate-document-portal-behavior.test.mjs',
  'test:pipeline-seller-portal-stability': 'node scripts/pipeline-seller-portal-stability.test.mjs',
})

const qaChecks = Object.freeze([
  ['test:seller-process-freeze-split-phase0', 'global and Kingstons process split stays frozen'],
  ['test:seller-process-profile-boundary-phase1', 'Kingstons cannot activate by name or agent email alone'],
  ['test:seller-process-global-smoke-phase1', 'global seller journey reaches listing live without Kingstons tokens'],
  ['test:seller-process-projection-phase4', 'process projection remains read-only and cannot replace the global journey'],
  ['test:seller-document-conditional-logic-phase2', 'GAS, COC, solar, beetle, plumbing, water and related documents are conditional'],
  ['test:seller-onboarding-flow-contract', 'seller onboarding captures the expected seller and property structure'],
  ['test:seller-onboarding-mandate-draft-precreation-phase1', 'submitted onboarding can pre-create the mandate draft'],
  ['test:seller-onboarding-mandate-draft-reuse-phase2', 'existing onboarding mandate drafts are reused safely'],
  ['test:lead-mandate-quick-start', 'agent can generate the mandate quick-start path'],
  ['test:mandate-signing-send-responsiveness', 'mandate send/signing starts responsively'],
  ['test:lead-mandate-background-signing-start', 'background signing start updates the selected lead safely'],
  ['test:lead-mandate-send-recover-generated-packet', 'send flow recovers generated mandate packets'],
  ['test:lead-mandate-status-prefers-signable-packet', 'status prefers the signable mandate packet'],
  ['test:lead-mandate-targeted-refresh-phase5', 'mandate generate/send uses targeted refresh instead of full reloads'],
  ['test:seller-listing-conversion-idempotency', 'signed mandate converts to one active listing idempotently'],
  ['test:seller-listing-relationship-integrity', 'lead/listing relationships stay canonical'],
  ['test:seller-listing-document-continuity', 'listing document tab keeps mandate and seller uploads continuous'],
  ['test:seller-document-upload-state-persistence', 'agent uploads persist against the correct seller document requirement'],
  ['test:seller-post-mandate-document-contract', 'post-mandate seller document requests require submitted onboarding and signed mandate'],
  ['test:seller-post-mandate-document-portal-behavior', 'seller portal document tab derives the correct post-onboarding documents'],
  ['test:seller-post-mandate-document-phase8', 'post-mandate document request audit remains observable'],
  ['test:seller-portal-alignment', 'seller portal progress aligns to the shared seller journey'],
  ['test:seller-portal-ui-regression', 'seller portal document centre and mobile document tab stay stable'],
  ['test:pipeline-seller-portal-stability', 'pipeline and seller portal routing stay stable'],
])

for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
  assert.equal(
    packageJson.scripts?.[scriptName],
    expectedCommand,
    `package.json should expose ${scriptName}`,
  )
}

for (const [scriptName] of qaChecks) {
  assert.ok(packageJson.scripts?.[scriptName], `Phase 5 QA depends on missing package script: ${scriptName}`)
}

for (const requiredText of [
  'send onboarding link',
  'generate mandate',
  'send and sign mandate',
  'document tab',
  'seller onboarding submitted',
  'agent upload on behalf',
  'global and kingstons must not mix',
]) {
  assert.match(phase5Doc.toLowerCase(), new RegExp(requiredText), `Phase 5 runbook must mention ${requiredText}`)
}

for (const [scriptName, description] of qaChecks) {
  console.log(`\n[Phase 5] ${description}`)
  const result = spawnSync(npmCommand, ['run', scriptName, '--silent'], {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  })
  assert.equal(result.status, 0, `${scriptName} failed`)
}

console.log('\n[Phase 5] production build')
const buildResult = spawnSync(npmCommand, ['run', 'build', '--silent'], {
  cwd: appRoot,
  env: process.env,
  stdio: 'inherit',
})
assert.equal(buildResult.status, 0, 'npm run build failed')

console.log('\nseller process global QA Phase 5 suite passed')
