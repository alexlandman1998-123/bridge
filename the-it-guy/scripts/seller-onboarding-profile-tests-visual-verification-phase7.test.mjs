import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
  phase7Doc: await readFile(new URL('../docs/seller-onboarding-profile-tests-visual-verification-phase7.md', import.meta.url), 'utf8'),
  browserSmoke: await readFile(new URL('./onboarding-branding-browser-smoke.mjs', import.meta.url), 'utf8'),
  phase2: await readFile(new URL('./seller-onboarding-profile-canonical-persistence-phase2.test.mjs', import.meta.url), 'utf8'),
  phase3: await readFile(new URL('./seller-onboarding-profile-canonical-wiring-phase3.test.mjs', import.meta.url), 'utf8'),
  phase4: await readFile(new URL('./seller-onboarding-profile-merge-guardrails-phase4.test.mjs', import.meta.url), 'utf8'),
  phase6: await readFile(new URL('./seller-onboarding-profile-migration-backfill-phase6.test.mjs', import.meta.url), 'utf8'),
}

const scripts = files.packageJson.scripts || {}

assert.equal(
  scripts['test:seller-onboarding-profile-canonical-persistence-phase2'],
  'node scripts/seller-onboarding-profile-canonical-persistence-phase2.test.mjs',
  'Phase 2 canonical persistence contract must be runnable through npm.',
)
assert.equal(
  scripts['test:seller-onboarding-profile-canonical-wiring-phase3'],
  'node scripts/seller-onboarding-profile-canonical-wiring-phase3.test.mjs',
  'Phase 3 canonical wiring contract must be runnable through npm.',
)
assert.equal(
  scripts['test:seller-onboarding-profile-merge-guardrails-phase4'],
  'node scripts/seller-onboarding-profile-merge-guardrails-phase4.test.mjs',
  'Phase 4 protected merge contract must be runnable through npm.',
)
assert.equal(
  scripts['test:seller-onboarding-profile-tests-visual-verification-phase7'],
  'node scripts/seller-onboarding-profile-tests-visual-verification-phase7.test.mjs',
  'Phase 7 verification contract must be runnable through npm.',
)

const verifyCommand = scripts['verify:seller-onboarding-profile-sync'] || ''
for (const scriptName of [
  'test:seller-onboarding-profile-canonical-persistence-phase2',
  'test:seller-onboarding-profile-canonical-wiring-phase3',
  'test:seller-onboarding-profile-merge-guardrails-phase4',
  'test:onboarding-branding-phase5',
  'test:seller-onboarding-profile-alignment-phase6',
  'test:seller-onboarding-profile-migration-backfill-phase6',
  'test:seller-onboarding-profile-tests-visual-verification-phase7',
]) {
  assert.ok(verifyCommand.includes(`npm run ${scriptName}`), `verify command must include ${scriptName}.`)
}

for (const token of [
  'buyer-desktop',
  'buyer-mobile',
  'seller-desktop',
  'seller-mobile',
  'Start buyer onboarding',
  'Start seller onboarding',
  '--landing-primary',
  '--landing-secondary',
  '--landing-accent',
  'onboarding-branding-${target.name}.png',
]) {
  assert.ok(files.browserSmoke.includes(token), `browser smoke should include ${token}.`)
}

assert.match(files.browserSmoke, /errors\.length === 0/, 'browser smoke should fail on console/page errors.')
assert.match(files.browserSmoke, /overlayCount === 0/, 'browser smoke should fail on visible dev error overlays.')
assert.match(files.browserSmoke, /styleValuesPresent/, 'browser smoke should verify resolved landing brand CSS variables.')
assert.match(files.browserSmoke, /page\.screenshot/, 'browser smoke should capture screenshots for review.')

for (const [name, source] of Object.entries({
  phase2: files.phase2,
  phase3: files.phase3,
  phase4: files.phase4,
  phase6: files.phase6,
})) {
  assert.match(source, /console\.log\(/, `${name} contract should emit a clear success marker.`)
}

for (const token of [
  'npm run verify:seller-onboarding-profile-sync',
  'npm run test:onboarding-branding-browser-smoke',
  'buyer desktop',
  'buyer mobile',
  'seller desktop',
  'seller mobile',
  'Phase 6 SQL remains audit-only',
]) {
  assert.ok(files.phase7Doc.includes(token), `Phase 7 doc should mention ${token}.`)
}

console.log('seller onboarding profile tests + visual verification phase 7 passed')
