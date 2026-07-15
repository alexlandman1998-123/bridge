import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectCanonicalOrganisationOntoAttorneyFirm } from '../attorneyOrganisationFirmProjection.js'

test('canonical organisation identity and branding override attorney legacy mirrors', () => {
  const projected = projectCanonicalOrganisationOntoAttorneyFirm({
    id: 'firm-1',
    organisationId: 'legacy-org',
    name: 'Legacy Legal',
    website: 'https://legacy.example.test',
    email: 'legacy@example.test',
    phone: '0110000000',
    logoUrl: 'https://cdn.example.test/legacy.png',
    primaryColour: '#111111',
    createdBy: 'user-1',
    isActive: true,
  }, {
    id: 'org-1',
    name: 'Canonical Legal',
    display_name: 'Canonical Legal Inc.',
    website: 'https://canonical.example.test',
    company_email: 'canonical@example.test',
    company_phone: '+27115550100',
    logo_url: 'https://cdn.example.test/canonical.png',
    logo_bucket: 'organisation-branding',
    logo_path: 'organisations/org-1/logo.png',
    primary_colour: '#AABBCC',
  })

  assert.equal(projected.organisationId, 'org-1')
  assert.equal(projected.name, 'Canonical Legal Inc.')
  assert.equal(projected.website, 'https://canonical.example.test')
  assert.equal(projected.email, 'canonical@example.test')
  assert.equal(projected.phone, '+27115550100')
  assert.equal(projected.logoUrl, 'https://cdn.example.test/canonical.png')
  assert.equal(projected.logoBucket, 'organisation-branding')
  assert.equal(projected.primaryColour, '#AABBCC')
  assert.equal(projected.createdBy, 'user-1')
  assert.equal(projected.isActive, true)
})

test('mixed deployments retain populated legacy values when a canonical field is not available yet', () => {
  const projected = projectCanonicalOrganisationOntoAttorneyFirm({
    id: 'firm-1',
    name: 'Legacy Legal',
    vatNumber: '4123456789',
    logoDarkUrl: 'https://cdn.example.test/legacy-dark.png',
    country: 'South Africa',
  }, {
    id: 'org-1',
    name: 'Canonical Legal',
    vat_number: null,
    logo_dark_url: '',
  })

  assert.equal(projected.name, 'Canonical Legal')
  assert.equal(projected.vatNumber, '4123456789')
  assert.equal(projected.logoDarkUrl, 'https://cdn.example.test/legacy-dark.png')
  assert.equal(projected.country, 'South Africa')
})

test('a missing canonical organisation leaves the firm unchanged', () => {
  const firm = { id: 'firm-1', name: 'Legacy Legal' }
  assert.equal(projectCanonicalOrganisationOntoAttorneyFirm(firm, null), firm)
})

