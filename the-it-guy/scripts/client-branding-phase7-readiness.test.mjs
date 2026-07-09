import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const clientBrandTheme = await readFile(new URL('../src/lib/clientBrandTheme.js', import.meta.url), 'utf8')
const settingsApi = await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const organisationPage = await readFile(new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url), 'utf8')
const themeTest = await readFile(new URL('./client-brand-theme.test.mjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

for (const token of [
  'export function getClientBrandReadiness',
  'buildReadinessCheck',
  'buildSurfaceReadiness',
  'primary_contrast',
  'secondary_contrast',
  'accent_contrast',
  'Buyer & Seller Onboarding',
  'Client Portal & Tracker',
  'Client Emails',
]) {
  assert(clientBrandTheme.includes(token), `client brand theme should expose Phase 7 readiness marker: ${token}`)
}

for (const token of [
  'getClientBrandReadiness',
  'const brandReadiness = getClientBrandReadiness(theme)',
  'brandReadiness,',
]) {
  assert(settingsApi.includes(token), `canonical branding persistence should store readiness marker: ${token}`)
}

for (const token of [
  'BrandReadinessPanel',
  'Client Experience Readiness',
  'getReadinessTone',
  'const clientBrandInput = {',
  'const clientBrandReadiness = getClientBrandReadiness(clientBrandInput)',
  '<BrandReadinessPanel readiness={clientBrandReadiness} />',
  'clientReadiness={clientBrandReadiness}',
  'Client Readiness',
]) {
  assert(organisationPage.includes(token), `branding settings should surface readiness marker: ${token}`)
}

for (const token of [
  'getClientBrandReadiness',
  "readyBrand.status, 'ready'",
  "incompleteBrand.status, 'needs_attention'",
  'primary_contrast',
]) {
  assert(themeTest.includes(token), `client brand theme test should cover readiness marker: ${token}`)
}

assert.equal(
  packageJson.scripts?.['test:client-branding-phase7-readiness'],
  'node scripts/client-branding-phase7-readiness.test.mjs',
  'package scripts should expose the Phase 7 branding readiness test',
)

console.log('Client branding Phase 7 readiness contract passed.')
