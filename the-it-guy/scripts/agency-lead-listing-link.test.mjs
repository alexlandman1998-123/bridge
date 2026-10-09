import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { buildListingLeadMetrics } from '../src/services/listings/listingLeadMetrics.js'

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
    isSellerLeadForListing,
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

  // Run the real listing-page selection and merge against a seller intake,
  // buyer enquiries, and the interest-list fallback. Both paths feed totals.
  const detail = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
  const selectBlock = detail.slice(detail.indexOf('const listingLeads = useMemo('), detail.indexOf('const buyerOfferLeads = useMemo('))
  const selectExpression = selectBlock.match(/return (pipelineLeads\.filter\([^\n]+\))/)?.[1]
  assert.ok(selectExpression)
  const select = Function('pipelineLeads', 'listingRecord', 'isLeadLinkedToListing', 'isSellerLeadForListing', `return ${selectExpression}`)
  const linkedListing = { ...listing, sellerLeadId: 'lead-seller', originatingCrmLeadId: 'legacy-owner' }
  const inputs = [...rows,
    { leadId: 'legacy-owner', listingId: listing.id },
    { leadId: 'other-seller', lead_category: 'seller', listingId: listing.id },
    { leadId: 'legacy-enquiry', listingId: listing.id },
    { leadId: 'investor', leadCategory: 'investor', listingId: listing.id },
  ]
  const selected = select(inputs, linkedListing, isLeadLinkedToListing, isSellerLeadForListing)
  assert.deepEqual(selected.map(row => row.leadId), ['lead-linked', 'legacy-enquiry', 'investor'])
  assert.equal(select([rows.find(row => row.id === 'lead-seller')], linkedListing, isLeadLinkedToListing, isSellerLeadForListing).length, 0)
  assert.equal(isSellerLeadForListing(null, null), false)
  assert.equal(isSellerLeadForListing({ lead_id: 'legacy-owner' }, { originating_crm_lead_id: 'legacy-owner' }), true)
  assert.equal(isSellerLeadForListing({ id: 'seller-contact', contact_type: 'Seller' }, listing), true)
  assert.equal(isSellerLeadForListing(rows.find(row => row.id === 'lead-linked'), linkedListing), false, 'A buyer lead sharing the seller contact remains a buyer enquiry.')

  const mergeBlock = detail.slice(detail.indexOf('const listingLeadRows = useMemo('))
  const addLeadSource = mergeBlock.slice(mergeBlock.indexOf('const addLead = '), mergeBlock.indexOf('listingLeads.forEach('))
  const identityHelpers = detail.slice(detail.indexOf('function getLeadRecordId('), detail.indexOf('function getLeadCreatedAt('))
  const merge = Function('leadRows', 'interests', 'listingRecord', 'isSellerLeadForListing', 'getLeadCreatedAt', `${identityHelpers}\nconst leadMap = new Map();\n${addLeadSource}\nleadRows.forEach(lead => addLead(lead)); interests.forEach(interest => addLead(interest.lead || {}, interest)); return [...leadMap.values()];`)
  const merged = merge(selected, [
    { leadId: 'lead-seller' },
    { leadId: 'legacy-owner', lead: {} },
    { leadId: 'other-seller', lead: { leadCategory: 'seller' } },
    { leadId: 'portal-enquiry', source: 'Property24' },
    { leadId: 'lead-linked' },
  ], linkedListing, isSellerLeadForListing, lead => lead.createdAt || '')
  assert.deepEqual(merged.map(row => row.leadId), ['lead-linked', 'legacy-enquiry', 'investor', 'portal-enquiry'])
  assert.equal(buildListingLeadMetrics(merged).total, 4)
  const sellerOnly = merge([], [{ leadId: 'lead-seller' }], linkedListing, isSellerLeadForListing, () => '')
  assert.equal(buildListingLeadMetrics(sellerOnly).total, 0, 'A seller-only listing must show zero enquiries.')

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
