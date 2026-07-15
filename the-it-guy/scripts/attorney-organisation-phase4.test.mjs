import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAttorneyOrganisationSettingsInput } from '../src/core/organisations/attorneyOrganisationSettings.js'
import { hydrateAttorneyOrganisationSnapshot } from '../src/core/organisations/attorneyOrganisationHydration.js'

const settingsPageSource = readFileSync(
  new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url),
  'utf8',
)

const canonicalInput = buildAttorneyOrganisationSettingsInput({
  organisation: {
    id: 'org-1',
    name: 'Canonical Legal',
    website: 'https://old.example.test',
    companyEmail: 'old@example.test',
    companyPhone: '0110000000',
    addressLine1: '12 Existing Road',
    province: 'Gauteng',
    country: 'South Africa',
    logoDarkUrl: 'https://cdn.example.test/old-dark.png',
    primaryColour: '#111111',
  },
  onboarding: {
    agencyInformation: {
      agencyName: 'Canonical Legal',
      companyRegistrationNumber: '2020/123456/07',
      vatNumber: '4123456789',
      website: 'https://firm.example.test',
      mainEmailAddress: 'firm@example.test',
      mainOfficeNumber: '+27115550100',
    },
    branding: {
      logoLight: 'https://cdn.example.test/logo.png',
      logoLightBucket: 'organisation-branding',
      logoLightPath: 'organisations/org-1/logo.png',
      logoDark: '',
      logoDarkBucket: '',
      logoDarkPath: '',
      brandColours: { primary: '#AABBCC', secondary: '#DDEEFF' },
    },
  },
})

assert.equal(canonicalInput.registrationNumber, '2020/123456/07')
assert.equal(canonicalInput.vatNumber, '4123456789')
assert.equal(canonicalInput.website, 'https://firm.example.test')
assert.equal(canonicalInput.companyEmail, 'firm@example.test')
assert.equal(canonicalInput.companyPhone, '+27115550100')
assert.equal(canonicalInput.logoBucket, 'organisation-branding')
assert.equal(canonicalInput.logoDarkUrl, '', 'Clearing the dark logo must clear the canonical value.')
assert.equal(canonicalInput.primaryColour, '#AABBCC')
assert.equal(canonicalInput.secondaryColour, '#DDEEFF')

const hydrated = hydrateAttorneyOrganisationSnapshot({
  organisation: {
    ...canonicalInput,
    type: 'attorney_firm',
  },
  onboarding: { agencyInformation: {}, branding: {} },
}, {
  workspaceType: 'attorney_firm',
  currentWorkspace: { id: 'firm-1', organisationId: 'org-1', type: 'attorney_firm' },
  currentMembership: { workspaceId: 'firm-1', workspaceRole: 'firm_admin', status: 'active' },
})

assert.equal(hydrated.onboarding.agencyInformation.website, 'https://firm.example.test')
assert.equal(hydrated.onboarding.agencyInformation.vatNumber, '4123456789')
assert.equal(hydrated.onboarding.branding.logoLight, 'https://cdn.example.test/logo.png')
assert.equal(hydrated.onboarding.branding.logoDark, '')
assert.equal(hydrated.onboarding.branding.brandColours.primary, '#AABBCC')

assert.match(settingsPageSource, /const ATTORNEY_FIRM_TYPE_OPTIONS/)
assert.match(settingsPageSource, /const ATTORNEY_PRACTICE_FOCUS_OPTIONS/)
assert.match(settingsPageSource, /const ATTORNEY_PERMISSION_SCOPE_OPTIONS/)
assert.match(settingsPageSource, /informationTitle: 'Firm Information'/)
assert.match(settingsPageSource, /addressTitle: 'Registered Office'/)
assert.match(settingsPageSource, /complianceLabel: 'LPC'/)
assert.match(settingsPageSource, /isAttorneyFirm \? ATTORNEY_FIRM_TYPE_OPTIONS/)
assert.match(settingsPageSource, /isAttorneyFirm \? ATTORNEY_PRACTICE_FOCUS_OPTIONS/)
assert.match(settingsPageSource, /buildAttorneyOrganisationSettingsInput\(nextState\)/)

console.log('attorney organisation Phase 4 settings consolidation contracts passed')
