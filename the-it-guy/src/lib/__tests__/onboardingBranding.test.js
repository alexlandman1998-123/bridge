import assert from 'node:assert/strict'

import { resolveOnboardingBranding } from '../onboardingBranding.js'

const branding = resolveOnboardingBranding({
  organisation_display_name: 'Agency CI',
  logo_light_url: 'https://cdn.example.test/agency-light.svg',
  logo_dark_url: 'https://cdn.example.test/agency-dark.svg',
  primary_brand_color: '#123abc',
  secondary_brand_color: '#fedcba',
  accent_brand_color: '#45de90',
})

assert.equal(branding.organisationName, 'Agency CI')
assert.equal(branding.logoLightUrl, 'https://cdn.example.test/agency-light.svg')
assert.equal(branding.logoDarkUrl, 'https://cdn.example.test/agency-dark.svg')
assert.equal(branding.primaryColour, '#123abc')
assert.equal(branding.secondaryColour, '#fedcba')
assert.equal(branding.accentColour, '#45de90')

console.log('onboardingBranding tests passed')
