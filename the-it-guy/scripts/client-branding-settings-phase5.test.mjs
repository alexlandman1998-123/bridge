import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const organisationPage = await readFile(new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

for (const token of [
  'ARCH9_BRAND_COLOURS',
  'heroImage: {',
  "variant: 'hero-image'",
  'Hero Background',
  'getBrandHeroImage',
  'extractBrandColourSuggestionsFromFile',
  'suggestedColours',
  'detectedPalette',
  'colourSuggestionSource',
  'Apply Suggested Colours',
  'Reset to Arch9',
  'applySuggestedBrandColours',
  'resetBrandingToArch9',
  'BrandOnboardingPreview',
  'Buyer Onboarding',
  'Seller Onboarding',
  "activeTab === 'buyer' || activeTab === 'seller'",
  "setBrandPreviewTab('buyer')",
]) {
  assert(organisationPage.includes(token), `branding settings Phase 5 should include marker: ${token}`)
}

for (const token of [
  'heroImageUrl',
  'backgroundImageUrl',
  'coverImageUrl',
  'previewMode={asset.previewMode}',
  'object-cover',
  'Start {isSeller ?',
]) {
  assert(organisationPage.includes(token), `onboarding preview should support responsive hero branding marker: ${token}`)
}

assert.equal(
  packageJson.scripts?.['test:client-branding-settings-phase5'],
  'node scripts/client-branding-settings-phase5.test.mjs',
  'package scripts should expose the Phase 5 branding settings test',
)

console.log('Client branding settings Phase 5 contract passed.')
