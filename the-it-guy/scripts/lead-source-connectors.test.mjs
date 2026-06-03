import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const connectorSource = await fs.readFile(new URL('../src/services/leadSourceConnectorService.js', import.meta.url), 'utf8')
for (const method of [
  'processProperty24Payload',
  'processPrivatePropertyPayload',
  'processWebsitePayload',
  'processWhatsAppPayload',
  'processManualImportPayload',
  'processGenericSourcePayload',
]) {
  assert.match(connectorSource, new RegExp(`export .*${method}`), `connector should export ${method}`)
}
for (const mapper of [
  'mapProperty24Payload',
  'mapPrivatePropertyPayload',
  'mapWebsitePayload',
  'mapWhatsAppPayload',
  'mapManualImportRow',
  'resolveExternalListingReference',
]) {
  assert.match(connectorSource, new RegExp(`export .*${mapper}`), `connector should export ${mapper}`)
}
assert.match(connectorSource, /createOrUpdateLeadFromEnquiry/)
assert.match(connectorSource, /recordLeadIngestionFailure/)
assert.match(connectorSource, /getOrganisationPrivateListings/)
assert.match(connectorSource, /listingMatchesReference/)

const ingestionSource = await fs.readFile(new URL('../src/services/leadIngestionService.js', import.meta.url), 'utf8')
assert.match(ingestionSource, /export async function recordLeadIngestionFailure/)
assert.match(ingestionSource, /status: 'failed'/)
assert.match(ingestionSource, /reviewStatus: 'needs_review'/)

const reviewPageSource = await fs.readFile(new URL('../src/pages/AgentEnquiriesPage.jsx', import.meta.url), 'utf8')
assert.match(reviewPageSource, /Needs Review/)
assert.match(reviewPageSource, /Failed/)
assert.match(reviewPageSource, /Duplicate/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadSourceConnectorServiceTestUtils } = await server.ssrLoadModule('/src/services/leadSourceConnectorService.js')
  const {
    buildCanonicalLeadPayload,
    listingMatchesReference,
    mapGenericSourcePayload,
    mapManualImportRow,
    mapPrivatePropertyPayload,
    mapProperty24Payload,
    mapWebsitePayload,
    mapWhatsAppPayload,
    referenceTokens,
    validateCanonicalPayload,
  } = __leadSourceConnectorServiceTestUtils

  const organisationId = '11111111-1111-4111-8111-111111111111'

  const website = mapWebsitePayload({
    organisationId,
    formType: 'property_enquiry',
    submissionId: 'web-123',
    firstName: 'Sarah',
    lastName: 'Jones',
    phone: '082 123 4567',
    email: 'SARAH@example.test',
    message: 'Looking for a 3 bedroom house.',
    listingReference: 'WEB-LISTING-9',
    budgetMax: 2200000,
    area: 'Bartlett',
    propertyType: 'House',
    bedrooms: 3,
    receivedAt: '2026-06-03T08:30:00Z',
  })
  assert.equal(website.source, 'Website')
  assert.equal(website.externalReference, 'web-123')
  assert.equal(website.firstName, 'Sarah')
  assert.equal(website.lastName, 'Jones')
  assert.equal(website.phone, '0821234567')
  assert.equal(website.email, 'sarah@example.test')
  assert.equal(website.listingReference, 'WEB-LISTING-9')
  assert.equal(website.requirement.budgetMax, 2200000)
  assert.deepEqual(website.requirement.areas, ['Bartlett'])
  assert.deepEqual(website.requirement.propertyTypes, ['House'])
  assert.equal(validateCanonicalPayload(website).ok, true)

  const valuation = mapWebsitePayload({
    organisationId,
    formType: 'valuation',
    name: 'Seller One',
    email: 'seller@example.test',
    suburb: 'Benoni',
  })
  assert.equal(valuation.leadCategory, 'Seller')
  assert.equal(valuation.requirement.intentType, 'sell')

  const p24 = mapProperty24Payload({
    organisation_id: organisationId,
    enquiryId: 'P24-12345',
    contactName: 'Mike Buyer',
    contactNumber: '+27 82 000 0000',
    email: 'mike@example.test',
    enquiryText: 'Can I view this property?',
    property24ListingId: 'P24-98765',
    timestamp: '2026-06-03T09:00:00Z',
    unexpectedField: { preserve: true },
  })
  assert.equal(p24.source, 'Property24')
  assert.equal(p24.externalReference, 'P24-12345')
  assert.equal(p24.name, 'Mike Buyer')
  assert.equal(p24.phone, '+27820000000')
  assert.equal(p24.listingReference, 'P24-98765')
  assert.equal(p24.rawPayload.unexpectedField.preserve, true)

  const privateProperty = mapPrivatePropertyPayload({
    organisationId,
    id: 'PP-55',
    customer: { name: 'Private Buyer', email: 'private@example.test', phone: '0831112222' },
    body: 'Please send details.',
    privatePropertyListingId: 'PP-LIST-77',
  })
  assert.equal(privateProperty.source, 'Private Property')
  assert.equal(privateProperty.externalReference, 'PP-55')
  assert.equal(privateProperty.email, 'private@example.test')
  assert.equal(privateProperty.listingReference, 'PP-LIST-77')

  const whatsapp = mapWhatsAppPayload({
    organisationId,
    messages: [{ id: 'wamid.1', from: '27821234567', timestamp: 1780497000, text: { body: 'Hi, is the house still available?' } }],
    contacts: [{ wa_id: '27821234567', profile: { name: 'Whats App' } }],
  })
  assert.equal(whatsapp.source, 'WhatsApp')
  assert.equal(whatsapp.externalReference, 'wamid.1')
  assert.equal(whatsapp.phone, '27821234567')
  assert.equal(whatsapp.name, 'Whats App')
  assert.equal(whatsapp.message, 'Hi, is the house still available?')

  const manual = mapManualImportRow({
    'Organisation ID': organisationId,
    Name: 'Import Lead',
    Phone: '084 222 3333',
    Email: 'import@example.test',
    Source: 'Manual Import',
    Message: 'CSV lead',
    'Listing Reference': 'CSV-9',
    Budget: '1800000',
    Area: 'Beyers Park',
    'Property Type': 'Townhouse',
  })
  assert.equal(manual.source, 'Manual Import')
  assert.equal(manual.externalReference.startsWith('IMPORT-'), true)
  assert.equal(manual.phone, '0842223333')
  assert.equal(manual.listingReference, 'CSV-9')
  assert.deepEqual(manual.requirement.areas, ['Beyers Park'])
  assert.deepEqual(manual.requirement.propertyTypes, ['Townhouse'])

  const generic = mapGenericSourcePayload({
    organisationId,
    source: 'mystery-channel',
    name: 'Generic Lead',
    email: 'generic@example.test',
  })
  assert.equal(generic.source, 'Other')
  assert.equal(generic.email, 'generic@example.test')

  const invalidContact = buildCanonicalLeadPayload({ organisationId, source: 'Website', name: 'Name Only' }, 'Website')
  assert.equal(validateCanonicalPayload(invalidContact).ok, false)
  assert.match(validateCanonicalPayload(invalidContact).errors.join(' '), /phone or email/)

  const invalidOrganisation = buildCanonicalLeadPayload({ source: 'Website', email: 'lead@example.test' }, 'Website')
  assert.equal(validateCanonicalPayload(invalidOrganisation).ok, false)
  assert.match(validateCanonicalPayload(invalidOrganisation).errors.join(' '), /organisation/)

  const listing = {
    id: '22222222-2222-4222-8222-222222222222',
    listingReference: 'BR-100',
    property24Reference: 'P24-98765',
    property24ListingUrl: 'https://property24.example/listing/P24-98765',
    privatePropertyReference: 'PP-LIST-77',
    privatePropertyListingUrl: 'https://privateproperty.example/PP-LIST-77',
    externalLinks: [{ label: 'Website', reference: 'WEB-LISTING-9', url: 'https://bridge/listings/web-listing-9' }],
  }
  assert.ok(referenceTokens(listing).includes('p24-98765'))
  assert.equal(listingMatchesReference(listing, 'P24-98765', 'Property24'), true)
  assert.equal(listingMatchesReference(listing, 'PP-LIST-77', 'Private Property'), true)
  assert.equal(listingMatchesReference(listing, 'WEB-LISTING-9', 'Website'), true)
  assert.equal(listingMatchesReference(listing, 'NOPE', 'Website'), false)
} finally {
  await server.close()
}

console.log('lead source connector tests passed')
