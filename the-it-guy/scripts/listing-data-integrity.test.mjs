import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const organisationId = '11111111-1111-4111-8111-111111111111'
const sellerLeadId = '22222222-2222-4222-8222-222222222222'
const buyerLeadId = '33333333-3333-4333-8333-333333333333'
const listingId = '44444444-4444-4444-8444-444444444444'
const contactId = '55555555-5555-4555-8555-555555555555'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    assessBuyerOfferIntegrity,
    assessListingSellerLink,
    assessSellerLeadPersistence,
    assessSellerOnboardingIntegrity,
  } = await server.ssrLoadModule('/src/lib/listingDataIntegrity.js')

  const sellerLead = {
    leadId: sellerLeadId,
    contactId,
    organisationId,
    sellerEmail: 'seller@example.com',
    sellerPhone: '+27820000001',
  }
  const listing = {
    id: listingId,
    organisationId,
    sellerLeadId,
    originatingCrmLeadId: sellerLeadId,
  }
  const buyerLead = {
    leadId: buyerLeadId,
    contactId,
    organisationId,
    email: 'buyer@example.com',
  }

  assert.equal(assessSellerLeadPersistence({
    organisationId,
    sellerLead,
    expectedSeller: { email: 'SELLER@example.com', phone: '+27820000001' },
  }).ok, true, 'persisted seller lead should retain the captured contact and workspace')
  assert.equal(assessSellerLeadPersistence({
    organisationId,
    sellerLead: { ...sellerLead, sellerPhone: '+27820000099' },
    expectedSeller: { phone: '+27820000001' },
  }).issues[0].code, 'seller_phone_mismatch', 'changed seller phone must be detected before listing creation')

  assert.equal(assessListingSellerLink({ organisationId, listing, sellerLead }).ok, true, 'listing should retain both seller lead links')
  assert.equal(assessListingSellerLink({
    organisationId,
    listing: { ...listing, originatingCrmLeadId: buyerLeadId },
    sellerLead,
  }).issues.some((entry) => entry.code === 'originating_lead_mismatch'), true, 'listing must not be linked to a different originating lead')

  assert.equal(assessBuyerOfferIntegrity({ organisationId, listing, buyerLead }).ok, true, 'buyer offer may proceed with a persisted buyer contact')
  assert.equal(assessBuyerOfferIntegrity({
    organisationId,
    listing,
    buyerLead: { ...buyerLead, contactId: '', email: '', phone: '' },
  }).issues.some((entry) => entry.code === 'buyer_contact_missing'), true, 'buyer offer must stop when the lead has no contact')
  assert.equal(assessBuyerOfferIntegrity({
    organisationId,
    listing,
    buyerLead: { ...buyerLead, organisationId: 'other-organisation' },
  }).issues.some((entry) => entry.code === 'buyer_organisation_mismatch'), true, 'buyer offer must stop when the buyer is from another workspace')

  assert.equal(assessSellerOnboardingIntegrity({ organisationId, listing }).ok, true, 'persisted listing can start seller onboarding')
  assert.equal(assessSellerOnboardingIntegrity({ organisationId, listing: {} }).issues[0].code, 'listing_missing', 'seller onboarding must stop for an unsaved listing')
} finally {
  await server.close()
}

const appRoot = new URL('../', import.meta.url)
const repositorySource = await fs.readFile(new URL('src/lib/agencyCrmRepository.js', appRoot), 'utf8')
const listingsSource = await fs.readFile(new URL('src/pages/AgentListings.jsx', appRoot), 'utf8')
const listingDetailSource = await fs.readFile(new URL('src/pages/AgentListingDetail.jsx', appRoot), 'utf8')

assert.match(repositorySource, /Lead update could not be verified/, 'CRM lead updates must reject a silent zero-row update')
assert.match(listingsSource, /assessSellerLeadPersistence/, 'guided listing creation must validate seller lead persistence')
assert.match(listingsSource, /assessListingSellerLink/, 'guided listing creation must validate the lead-to-listing relationship')
assert.match(listingDetailSource, /assessBuyerOfferIntegrity/, 'offer generation must validate the buyer graph')
assert.match(listingDetailSource, /assessSellerOnboardingIntegrity/, 'seller onboarding must validate its listing context')

console.log('listing data integrity checks passed')
