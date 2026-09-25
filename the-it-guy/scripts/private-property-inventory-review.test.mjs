import assert from 'node:assert/strict'
import { createPrivatePropertyInventoryReview, createPrivatePropertyReconciliationReport } from '../server/services/privatePropertyReconciliationReportService.js'
import { normalizePrivatePropertyPublicUrl } from '../server/services/privatePropertyListingSyncService.js'
import { parsePrivatePropertyActiveListings } from '../server/services/privatePropertyPostSubmitMonitorService.js'

const review = createPrivatePropertyInventoryReview({
  activeListings: [
    { uniqueId: 'known-1', privatePropertyRef: 'T100', listingType: 'Sale' },
    { uniqueId: 'ARCH9-002', privatePropertyRef: 'T200', listingType: 'Sale' },
    { uniqueId: 'external-3', privatePropertyRef: 'T300', listingType: 'Rental' },
  ],
  syncs: [{ property_id: 'known-1' }],
  localListings: [{ id: 'listing-2', title: 'Second listing', listing_reference: 'ARCH9-002' }],
})

assert.equal(review.mode, 'REVIEW_ONLY')
assert.equal(review.summary.unmatchedCount, 2)
assert.equal(review.summary.candidateCount, 1)
assert.deepEqual(review.unmatched.map((item) => item.propertyId), ['ARCH9-002', 'external-3'])
assert.equal(review.unmatched[0].candidate.listingId, 'listing-2')
assert.equal(review.unmatched[1].candidate, null)

const secondaryReference = createPrivatePropertyInventoryReview({
  activeListings: [{ uniqueId: 'portal-123', privatePropertyRef: 'ARCH9-002' }],
  localListings: [{ id: 'listing-2', listing_reference: 'ARCH9-002' }],
})
assert.equal(secondaryReference.unmatched[0].candidate.listingId, 'listing-2')

const ambiguous = createPrivatePropertyInventoryReview({
  activeListings: [{ uniqueId: 'unlinked', privatePropertyRef: 'T400' }],
  localListings: [
    { id: 'a', private_property_reference: 'T400' },
    { id: 'b', private_property_reference: 'T400' },
  ],
})
assert.equal(ambiguous.unmatched[0].candidate, null)
assert.match(ambiguous.unmatched[0].reason, /multiple/)

assert.equal(normalizePrivatePropertyPublicUrl('https://www.privateproperty.co.za/for-sale/example/T123'), 'https://www.privateproperty.co.za/for-sale/example/T123')
assert.equal(normalizePrivatePropertyPublicUrl('https://privateproperty.co.za.evil.example/T123'), '')
assert.deepEqual(parsePrivatePropertyActiveListings('<ActiveListing><UniqueId>ARCH9-002</UniqueId><ListingUrl>https://www.privateproperty.co.za/for-sale/example/T200</ListingUrl></ActiveListing>')[0].listingUrl, 'https://www.privateproperty.co.za/for-sale/example/T200')

class FakeQuery {
  constructor(rows) { this.rows = rows; this.filters = []; this.max = Infinity }
  select() { return this }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this }
  in(column, values) { this.filters.push((row) => values.includes(row[column])); return this }
  limit(value) { this.max = value; return this }
  then(resolve, reject) { return Promise.resolve({ data: this.rows.filter((row) => this.filters.every((filter) => filter(row))).slice(0, this.max), error: null }).then(resolve, reject) }
}

const tables = {
  private_property_agency_configs: [{ id: 'config-1', organisation_id: 'org-1', environment: 'production', enabled: true, status: 'active', go_live_approved_at: '2026-09-01', branch_guid: 'branch-1', username_secret_name: 'PP_USER', password_secret_name: 'PP_PASS' }],
  private_listings: [{ id: 'listing-2', organisation_id: 'org-1', title: 'Second listing', listing_reference: 'ARCH9-002' }],
  private_property_listing_syncs: [{ private_listing_id: 'listing-outside-page', environment: 'production', branch_guid: 'branch-1', property_id: 'known-1', external_status: 'active', is_on_portal: true }],
  private_property_webhook_events: [],
  private_property_showday_syncs: [],
}
const report = await createPrivatePropertyReconciliationReport({
  client: { from: (table) => new FakeQuery(tables[table] || []) },
  organisationId: 'org-1',
  secrets: { PP_USER: 'user', PP_PASS: 'password' },
  createPrivateProperty: () => ({
    getActiveListings: async () => ({ data: '<ActiveListing><UniqueId>known-1</UniqueId><PrivatePropertyRef>T100</PrivatePropertyRef></ActiveListing><ActiveListing><UniqueId>ARCH9-002</UniqueId><PrivatePropertyRef>T200</PrivatePropertyRef></ActiveListing>' }),
    getListingStatus: async () => ({ data: '<GetListingStatusResult>Active</GetListingStatusResult>' }),
  }),
})
assert.equal(report.status, 'ATTENTION_REQUIRED')
assert.equal(report.summary.unlinkedActivePortalListings, 1)
assert.equal(report.unmatchedPortalListings[0].candidate.listingId, 'listing-2')
assert.equal(report.safety.databaseWritten, false)

console.log('Private Property inventory review checks passed')
