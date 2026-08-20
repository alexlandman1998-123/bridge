import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const listingDetail = read('src/pages/AgentListingDetail.jsx')

assert.match(listingDetail, /Property24 Syndication/)
assert.match(listingDetail, /previewProperty24Listing/)
assert.match(listingDetail, /publishProperty24Listing/)
assert.match(listingDetail, /refreshProperty24ListingStatus/)
assert.match(listingDetail, /updateProperty24ListingStatus/)
assert.match(listingDetail, /pullProperty24ListingLeads/)
assert.match(listingDetail, /Refresh Status/)
assert.match(listingDetail, /Update Status/)
assert.match(listingDetail, /Check Leads/)
assert.match(listingDetail, /Import Leads/)
assert.match(listingDetail, /PROPERTY24_STATUS_UPDATE_OPTIONS/)
assert.match(listingDetail, /refresh: 'true'/)
assert.match(listingDetail, /applyLeads/)
assert.match(listingDetail, /PROPERTY24_LISTING_API_BASE_PATH/)
assert.match(listingDetail, /supabase\.auth\.getSession/)
assert.match(listingDetail, /Authorization: `Bearer \$\{accessToken\}`/)
assert.match(listingDetail, /getProperty24ApiMessage/)
assert.match(listingDetail, /property24PreviewCounts/)
assert.match(listingDetail, /property24LeadImportCounts/)
assert.match(listingDetail, /property24StatusCheck/)
assert.match(listingDetail, /Published to Property24/)
assert.doesNotMatch(listingDetail, /PROPERTY24_API_INTERNAL_TOKEN/)

const apiSource = read('server/property24/api.js')
assert.match(apiSource, /canUseBrowserProperty24ListingAuth/)
assert.match(apiSource, /authenticateBrowserProperty24ListingRequest/)
assert.match(apiSource, /Only the assigned agent or an agency admin can publish this listing to Property24/)
assert.match(apiSource, /\['previewListing', 'publishListing', 'listingStatus', 'updateListingStatus', 'listingLeads'\]/)
assert.match(apiSource, /recordProperty24ListingSync/)

console.log('Property24 listing publish UI contract passed')
