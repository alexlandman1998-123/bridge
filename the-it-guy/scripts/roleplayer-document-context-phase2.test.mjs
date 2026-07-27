import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'

const mapped = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    sellerName: 'Mandate Seller',
    idNumber: '8001015009087',
    propertyAddress: '12 Template Road, Cape Town',
    mandateType: 'exclusive',
  },
  lead: {
    agencyName: 'Lead Agency',
  },
  privateListing: {
    id: 'listing-phase-2',
  },
  agency: {
    legalName: 'Agency Legal (Pty) Ltd',
    tradingName: 'Agency Trading',
    agencyRegistrationNumber: '2024/654321/07',
    agencyAddress: '10 Agency Street, Cape Town',
    logoHighContrastUrl: '/brand/agency-dark.svg',
  },
  organisation: {
    displayName: 'Organisation Display',
    email: 'documents@example.test',
    phoneNumber: '+27 21 555 0200',
    website: 'www.documents.example.test',
    logoLightUrl: '/brand/organisation-light.svg',
  },
  agent: {
    fullName: 'Agent User',
    email: 'agent@example.test',
  },
})

assert.equal(mapped.agency.legalName, 'Agency Legal (Pty) Ltd')
assert.equal(mapped.agency.tradingName, 'Agency Trading')
assert.equal(mapped.agency.registrationNumber, '2024/654321/07')
assert.equal(mapped.agency.address, '10 Agency Street, Cape Town')
assert.equal(mapped.agency.email, 'documents@example.test')
assert.equal(mapped.agency.phone, '+27 21 555 0200')
assert.equal(mapped.agency.website, 'www.documents.example.test')
assert.equal(mapped.agency.logoLightUrl, '/brand/organisation-light.svg')
assert.equal(mapped.agency.logoDarkUrl, '/brand/agency-dark.svg')
assert.equal(mapped.branding.email, 'documents@example.test')
assert.equal(mapped.branding.phone, '+27 21 555 0200')
assert.equal(mapped.branding.website, 'www.documents.example.test')
assert.equal(mapped.placeholders.agency_email, 'documents@example.test')
assert.equal(mapped.placeholders.agency_phone, '+27 21 555 0200')
assert.equal(mapped.placeholders.agency_website, 'www.documents.example.test')
assert.equal(mapped.placeholders.organisation_email, 'documents@example.test')
assert.equal(mapped.placeholders.organisation_phone, '+27 21 555 0200')
assert.equal(mapped.placeholders.organisation_telephone, '+27 21 555 0200')
assert.equal(mapped.placeholders.organisation_website, 'www.documents.example.test')
assert.equal(mapped.placeholders.organisation_physical_address, '10 Agency Street, Cape Town')
assert.equal(mapped.placeholders['organisation.email'], 'documents@example.test')
assert.equal(mapped.placeholders['organisation.phone'], '+27 21 555 0200')
assert.equal(mapped.placeholders['organisation.website'], 'www.documents.example.test')
assert.equal(mapped.placeholders['organisation.physical_address'], '10 Agency Street, Cape Town')

const mapperSource = readFileSync(new URL('../src/core/documents/mandateDataMapper.js', import.meta.url), 'utf8')
const packetServiceSource = readFileSync(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const packetWorkflowSource = readFileSync(new URL('../src/core/documents/packetWorkflow.js', import.meta.url), 'utf8')

assert.match(mapperSource, /resolveDocumentBrandingContext/, 'mandate mapper should use the shared document branding adapter')
assert.match(packetServiceSource, /resolveDocumentBrandingContext/, 'packet system placeholders should use the shared document branding adapter')
assert.match(packetWorkflowSource, /resolveDocumentBrandingContext/, 'legal preview rendering should use the shared document branding adapter')
assert.doesNotMatch(packetServiceSource, /const organisationEmail =\s*\n\s*normalizeNullableText\(branding\?\.email\)/, 'packet system placeholders should not restore the old local branding cascade')

console.log('roleplayer document context phase 2 tests passed')
