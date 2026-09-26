import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSellerLeadReadinessRows } from '../sellerLeadReadinessDisplayModel.js'

const listingItems = [
  { key: 'photos', label: 'Photos', complete: false },
  { key: 'description', label: 'Description', complete: true },
  { key: 'pricing', label: 'Asking Price', complete: false },
  { key: 'documents', label: 'Seller Documents', complete: false },
  { key: 'property_details', label: 'Property Details', complete: false },
]

test('seller leads show preparation details before a listing exists', () => {
  const rows = buildSellerLeadReadinessRows({
    lead: { sellerPropertyAddress: '12 Oak Road', estimatedValue: 2500000 },
    onboarding: { propertyType: 'House' },
    journey: { onboardingSent: true, mandateStatus: 'draft' },
    listingReadiness: { hasListing: false, items: listingItems },
    documentSummary: { completed: 1, total: 3 },
  })

  assert.deepEqual(rows.map((row) => row.key), [
    'onboarding', 'mandate', 'property_details', 'marketing_assets', 'seller_documents', 'listing',
  ])
  assert.equal(rows.find((row) => row.key === 'onboarding').status, 'Awaiting submission')
  assert.equal(rows.find((row) => row.key === 'property_details').status, 'Captured')
  assert.equal(rows.find((row) => row.key === 'marketing_assets').status, '1 of 3 captured')
  assert.equal(rows.find((row) => row.key === 'seller_documents').status, '1 of 3 complete')
  assert.equal(rows.find((row) => row.key === 'listing').status, 'Not created')
})

test('lead valuation does not count as a captured asking price', () => {
  const rows = buildSellerLeadReadinessRows({
    lead: { estimatedValue: 2500000 },
    listingReadiness: { hasListing: false, items: listingItems.map((item) => ({ ...item, complete: false })) },
  })

  assert.equal(rows.find((row) => row.key === 'marketing_assets').status, 'Not started')
  assert.equal(rows.find((row) => row.key === 'property_details').status, 'Not captured')
})

test('created listings retain the scored checklist', () => {
  const rows = buildSellerLeadReadinessRows({
    journey: { onboardingSubmitted: true, mandateStatus: 'signed' },
    listingReadiness: { hasListing: true, items: listingItems },
  })

  assert.deepEqual(rows.map((row) => row.key), listingItems.map((item) => item.key))
  assert.equal(rows.find((row) => row.key === 'description').status, 'Complete')
  assert.equal(rows.find((row) => row.key === 'pricing').status, 'Incomplete')
})
