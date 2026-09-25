import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildListingOverviewPricePosition } from '../listingOverviewPriceModel.js'

test('price position uses only recorded price changes matching the current asking price', () => {
  const result = buildListingOverviewPricePosition({
    listing: { askingPrice: 1800000 },
    activityRows: [
      { id: 'older', activity_type: 'listing_price_changed', created_at: '2026-09-01T10:00:00Z', metadata: { previousPrice: 2100000, nextPrice: 2000000 } },
      { id: 'latest', activity_type: 'listing_price_changed', created_at: '2026-09-10T10:00:00Z', metadata: { previousPrice: 2000000, nextPrice: 1800000 } },
      { id: 'other', activity_type: 'listing_under_offer', created_at: '2026-09-20T10:00:00Z', metadata: { previousPrice: 10, nextPrice: 5 } },
    ],
  })
  assert.equal(result.askingPrice, 1800000)
  assert.equal(result.history.length, 2)
  assert.equal(result.latestChange.id, 'latest')
  assert.equal(result.reductionActive, true)
})

test('unrecorded or unavailable history never fabricates a reduction', () => {
  const result = buildListingOverviewPricePosition({ listing: { askingPrice: 1750000 }, draft: { price: '1750000' }, activityRows: [
    { activity_type: 'listing_price_changed', metadata: { previousPrice: 2000000, nextPrice: 1800000 } },
  ], activityAvailable: false })
  assert.equal(result.history.length, 1)
  assert.equal(result.latestChange, null)
  assert.equal(result.reductionActive, false)
  assert.equal(result.historyAvailable, false)
})

test('invalid or incomplete activity is omitted', () => {
  const result = buildListingOverviewPricePosition({ activityRows: [
    { activity_type: 'listing_price_changed', metadata: { previousPrice: 'x', nextPrice: 10 } },
    { activity_type: 'listing_price_changed', metadata: { previousPrice: 10, nextPrice: 10 } },
  ] })
  assert.equal(result.history.length, 0)
})

test('price position stays renderable while listing data is loading', () => {
  const result = buildListingOverviewPricePosition({ listing: null, draft: null, activityRows: [] })
  assert.equal(result.askingPrice, 0)
  assert.deepEqual(result.history, [])
  assert.equal(result.reductionActive, false)
})
