import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createPrivatePropertyClient,
  createPrivatePropertyToken,
  extractPrivatePropertyXmlBlocks,
} from '../server/services/privatePropertyClient.js'
import {
  parsePrivatePropertyActiveListings,
  parsePrivatePropertyListingEvents,
  parsePrivatePropertyModelRows,
} from './private-property-cli-utils.mjs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const calls = []
const client = createPrivatePropertyClient({
  username: 'Arch9User',
  password: 'secret',
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options })
    const body = String(options.body || '')
    const method = body.match(/<soap12:Body><([^ >]+)/)?.[1] || 'Unknown'
    const results = {
      GetProvinces: '<GetProvincesResult><ProvinceModel><Id>1</Id><CountryId>1</CountryId><Name>Gauteng</Name></ProvinceModel></GetProvincesResult>',
      GetCities: '<GetCitiesResult><CityModel><Id>1</Id><ProvinceId>1</ProvinceId><Name>Pretoria</Name></CityModel></GetCitiesResult>',
      GetSuburbs: '<GetSuburbsResult><SuburbModel><Id>140</Id><CityId>1</CityId><Name>Garsfontein</Name></SuburbModel></GetSuburbsResult>',
      GetListingStatus: '<GetListingStatusResult>For Sale</GetListingStatusResult>',
      GetListingStatusVerbose: '<GetListingStatusVerboseResult>For Sale</GetListingStatusVerboseResult>',
      GetReferenceNumberByListing: '<GetReferenceNumberByListingResult>T2870287</GetReferenceNumberByListingResult>',
      GetActiveListings: '<GetActiveListingsResult><ActiveListing><ListingType>Sale Listing</ListingType><PrivatePropertyRef>T2870287</PrivatePropertyRef><UniqueId>PRV-202608201031-U8YM</UniqueId></ActiveListing></GetActiveListingsResult>',
      ListingStatusUpdate: '<ListingStatusUpdateResult>Successful</ListingStatusUpdateResult>',
      GetListingEventFeedByBranch: '<GetListingEventFeedByBranchResult><ContinuationKey>cursor-2</ContinuationKey><ListingEventFeedData><ListingFeedEventType>Activated</ListingFeedEventType><PropertyId>PRV-202608201031-U8YM</PropertyId><PrivatePropertyRef>T2870287</PrivatePropertyRef><EventDescription>Activated as T2870287</EventDescription></ListingEventFeedData></GetListingEventFeedByBranchResult>',
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope><soap12:Body><${method}Response xmlns="http://tempuri.org/">${results[method] || ''}</${method}Response></soap12:Body></soap12:Envelope>`,
    }
  },
  tokenFactory: (input) => createPrivatePropertyToken({
    ...input,
    uid: 'phase5uid',
    stampTime: '2026-08-24T10:00:00+02:00',
    expires: '2026-08-24T10:30:00+02:00',
  }),
})

await client.getProvinces({ countryId: 1 })
await client.getCities({ provinceId: 1 })
await client.getSuburbs({ cityId: 1 })
await client.getListingStatus({ branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', propertyId: 'PRV-202608201031-U8YM' })
await client.getListingStatusVerbose({ branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', propertyId: 'PRV-202608201031-U8YM' })
await client.getReferenceNumberByListing({ branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', uniqueListingId: 'PRV-202608201031-U8YM', listingType: 'Sale' })
await client.getActiveListings({ branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F' })
await client.listingStatusUpdate({ branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', propertyId: 'PRV-202608201031-U8YM', listingType: 'Sale', propertyStatus: 'ForSale' })
await client.getListingEventFeedByBranch({ branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', continuationKey: '0' })

assert.match(calls[0].options.body, /<GetProvinces xmlns="http:\/\/tempuri\.org\/"><CountryId>1<\/CountryId>/)
assert.match(calls[1].options.body, /<GetCities xmlns="http:\/\/tempuri\.org\/"><ProvinceID>1<\/ProvinceID>/)
assert.match(calls[2].options.body, /<GetSuburbs xmlns="http:\/\/tempuri\.org\/"><CityID>1<\/CityID>/)
assert.match(calls[3].options.body, /<GetListingStatus xmlns="http:\/\/tempuri\.org\/"><BranchId>CA167B18-C6DC-49AD-B018-2B72B187918F<\/BranchId><PropertyId>PRV-202608201031-U8YM<\/PropertyId>/)
assert.match(calls[5].options.body, /<GetReferenceNumberByListing xmlns="http:\/\/tempuri\.org\/"><BranchId>CA167B18-C6DC-49AD-B018-2B72B187918F<\/BranchId><UniqueListingID>PRV-202608201031-U8YM<\/UniqueListingID><listingType>Sale<\/listingType>/)
assert.match(calls[7].options.body, /<ListingStatusUpdate xmlns="http:\/\/tempuri\.org\/"><BranchId>CA167B18-C6DC-49AD-B018-2B72B187918F<\/BranchId><PropertyId>PRV-202608201031-U8YM<\/PropertyId><ListingType>Sale<\/ListingType><PropertyStatus>ForSale<\/PropertyStatus>/)
for (const call of calls) {
  assert.match(call.options.body, /<UserName>Arch9User<\/UserName>/)
  assert.doesNotMatch(call.options.body, /secret/)
}

const provinceRows = parsePrivatePropertyModelRows('<ProvinceModel><Id>1</Id><CountryId>1</CountryId><Name>Gauteng</Name></ProvinceModel>', 'ProvinceModel')
assert.deepEqual(provinceRows, [{ id: 1, name: 'Gauteng', countryId: 1, provinceId: null, cityId: null }])
const activeListings = parsePrivatePropertyActiveListings('<ActiveListing><ListingType>Sale Listing</ListingType><PrivatePropertyRef>T2870287</PrivatePropertyRef><UniqueId>PRV-202608201031-U8YM</UniqueId></ActiveListing>')
assert.deepEqual(activeListings, [{ listingType: 'Sale Listing', privatePropertyRef: 'T2870287', uniqueId: 'PRV-202608201031-U8YM' }])
const events = parsePrivatePropertyListingEvents('<LisitngEventFeedData><TimeStamp>2026-08-24T07:56:09.6449114Z</TimeStamp><ListingFeedRef>PRV-202608201031-U8YM</ListingFeedRef><ListingFeedEventType>Activated</ListingFeedEventType><EventDescription>T2870287</EventDescription><ListingFeedEventStatus>Active</ListingFeedEventStatus></LisitngEventFeedData>')
assert.equal(events[0].listingFeedEventType, 'Activated')
assert.equal(events[0].propertyId, 'PRV-202608201031-U8YM')
assert.equal(events[0].privatePropertyRef, 'T2870287')
assert.equal(events[0].eventStatus, 'Active')
assert.equal(extractPrivatePropertyXmlBlocks('<a><b>1</b><b>2</b></a>', 'b').length, 2)

const statusUpdateSource = read('scripts/private-property-status-update.mjs')
assert.match(statusUpdateSource, /--apply/)
assert.match(statusUpdateSource, /listingStatusUpdate/)
assert.match(statusUpdateSource, /listingStatusChanged/)
assert.match(statusUpdateSource, /DRY_RUN/)
assert.doesNotMatch(statusUpdateSource, /requestBody/)

for (const script of [
  'scripts/private-property-find-suburb.mjs',
  'scripts/private-property-listing-status.mjs',
  'scripts/private-property-active-listings.mjs',
  'scripts/private-property-event-feed.mjs',
]) {
  const source = read(script)
  assert.match(source, /writePrivatePropertyReport/)
  assert.doesNotMatch(source, /requestBody/)
}

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:find-suburb'], 'node scripts/private-property-find-suburb.mjs')
assert.equal(packageJson.scripts['private-property:listing-status'], 'node scripts/private-property-listing-status.mjs')
assert.equal(packageJson.scripts['private-property:active-listings'], 'node scripts/private-property-active-listings.mjs')
assert.equal(packageJson.scripts['private-property:event-feed'], 'node scripts/private-property-event-feed.mjs')
assert.equal(packageJson.scripts['private-property:status-update'], 'node scripts/private-property-status-update.mjs')
assert.equal(packageJson.scripts['test:private-property-phase5'], 'node scripts/private-property-phase5-ops.test.mjs')

console.log('Private Property phase 5 operations contract passed')
