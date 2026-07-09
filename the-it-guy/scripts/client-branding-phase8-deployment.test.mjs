import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const clientBrandTheme = await readFile(new URL('../src/lib/clientBrandTheme.js', import.meta.url), 'utf8')
const settingsApi = await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const organisationPage = await readFile(new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url), 'utf8')
const themeTest = await readFile(new URL('./client-brand-theme.test.mjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

for (const token of [
  'export function getClientBrandFingerprint',
  'export const CLIENT_BRAND_SURFACE_MANIFEST',
  'export function buildClientBrandDeploymentManifest',
  'stableSerialize',
  'getFingerprintPayload',
  'viewportTargets',
  'buyer_onboarding',
  'seller_onboarding',
  'client_portal',
  'transaction_tracker',
  'workspace_invite_email',
]) {
  assert(clientBrandTheme.includes(token), `client brand theme should expose deployment marker: ${token}`)
}

for (const token of [
  'buildClientBrandDeploymentManifest',
  'const brandDeploymentManifest = buildClientBrandDeploymentManifest(theme,',
  'brandFingerprint: brandDeploymentManifest.fingerprint',
  'brandDeploymentManifest,',
]) {
  assert(settingsApi.includes(token), `canonical branding publish should store deployment marker: ${token}`)
}

for (const token of [
  'buildClientBrandDeploymentManifest',
  'const brandDeploymentManifest =',
  'theme.metadata?.brandDeploymentManifest',
  'brandFingerprint: normalizeNullableText(brandDeploymentManifest.fingerprint)',
  'brandDeploymentManifest,',
]) {
  assert(api.includes(token), `public client branding payload should expose deployment marker: ${token}`)
}

for (const token of [
  'BrandDeploymentManifestPanel',
  'Deployment Manifest',
  'Brand Fingerprint',
  'const clientBrandDeploymentManifest = buildClientBrandDeploymentManifest(clientBrandInput',
  '<BrandDeploymentManifestPanel manifest={clientBrandDeploymentManifest} />',
]) {
  assert(organisationPage.includes(token), `branding settings should preview deployment marker: ${token}`)
}

for (const token of [
  'getClientBrandFingerprint',
  'buildClientBrandDeploymentManifest',
  'fingerprint should ignore rollout timestamps',
  'fingerprint should change when brand-defining values change',
  "['onboarding', 'portal', 'email']",
]) {
  assert(themeTest.includes(token), `client brand theme tests should cover deployment marker: ${token}`)
}

assert.equal(
  packageJson.scripts?.['test:client-branding-phase8-deployment'],
  'node scripts/client-branding-phase8-deployment.test.mjs',
  'package scripts should expose the Phase 8 branding deployment test',
)

console.log('Client branding Phase 8 deployment contract passed.')
