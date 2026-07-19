import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildLeadListingLinkPatch,
    getBuyerLeadOptions,
    isLeadLinkedToListing,
    mapAgencyLeadSelectionRows,
  } = await server.ssrLoadModule('/src/lib/agencyLeadSelection.js')
  const { __agencyCrmRepositoryTestUtils } = await server.ssrLoadModule('/src/lib/agencyCrmRepository.js')

  const listing = {
    id: '11111111-1111-4111-8111-111111111111',
    listingTitle: 'TEST — DO NOT ACTION 101 Mock Avenue',
    propertyAddress: '101 Mock Avenue',
    askingPrice: 1000000,
  }
  const rows = mapAgencyLeadSelectionRows({
    contacts: [
      { contactId: 'contact-linked', firstName: 'Linked', lastName: 'Buyer', email: 'linked@example.com', phone: '+27820000002' },
      { contactId: 'contact-unlinked', firstName: 'Unlinked', lastName: 'Buyer', email: 'unlinked@example.com', phone: '+27820000003' },
    ],
    leads: [
      { leadId: 'lead-unlinked', contactId: 'contact-unlinked', leadCategory: 'Buyer', leadSource: 'Manual Entry' },
      { leadId: 'lead-linked', contactId: 'contact-linked', leadCategory: 'Buyer', listingId: listing.id, leadSource: 'Manual Entry' },
      { leadId: 'lead-seller', contactId: 'contact-linked', leadCategory: 'Seller', listingId: listing.id },
    ],
  })

  assert.equal(rows.find((row) => row.id === 'lead-linked').email, 'linked@example.com')
  assert.equal(isLeadLinkedToListing(rows.find((row) => row.id === 'lead-linked'), listing), true)
  assert.equal(isLeadLinkedToListing(rows.find((row) => row.id === 'lead-unlinked'), listing), false)
  const buyerOptions = getBuyerLeadOptions(rows, listing)
  assert.deepEqual(buyerOptions.map((row) => row.id), ['lead-linked', 'lead-unlinked'])

  const linkPatch = buildLeadListingLinkPatch(listing)
  assert.deepEqual(linkPatch, {
    listingId: listing.id,
    enquiredListingId: listing.id,
    enquiredPropertyTitle: 'TEST — DO NOT ACTION 101 Mock Avenue',
    enquiredPropertyAddress: '101 Mock Avenue',
    enquiredPropertyPrice: 1000000,
  })
  const remoteLinkPayload = __agencyCrmRepositoryTestUtils.buildRemoteLeadUpdatePayload(linkPatch)
  assert.equal(remoteLinkPayload.bridgePayload.listing_id, listing.id)
  assert.equal(remoteLinkPayload.corePayload.enquired_listing_id, listing.id)

  console.log('agency lead listing link tests passed')
} finally {
  await server.close()
}
