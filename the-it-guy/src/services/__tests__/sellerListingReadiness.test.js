import assert from 'node:assert/strict'
import test from 'node:test'

import { canActivateListing, getListingReadiness } from '../sellerReadinessService.js'

const sellerLead = {
  leadId: 'seller-1',
  leadCategory: 'seller',
  sellerPhone: '+27820000000',
  sellerPropertyAddress: '12 Oak Road',
  estimatedValue: 2500000,
}

function draftListing(overrides = {}) {
  return {
    id: 'listing-1',
    sellerLeadId: sellerLead.leadId,
    listingStatus: 'draft',
    mandateStatus: 'signed',
    propertyAddress: '12 Oak Road',
    propertyType: 'House',
    askingPrice: 2500000,
    description: 'A complete listing description.',
    galleryImages: [{ url: '/photo.jpg' }],
    documents: [{ documentType: 'electrical_compliance_certificate', status: 'approved', url: '/coc.pdf' }],
    ...overrides,
  }
}

test('a lead valuation does not create readiness before a listing exists', () => {
  const readiness = getListingReadiness({ lead: sellerLead })

  assert.equal(readiness.hasListing, false)
  assert.equal(readiness.percent, 0)
  assert.equal(readiness.completedCount, 0)
  assert.equal(readiness.incompleteItems[0].key, 'listing')
  assert.equal(readiness.items.find((item) => item.key === 'pricing').complete, false)
})

test('a valuation or stale nested price cannot stand in for the listing asking price', () => {
  const listing = draftListing({ askingPrice: 0, propertyDetails: { price: 2500000 } })
  const readiness = getListingReadiness({ lead: { ...sellerLead, listingId: listing.id }, listing })

  assert.equal(readiness.hasListing, true)
  assert.equal(readiness.items.find((item) => item.key === 'pricing').complete, false)
  assert.equal(readiness.incompleteItems.some((item) => item.key === 'pricing'), true)
})

test('property details require both listing address and type', () => {
  const listing = draftListing({ propertyType: '' })
  const readiness = getListingReadiness({ lead: { ...sellerLead, listingId: listing.id }, listing })

  assert.equal(readiness.items.find((item) => item.key === 'property_details').complete, false)
  assert.equal(readiness.incompleteItems.some((item) => item.key === 'property_details'), true)
})

test('a signed mandate does not count as completed seller documents', () => {
  const listing = draftListing({
    documents: [{ documentType: 'mandate', status: 'approved', url: '/mandate.pdf' }],
  })
  const readiness = getListingReadiness({ lead: { ...sellerLead, listingId: listing.id }, listing })

  assert.equal(readiness.items.find((item) => item.key === 'documents').complete, false)
  assert.equal(readiness.percent, 80)
})

test('an otherwise complete draft needs no published link to be ready to activate', () => {
  const listing = draftListing()
  const lead = { ...sellerLead, listingId: listing.id }
  const readiness = getListingReadiness({ lead, listing })

  assert.equal(readiness.hasListing, true)
  assert.equal(readiness.percent, 100)
  assert.equal(readiness.complete, true)
  assert.deepEqual(readiness.items.map((item) => item.key), [
    'photos', 'description', 'pricing', 'documents', 'property_details',
  ])
  assert.equal(canActivateListing({ lead, listing }), true)
})
