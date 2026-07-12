import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  getOnboardingBrandInitials,
  hasResolvedOnboardingBrandingValue,
  resolveOnboardingBranding,
} from '../src/lib/onboardingBranding.js'

{
  const branding = resolveOnboardingBranding({
    organisationName: 'Kingstons Real Estate',
    logoLight: '/brand/kingstons-light.png',
    logoDarkUrl: '/brand/kingstons-dark.png',
    logoIcon: '/brand/kingstons-icon.png',
    brandColours: {
      primary: '#10273A',
      secondary: '#274C69',
      accent: '#F7CF22',
    },
  })

  assert.deepEqual(branding, {
    organisationName: 'Kingstons Real Estate',
    logoLightUrl: '/brand/kingstons-light.png',
    logoDarkUrl: '/brand/kingstons-dark.png',
    logoIconUrl: '/brand/kingstons-icon.png',
    primaryColour: '#10273A',
    secondaryColour: '#274C69',
    accentColour: '#F7CF22',
  })
}

{
  const branding = resolveOnboardingBranding({
    agency_name: 'Legacy Agency',
    logo_url: '/legacy/logo.png',
    primaryColor: '#111111',
    secondary_colour: '#222222',
    accent_color: '#333333',
  })

  assert.equal(branding.organisationName, 'Legacy Agency')
  assert.equal(branding.logoLightUrl, '/legacy/logo.png')
  assert.equal(branding.logoDarkUrl, '/legacy/logo.png')
  assert.equal(branding.logoIconUrl, '/legacy/logo.png')
  assert.equal(branding.primaryColour, '#111111')
  assert.equal(branding.secondaryColour, '#222222')
  assert.equal(branding.accentColour, '#333333')
}

{
  const branding = resolveOnboardingBranding(
    { agencyName: 'Snapshot Agency', logoDark: '/snapshot-dark.svg' },
    { organisationName: 'Current Agency', logoDark: '/current-dark.svg' },
  )

  assert.equal(branding.organisationName, 'Snapshot Agency')
  assert.equal(branding.logoDarkUrl, '/snapshot-dark.svg')
  assert.equal(hasResolvedOnboardingBrandingValue('organisationName', { agencyName: 'Snapshot Agency' }), true)
  assert.equal(hasResolvedOnboardingBrandingValue('organisationName', { logoUrl: '/logo.svg' }), false)
}

{
  const organisation = {
    display_name: 'Organisation Row',
    logo_url: '/org/logo.svg',
    primaryColour: '#AAAAAA',
    settingsJson: {
      branding: {
        organisationName: 'General Settings Brand',
        logoLight: '/settings/light.svg',
        brandColours: {
          primary: '#BBBBBB',
          secondary: '#CCCCCC',
          accent: '#DDDDDD',
        },
      },
      agencyOnboarding: {
        branding: {
          organisationName: 'Onboarding Settings Brand',
          logoDark: '/onboarding/dark.svg',
          logoIcon: '/onboarding/icon.svg',
          brandColours: {
            primary: '#111111',
            secondary: '#222222',
            accent: '#333333',
          },
        },
      },
    },
  }
  const branding = resolveOnboardingBranding(
    organisation.settingsJson.agencyOnboarding.branding,
    organisation.settingsJson.branding,
    organisation,
  )

  assert.equal(branding.organisationName, 'Onboarding Settings Brand')
  assert.equal(branding.logoDarkUrl, '/onboarding/dark.svg')
  assert.equal(branding.logoLightUrl, '/settings/light.svg')
  assert.equal(branding.logoIconUrl, '/onboarding/icon.svg')
  assert.equal(branding.primaryColour, '#111111')
  assert.equal(branding.secondaryColour, '#222222')
  assert.equal(branding.accentColour, '#333333')
}

const files = {
  buyerApi: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  sellerService: await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
}

assert.match(files.buyerApi, /\.from\('organisation_settings'\)[\s\S]*\.select\('settings_json'\)/)
assert.match(files.buyerApi, /resolveOnboardingBranding\(\s*agencyBranding,\s*settingsBranding,\s*organisation,\s*transaction,\s*development\s*\)/)
assert.match(files.sellerService, /resolveOnboardingBranding\(\s*branding,\s*settingsBranding,\s*\{/)

assert.equal(getOnboardingBrandInitials('Kingstons Real Estate'), 'KR')
assert.equal(getOnboardingBrandInitials(''), 'B9')

console.log('Onboarding branding resolver contract passed.')
