import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  decodePrivateListingPageCursor,
  encodePrivateListingPageCursor,
  PRIVATE_LISTING_SUMMARY_PAGE_DEFAULT_SIZE,
  PRIVATE_LISTING_SUMMARY_PAGE_MAX_SIZE,
} from '../the-it-guy/src/services/listings/privateListingPagination.js'

assert.equal(PRIVATE_LISTING_SUMMARY_PAGE_DEFAULT_SIZE, 25)
assert.equal(PRIVATE_LISTING_SUMMARY_PAGE_MAX_SIZE, 50)
const cursor = encodePrivateListingPageCursor({ id: '11111111-1111-4111-8111-111111111111', updated_at: '2026-08-30T08:00:00.000Z' })
assert.deepEqual(decodePrivateListingPageCursor(cursor), {
  id: '11111111-1111-4111-8111-111111111111',
  updatedAt: '2026-08-30T08:00:00.000Z',
})
assert.equal(decodePrivateListingPageCursor('invalid'), null)

const serviceSource = fs.readFileSync('the-it-guy/src/services/privateListingService.js', 'utf8')
const pageFunction = serviceSource.slice(serviceSource.indexOf('export async function getAgentPrivateListingSummaryPage'))
assert.match(pageFunction, /\.limit\(safePageSize \+ 1\)/)
assert.match(pageFunction, /\.order\('updated_at', \{ ascending: false \}\)/)
assert.match(pageFunction, /fetchCoverMediaRowsForListings/)
assert.doesNotMatch(pageFunction.slice(0, pageFunction.indexOf('return {\n    items')), /select\('\*'\)/)

const pageSource = fs.readFileSync('the-it-guy/src/pages/rentals/RentalListingsPage.jsx', 'utf8')
assert.match(pageSource, /listRentalListingSummaryPage/)
assert.match(pageSource, /pageSize: 25/)
assert.match(pageSource, /Load more listings/)
assert.doesNotMatch(pageSource, /listRentalListingsForAgent/)

console.log('rental listing pagination tests passed')
