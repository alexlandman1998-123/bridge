import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createPrivatePropertyClient,
  createPrivatePropertyToken,
} from '../server/services/privatePropertyClient.js'
import {
  createPrivatePropertyArch9ListingPreview,
  createPrivatePropertySandboxFixture,
} from '../server/services/privatePropertyListingPreviewService.js'
import {
  createPrivatePropertyListingPlan,
} from '../server/services/privatePropertyListingMapper.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const fixture = createPrivatePropertySandboxFixture('rental-residential')
const preview = createPrivatePropertyArch9ListingPreview({
  ...fixture,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: {
    ...fixture.options,
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    agentIds: 'ARCH9-SANDBOX-USER-1',
    suburbId: '12345',
  },
})

assert.equal(preview.status, 'PREVIEW_READY')
assert.match(preview.listingXml, /<ListingImport>/)
assert.doesNotMatch(preview.listingXml, /<UpdateListing/)

const calls = []
const client = createPrivatePropertyClient({
  baseUrl: 'https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx',
  username: 'Arch9User',
  password: 'secret',
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options })
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
          <soap:Body>
            <UpdateListingResponse xmlns="http://tempuri.org/">
              <UpdateListingResult>Queued listing reference PP-ARCH9-001</UpdateListingResult>
            </UpdateListingResponse>
          </soap:Body>
        </soap:Envelope>`,
    }
  },
  tokenFactory: (input) => createPrivatePropertyToken({
    ...input,
    uid: 'phase4uid',
    stampTime: '2026-08-24T08:00:00Z',
    expires: '2026-08-24T08:30:00Z',
  }),
})

const response = await client.updateListing(preview.listingXml)
assert.equal(response.ok, true)
assert.equal(response.summary.method, 'UpdateListing')
assert.equal(response.summary.resultText, 'Queued listing reference PP-ARCH9-001')
assert.equal(calls.length, 1)
assert.equal(calls[0].options.method, 'POST')
assert.equal(calls[0].options.headers.SOAPAction, '"http://tempuri.org/UpdateListing"')
assert.match(calls[0].options.body, /<UpdateListing xmlns="http:\/\/tempuri\.org\/">/)
assert.match(calls[0].options.body, /<ListingImport>/)
assert.match(calls[0].options.body, /<BranchId>CA167B18-C6DC-49AD-B018-2B72B187918F<\/BranchId>/)
assert.match(calls[0].options.body, /<AgentId>ARCH9-SANDBOX-USER-1<\/AgentId>/)
assert.match(calls[0].options.body, /<Token>/)
assert.match(calls[0].options.body, /<UserName>Arch9User<\/UserName>/)
assert.match(calls[0].options.body, /<UID>phase4uid<\/UID>/)
assert.doesNotMatch(calls[0].options.body, /secret/)

const auctionPlan = createPrivatePropertyListingPlan({
  listing: {
    id: 'private-property-auction-1',
    listing_status: 'active',
    listing_reference: 'PP-AUCTION-001',
    address_line_1: '18 Auction Road',
    streetNumber: '18',
    streetName: 'Auction Road',
    suburb: 'Sandton',
    city: 'Johannesburg',
    province: 'Gauteng',
    property_type: 'smallholding',
  },
  publication: {
    title: 'Auction smallholding',
    listing_type: 'Sale',
    property_type: 'smallholding',
    asking_price: 3500000,
    bedrooms: 3,
    bathrooms: 2,
    garages: 2,
    description: 'A controlled auction listing prepared for Private Property.',
    features: ['on_auction'],
  },
  media: [
    { media_type: 'image', file_url: 'https://cdn.example.test/one.jpg' },
    { media_type: 'image', file_url: 'https://cdn.example.test/two.jpg' },
    { media_type: 'image', file_url: 'https://cdn.example.test/three.jpg' },
  ],
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: {
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    propertyId: 'PP-AUCTION-001',
    listingDate: '2026-08-25',
    expiryDate: '2026-12-31',
  },
})

assert.equal(auctionPlan.payload.mandateType, 'AuctionOnly')
assert.match(auctionPlan.listingXml, /<MandateType>AuctionOnly<\/MandateType>/)

assert.throws(() => client.updateListing(''), /ListingImport XML is required/)
assert.throws(() => client.updateListing('<NotListingImport />'), /must include <ListingImport>/)

const scriptSource = read('scripts/private-property-publish-listing.mjs')
assert.match(scriptSource, /--apply/)
assert.match(scriptSource, /client\.updateListing/)
assert.match(scriptSource, /privatePropertyApiCalled: false/)
assert.match(scriptSource, /privatePropertyApiCalled = true/)
assert.doesNotMatch(scriptSource, /requestBody/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:publish-listing'], 'node scripts/private-property-publish-listing.mjs')
assert.equal(packageJson.scripts['test:private-property-publish-listing'], 'node scripts/private-property-publish-listing.test.mjs')

console.log('Private Property phase 4 publish listing contract passed')
