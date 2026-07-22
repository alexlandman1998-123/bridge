import assert from 'node:assert/strict'
import {
  findPrivateListingById,
  getPrivateListingRecordId,
  normalizePrivateListingRecord,
  sanitizePrivateListingRows,
} from '../src/lib/privateListingRecordIntegrity.js'

const rows = sanitizePrivateListingRows([
  null,
  undefined,
  false,
  'not-a-listing',
  { id: 'listing-1', listingTitle: 'Valid listing' },
  { listing_id: 'listing-2', listingTitle: 'Legacy valid listing' },
])

assert.equal(rows.length, 2)
assert.equal(findPrivateListingById(rows, 'listing-1')?.listingTitle, 'Valid listing')
assert.equal(findPrivateListingById(rows, 'listing-2')?.listingTitle, 'Legacy valid listing')
assert.equal(findPrivateListingById([null], 'listing-1'), null)
assert.equal(findPrivateListingById(rows, ''), null)
assert.equal(getPrivateListingRecordId({ listingId: 'listing-3' }), 'listing-3')
assert.equal(normalizePrivateListingRecord({ listing_id: 'listing-4' })?.id, 'listing-4')

console.log('Private listing record integrity checks passed.')
