import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./legal-document-rollout-phase4-activate.mjs', import.meta.url), 'utf8')
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

for (const token of [
  'LEGAL_DOCUMENT_ROLLOUT_PHASE4_ACTIVATION_APPROVED',
  'confirm-project-ref',
  'confirm-organisation-id',
  'confirm-activation-plan-digest',
  'confirm-phase3-receipt-commit',
  'route-coverage-evidence-digest',
  'LEGAL_DOCUMENT_PILOT_ENABLED',
  'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS',
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST',
  'LEGAL_DOCUMENT_PILOT_ENABLED: \'false\'',
  'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: \'__none__\'',
  'LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: \'__none__\'',
  'ROLLED_BACK_AFTER_VERIFICATION_FAILURE',
  'ACTIVATION_FAILURE_REQUIRES_MANUAL_DARK_LAUNCH_RESTORE',
  'BLOCKED_PRE_ACTIVATION_DARK_LAUNCH_MISMATCH',
  'P4_PRE_ACTIVATION_DARK_LAUNCH_MISMATCH',
  'ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT',
]) assert.ok(source.includes(token), `Phase 4 activator must retain ${token}.`)

assert.match(source, /if \(!args\.apply \|\| blockers\.length\)/, 'Remote mutation must be unreachable in dry-run mode.')
assert.match(source, /process\.env\[APPLY_APPROVAL_ENV\] !== 'true'/, 'Remote mutation must require the explicit activation approval environment flag.')
assert.match(source, /setRuntimeValues\(plan\.environment\.productionProjectRef, values\)/, 'The activator must write only the sealed plan values to its exact project.')
assert.match(source, /observedValueDigests\(secretRows\(plan\.environment\.productionProjectRef\)\)/, 'The activator must verify the post-write remote fingerprints.')
assert.match(source, /if \(!sameJson\(preActivationObserved, expectedValueDigests\(DARK_LAUNCH_VALUES\)\)\)/, 'The activator must refuse to overwrite a runtime that is not already the sealed dark-launch baseline.')
assert.match(source, /ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS/, 'The activator must reject a sealed plan outside the finalizer activation window.')
assert.match(source, /rollbackToDarkLaunch\(plan\.environment\?\.productionProjectRef\)/, 'Any attempted activation failure must restore the exact dark-launch runtime.')
assert.doesNotMatch(source, /(?:writeFileSync|renameSync|fs\.promises\.writeFile)[\s\S]{0,200}legal-document-pilot\.json/, 'The Phase 4 activator must never mutate the local legacy pilot config.')
assert.doesNotMatch(source, /\bfetch\(/, 'The activator must use the constrained CLI secret path, not arbitrary HTTP calls.')
assert.match(source, /npx', \['supabase', 'secrets', 'set'/, 'The activator must use the explicit Supabase secret writer only after its apply gates.')
assert.match(source, /npx', \['supabase', 'secrets', 'list'/, 'The activator must verify target secret fingerprints after writing.')
assert.equal(pkg.scripts?.['activate:legal-documents:rollout-phase4'], 'node scripts/legal-document-rollout-phase4-activate.mjs')

console.log('Legal-document rollout Phase 4 activator contract passed.')
