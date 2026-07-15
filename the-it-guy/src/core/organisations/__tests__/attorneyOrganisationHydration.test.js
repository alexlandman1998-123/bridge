import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttorneyWorkspaceOrganisationFallback,
  hydrateAttorneyOrganisationSnapshot,
  isAttorneyWorkspace,
} from '../attorneyOrganisationHydration.js'

const authState = {
  appRole: 'attorney',
  workspaceType: 'attorney_firm',
  currentMembership: {
    workspaceId: 'firm-1',
    workspaceRole: 'firm_admin',
    status: 'active',
  },
  currentWorkspace: {
    id: 'firm-1',
    organisationId: 'org-1',
    type: 'attorney_firm',
    name: 'Firm fallback name',
    registrationNumber: '2020/123456/07',
    vatNumber: '4123456789',
    email: 'firm@example.test',
    phone: '+27115550100',
    website: 'https://firm.example.test',
    addressLine1: '12 Firm Road',
    addressLine2: 'Suite 4',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2000',
    country: 'South Africa',
    logoUrl: 'https://cdn.example.test/firm-logo.png',
    logoDarkUrl: 'https://cdn.example.test/firm-logo-dark.png',
    primaryColour: '#112233',
    secondaryColour: '#445566',
  },
}

assert.equal(isAttorneyWorkspace(authState), true)

const fallback = buildAttorneyWorkspaceOrganisationFallback(authState)
assert.equal(fallback.organisation.id, 'org-1')
assert.equal(fallback.organisation.workspaceId, 'firm-1')
assert.equal(fallback.organisation.website, 'https://firm.example.test')
assert.equal(fallback.organisation.addressLine2, 'Suite 4')
assert.equal(fallback.onboarding.agencyInformation.companyRegistrationNumber, '2020/123456/07')
assert.equal(fallback.onboarding.branding.logoLight, 'https://cdn.example.test/firm-logo.png')

const hydrated = hydrateAttorneyOrganisationSnapshot({
  organisation: {
    id: 'org-1',
    type: 'attorney_firm',
    name: 'Canonical Legal',
    displayName: 'Canonical Legal Inc.',
    registrationNumber: '2020/999999/07',
    companyEmail: 'canonical@example.test',
    companyPhone: '+27110000000',
    website: 'https://canonical.example.test',
    addressLine1: '99 Canonical Street',
    addressLine2: '',
    city: 'Pretoria',
    province: 'Gauteng',
    postalCode: '',
    country: 'South Africa',
    logoUrl: '',
    logoDarkUrl: 'https://cdn.example.test/canonical-dark.png',
    primaryColour: '#AABBCC',
    secondaryColour: '#DDEEFF',
  },
  onboarding: {
    agencyInformation: {
      agencyName: 'Incorrect agency default',
      website: '',
    },
    branding: {},
  },
  membershipRole: 'owner',
  membershipStatus: 'active',
  persisted: true,
}, authState)

assert.equal(hydrated.hydrationSource, 'backing_organisation')
assert.equal(hydrated.organisation.name, 'Canonical Legal')
assert.equal(hydrated.organisation.website, 'https://canonical.example.test')
assert.equal(hydrated.organisation.addressLine2, 'Suite 4', 'Missing canonical values should use the firm snapshot before backfill.')
assert.equal(hydrated.organisation.postalCode, '2000')
assert.equal(hydrated.onboarding.agencyInformation.agencyName, 'Canonical Legal')
assert.equal(hydrated.onboarding.agencyInformation.website, 'https://canonical.example.test')
assert.equal(hydrated.onboarding.agencyInformation.vatNumber, '4123456789')
assert.equal(hydrated.onboarding.branding.logoLight, 'https://cdn.example.test/firm-logo.png')
assert.equal(hydrated.onboarding.branding.logoDark, 'https://cdn.example.test/canonical-dark.png')
assert.equal(hydrated.onboarding.branding.brandColours.primary, '#AABBCC')
assert.equal(hydrated.onboarding.branding.brandColours.secondary, '#DDEEFF')

const organisationContextSource = readFileSync(
  new URL('../../../context/OrganisationContext.jsx', import.meta.url),
  'utf8',
)
assert.match(
  organisationContextSource,
  /const response = await fetchAgencyOnboardingSettings[\s\S]*resolveHydratedOrganisationSnapshot\(response, authState\)/,
  'Attorney organisation context must fetch the backing organisation before hydrating the snapshot.',
)
assert.doesNotMatch(
  organisationContextSource,
  /if \(shouldUseWorkspaceBranding\(authState\)\)/,
  'Attorney hydration must not short-circuit to the lightweight auth snapshot.',
)

const bootstrapSource = readFileSync(
  new URL('../../../lib/organisationBootstrapApi.js', import.meta.url),
  'utf8',
)
assert.match(bootstrapSource, /find\(isBackingOrganisationMembership\)/)
assert.match(bootstrapSource, /legal_name,[\s\S]*registration_number,[\s\S]*vat_number,[\s\S]*logo_dark_url,[\s\S]*primary_colour/)

console.log('attorney organisation Phase 1 hydration contracts passed')
