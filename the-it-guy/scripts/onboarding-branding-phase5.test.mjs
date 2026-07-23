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
  onboardingDemoLinks: await readFile(new URL('../src/lib/onboardingDemoLinks.js', import.meta.url), 'utf8'),
  sellerBrandingApi: await readFile(new URL('../server/services/sellerOnboardingBrandingApi.js', import.meta.url), 'utf8'),
  sellerBrandingRoute: await readFile(new URL('../api/public/seller-onboarding-branding.js', import.meta.url), 'utf8'),
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
assert.match(files.sellerService, /fetchSellerOnboardingPublicBrandingSnapshot\(normalizedToken\)/, 'seller onboarding should fall back to token-scoped public branding when anonymous settings reads are blocked')
assert.match(files.sellerBrandingApi, /seller_portal_token/, 'public seller branding API should resolve stable portal tokens')
assert.match(files.sellerBrandingApi, /seller_portal_invite_token_hash/, 'public seller branding API should resolve invite tokens by hash without exposing token material')
assert.match(files.sellerBrandingApi, /createSignedUrl\(normalizedPath, 60 \* 60 \* 24 \* 7\)/, 'public seller branding API should mint fresh logo URLs from storage paths')
assert.match(files.sellerBrandingApi, /resolveOnboardingBranding\(/, 'public seller branding API should use the shared onboarding branding resolver')
assert.match(files.sellerBrandingRoute, /createSellerOnboardingBrandingResponse/, 'seller branding route should delegate to the token-scoped API service')

assert.match(files.clientOnboarding, /primaryColour=\{onboardingBrand\.primaryColour\}/)
assert.match(files.clientOnboarding, /secondaryColour=\{onboardingBrand\.secondaryColour\}/)
assert.match(files.clientOnboarding, /accentColour=\{onboardingBrand\.accentColour\}/)
assert.match(files.clientOnboarding, /const logoLightUrl = branding\.logoLightUrl \|\| ''/, 'buyer landing brand should retain the resolved light logo URL')
assert.match(files.clientOnboarding, /agencyLogo=\{onboardingBrand\.logoLightUrl \|\| onboardingBrand\.logoUrl \|\| onboardingBrand\.logoDarkUrl \|\| ''\}/, 'buyer premium landing should prefer the light logo for dark backgrounds')
assert.match(files.sellerOnboarding, /primaryColour=\{brand\?\.primaryColour\}/)
assert.match(files.sellerOnboarding, /secondaryColour=\{brand\?\.secondaryColour\}/)
assert.match(files.sellerOnboarding, /accentColour=\{brand\?\.accentColour\}/)
assert.match(files.sellerOnboarding, /<PremiumOnboardingLanding[\s\S]*portalType="seller"/, 'seller onboarding welcome should use the premium landing surface')
assert.match(files.sellerOnboarding, /agencyLogo=\{brand\?\.logoLightUrl \|\| brand\?\.logoUrl \|\| brand\?\.logoDarkUrl \|\| ''\}/, 'seller premium landing should prefer the light logo for dark backgrounds')
assert.match(files.sellerOnboarding, /ctaLabel=\{actionLabel\}/, 'seller premium landing should receive the resume-aware CTA label')
assert.match(files.onboardingDemoLinks, /organisationName: 'Produktive Realty'/, 'static onboarding demo links should use the Produktive demo organisation')
assert.match(files.onboardingDemoLinks, /logoLightUrl: '\/brand\/produktive-realty-logo-white\.svg'/, 'static onboarding demo links should use the Produktive white logo on premium dark landings')
assert.match(files.onboardingDemoLinks, /primaryColour: '#28256f'/, 'static onboarding demo links should use the Produktive primary colour')
assert.match(files.onboardingDemoLinks, /accentColour: '#d1ad61'/, 'static onboarding demo links should use the Produktive gold accent')

assert.match(files.packageJson, /"test:onboarding-branding-phase5": "node scripts\/onboarding-branding-phase5\.test\.mjs"/)

console.log('Onboarding branding phase 5 contract passed.')
