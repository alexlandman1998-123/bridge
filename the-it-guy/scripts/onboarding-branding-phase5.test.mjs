import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { mergeAgencyOnboardingDraft } from '../src/lib/agencyOnboarding.js'
import { resolveOnboardingBranding } from '../src/lib/onboardingBranding.js'

const onboardingDraft = mergeAgencyOnboardingDraft({}, {
  branding: {
    logoLight: '/brand/light.svg',
    logoDark: '/brand/dark.svg',
    logoIcon: '/brand/icon.svg',
    brandColours: {
      primary: '#123456',
      secondary: '#234567',
      accent: '#345678',
    },
  },
})

const resolvedBranding = resolveOnboardingBranding(onboardingDraft.branding)
assert.equal(resolvedBranding.logoLightUrl, '/brand/light.svg')
assert.equal(resolvedBranding.logoDarkUrl, '/brand/dark.svg')
assert.equal(resolvedBranding.logoIconUrl, '/brand/icon.svg')
assert.equal(resolvedBranding.primaryColour, '#123456')
assert.equal(resolvedBranding.secondaryColour, '#234567')
assert.equal(resolvedBranding.accentColour, '#345678')

const files = {
  settingsPage: await readFile(new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url), 'utf8'),
  settingsApi: await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8'),
  buyerApi: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  sellerService: await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
  clientOnboarding: await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8'),
  sellerOnboarding: await readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

assert.match(files.settingsPage, /saveAgencyOnboardingDraft\(\{[\s\S]*\.\.\.state\.onboarding[\s\S]*\}, \{ syncCommercialAccess: true \}\)/)
assert.match(files.settingsPage, /window\.dispatchEvent\(new Event\('itg:organisation-branding-updated'\)\)/)
assert.match(files.settingsApi, /agencyOnboarding:\s*mergedDraft/)
assert.match(files.settingsApi, /\.from\('organisation_settings'\)[\s\S]*settings_json:\s*mergedSettings/)
assert.match(files.settingsApi, /clearOrganisationRuntimeCache\(\)[\s\S]*onboarding:\s*mergedDraft/)
assert.match(files.buyerApi, /async function fetchOrganisationBrandContext[\s\S]*\.from\('organisation_settings'\)[\s\S]*settingsJson/)
assert.match(files.buyerApi, /getOrganisationOnboardingBrandingSources[\s\S]*agencyOnboarding\.branding[\s\S]*settingsJson\.branding/)
assert.match(files.sellerService, /const settingsBranding[\s\S]*resolveOnboardingBranding\(\s*branding,\s*settingsBranding/)
assert.match(files.sellerService, /function resolveListingOrganisationId/, 'seller onboarding service should normalize listing organisation id casing')
assert.match(files.sellerService, /fetchOrganisationBrandingSnapshot\(client, resolveListingOrganisationId\(portalPayload\.listing\)\)/, 'seller onboarding portal payload should attach organisation settings branding')

assert.match(files.clientOnboarding, /primaryColour=\{onboardingBrand\.primaryColour\}/)
assert.match(files.clientOnboarding, /secondaryColour=\{onboardingBrand\.secondaryColour\}/)
assert.match(files.clientOnboarding, /accentColour=\{onboardingBrand\.accentColour\}/)
assert.match(files.sellerOnboarding, /primaryColour=\{brand\?\.primaryColour\}/)
assert.match(files.sellerOnboarding, /secondaryColour=\{brand\?\.secondaryColour\}/)
assert.match(files.sellerOnboarding, /accentColour=\{brand\?\.accentColour\}/)
assert.match(files.sellerOnboarding, /<PremiumOnboardingLanding[\s\S]*portalType="seller"/, 'seller onboarding welcome should use the premium landing surface')
assert.match(files.sellerOnboarding, /agencyLogo=\{brand\?\.logoLightUrl \|\| brand\?\.logoUrl \|\| brand\?\.logoDarkUrl \|\| ''\}/, 'seller premium landing should prefer the light logo for dark backgrounds')
assert.match(files.sellerOnboarding, /ctaLabel=\{actionLabel\}/, 'seller premium landing should receive the resume-aware CTA label')

assert.match(files.packageJson, /"test:onboarding-branding-phase5": "node scripts\/onboarding-branding-phase5\.test\.mjs"/)

console.log('Onboarding branding phase 5 contract passed.')
