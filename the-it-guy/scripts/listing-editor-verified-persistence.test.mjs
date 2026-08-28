import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { syncSellerLeadForLiveListing } from '../server/services/sellerListingLiveSyncService.js'

const listingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const listingServiceSource = readFileSync(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const property24SyncSource = readFileSync(new URL('../server/services/property24ListingSyncService.js', import.meta.url), 'utf8')
const privatePropertySyncSource = readFileSync(new URL('../server/services/privatePropertyListingSyncService.js', import.meta.url), 'utf8')
const sellerLiveSyncSource = readFileSync(new URL('../server/services/sellerListingLiveSyncService.js', import.meta.url), 'utf8')

assert.doesNotMatch(listingsSource, /quick listing image upload failed; keeping local preview/)
assert.match(listingsSource, /uploaded without a persistent URL/)
assert.match(listingsSource, /const distributionSync = await syncPrivateListingDistributionData/)
assert.match(listingsSource, /Your edits were not cleared; please retry/)

assert.doesNotMatch(detailSource, /listing distribution sync skipped/)
assert.match(detailSource, /return \{ ok: false, error \}/)
assert.match(detailSource, /clearStoredMarketingDraft\(hydratedMarketingListingIdRef\.current\)/)
const remoteSaveStart = detailSource.indexOf('const savedListing = await updatePrivateListing')
const distributionGuard = detailSource.indexOf("if (distributionSync?.skipped)", remoteSaveStart)
const remoteDraftClear = detailSource.indexOf('clearStoredMarketingDraft(hydratedMarketingListingIdRef.current)', distributionGuard)
assert.ok(
  remoteSaveStart >= 0 && distributionGuard > remoteSaveStart && remoteDraftClear > distributionGuard,
  'the marketing draft must only be cleared after distribution persistence succeeds',
)

assert.ok(
  listingServiceSource.indexOf(".insert(mediaRows).select('id, media_type, file_url')") <
    listingServiceSource.indexOf(".delete().in('id', previousMediaIds)"),
  'new media must persist before old media is deleted',
)
assert.match(listingServiceSource, /Listing description did not persist/)
assert.match(listingServiceSource, /Listing selling points did not persist/)
assert.match(listingServiceSource, /Listing amenities did not persist/)
assert.match(listingServiceSource, /One or more listing images did not persist/)
assert.match(listingsSource, /The listing fields did not persist/)
assert.match(detailSource, /The listing fields did not persist/)

assert.match(property24SyncSource, /syncSellerLeadForLiveListing/)
assert.match(privatePropertySyncSource, /syncSellerLeadForLiveListing/)
assert.match(sellerLiveSyncSource, /listing_status: 'active'/)
assert.match(sellerLiveSyncSource, /listing_visibility: 'active_market'/)
assert.match(sellerLiveSyncSource, /stage: 'Listing Live'/)
assert.match(sellerLiveSyncSource, /status: 'Live'/)

class FakeQuery {
  constructor(table, operations) {
    this.table = table
    this.operations = operations
    this.filters = []
    this.patch = null
  }

  select() { return this }
  eq(column, value) { this.filters.push({ column, value }); return this }
  update(patch) { this.patch = patch; this.operations.push({ table: this.table, patch }); return this }
  single() {
    if (this.table !== 'private_listings') return Promise.resolve({ data: null, error: null })
    if (this.patch) return Promise.resolve({ data: { id: 'listing-1', ...this.patch }, error: null })
    return Promise.resolve({
      data: {
        id: 'listing-1',
        organisation_id: 'org-1',
        seller_lead_id: 'lead-1',
        originating_crm_lead_id: null,
      },
      error: null,
    })
  }

  then(resolve) {
    if (this.table === 'leads' && this.patch) {
      resolve({ data: [{ lead_id: this.filters.find((filter) => filter.column === 'lead_id')?.value }], error: null })
      return
    }
    resolve({ data: [], error: null })
  }
}

const operations = []
const sellerJourneyResult = await syncSellerLeadForLiveListing({
  client: { from: (table) => new FakeQuery(table, operations) },
  listingId: 'listing-1',
  source: 'property24',
})
assert.equal(sellerJourneyResult.listing.listing_status, 'active')
assert.equal(sellerJourneyResult.updatedLeadCount, 1)
assert.ok(operations.some(({ table, patch }) => table === 'private_listings' && patch.listing_visibility === 'active_market'))
assert.ok(operations.some(({ table, patch }) => table === 'leads' && patch.stage === 'Listing Live' && patch.status === 'Live'))

console.log('Listing editor verified persistence and seller live synchronization contract passed')
