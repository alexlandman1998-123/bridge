import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const clientBrandTheme = await readFile(new URL('../src/lib/clientBrandTheme.js', import.meta.url), 'utf8')
const settingsApi = await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const organisationPage = await readFile(new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url), 'utf8')
const themeTest = await readFile(new URL('./client-brand-theme.test.mjs', import.meta.url), 'utf8')
const phase8Test = await readFile(new URL('./client-branding-phase8-deployment.test.mjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

for (const token of [
  'export const CLIENT_BRAND_VERIFICATION_TARGETS',
  'export function buildClientBrandVerificationMatrix',
  'buildVerificationCheck',
  'getVerificationTargetStatus',
  'buyer_onboarding_mobile',
  'seller_onboarding_mobile',
  'client_portal_desktop',
  'transaction_tracker_mobile',
  'client_emails_mobile',
]) {
  assert(clientBrandTheme.includes(token), `client brand theme should expose Phase 9 verification marker: ${token}`)
}

for (const token of [
  'buildClientBrandVerificationMatrix',
  'const brandVerificationMatrix = buildClientBrandVerificationMatrix(theme,',
  'brandVerificationMatrix,',
]) {
  assert(settingsApi.includes(token), `canonical branding publish should store Phase 9 verification marker: ${token}`)
}

for (const token of [
  'buildClientBrandVerificationMatrix',
  'const brandVerificationMatrix =',
  'theme.metadata?.brandVerificationMatrix',
  'brandVerificationMatrix,',
]) {
  assert(api.includes(token), `public branding payload should expose Phase 9 verification marker: ${token}`)
}

for (const token of [
  'BrandVerificationMatrixPanel',
  'Verification Matrix',
  'Rollout Status',
  'const clientBrandVerificationMatrix = buildClientBrandVerificationMatrix(clientBrandInput',
  '<BrandVerificationMatrixPanel matrix={clientBrandVerificationMatrix} />',
]) {
  assert(organisationPage.includes(token), `branding settings should preview Phase 9 verification marker: ${token}`)
}

for (const token of [
  'buildClientBrandVerificationMatrix',
  'verificationMatrix.summary.targetCount, 10',
  'buyer_onboarding_mobile',
  'transaction_tracker_desktop',
  'client_emails_mobile',
]) {
  assert(themeTest.includes(token), `client brand theme test should cover Phase 9 verification marker: ${token}`)
}

assert(phase8Test.includes('buildClientBrandDeploymentManifest'), 'Phase 9 must preserve Phase 8 deployment manifest contract')
assert.equal(
  packageJson.scripts?.['test:client-branding-phase9-verification'],
  'node scripts/client-branding-phase9-verification.test.mjs',
  'package scripts should expose the Phase 9 branding verification test',
)

console.log('Client branding Phase 9 verification contract passed.')
