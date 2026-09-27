import test from 'node:test'
import assert from 'node:assert/strict'
import { createHomeSeekersLeadCaptureResponse } from '../services/homeSeekersLeadCaptureApi.js'
import { getHomeSeekersPublishedListings, HOME_SEEKERS_ORGANISATION_ID } from '../services/homeSeekersWebsiteBridge.js'

const SITE_ID = 'c2fcb2e4-23c1-4302-b490-7332f5075669'
const REVISION_ID = '484c8537-9996-40e8-abc9-651d9058a10c'
const LISTING_ID = 'ffec99be-27f8-4bba-ae3f-76b37b4bd9c1'

function pageQuery(calls, pageKind) {
  return {
    select() { return this },
    eq(field, value) { calls.push([field, value]); return this },
    async maybeSingle() { return { data: { id: `page-${pageKind}` }, error: null } },
  }
}

test('Home Seekers enquiries use the published CRM page and registered domain', async () => {
  const previous = process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
  process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = 'a'.repeat(64)
  try {
    for (const [type, pathname, expectedKind, listingId] of [
      ['general_enquiry', '/demo/homeseekers/contact', 'contact', null],
      ['valuation_request', '/demo/homeseekers/selling', 'valuation', null],
      ['property_enquiry', `/demo/homeseekers/buying/${LISTING_ID}`, null, LISTING_ID],
    ]) {
      const calls = []
      let captured
      const client = {
        from(table) { assert.equal(table, 'website_pages'); return pageQuery(calls, expectedKind) },
        async rpc(name, params) { captured = { name, params }; return { data: { accepted: true }, error: null } },
      }
      const result = await createHomeSeekersLeadCaptureResponse({
        headers: { host: 'app.arch9.co.za', 'x-forwarded-for': '198.51.100.1' },
        body: {
          type, name: 'Alex Example', email: 'alex@example.com', privacyAccepted: true,
          pageUrl: `https://app.arch9.co.za${pathname}`, idempotencyKey: 'valid-key-1234567890',
          ...(listingId ? { listingId } : {}),
        },
        getConnection: async () => ({ client, site: { id: SITE_ID, published_revision_id: REVISION_ID }, hostname: 'home-seekers-website-alpha.vercel.app' }),
      })
      assert.equal(result.status, 201)
      assert.equal(captured.name, 'website_capture_lead_submission')
      assert.equal(captured.params.p_hostname, 'home-seekers-website-alpha.vercel.app')
      assert.equal(captured.params.p_page_id, expectedKind ? `page-${expectedKind}` : null)
      assert.equal(captured.params.p_listing_id, listingId)
      if (expectedKind) assert.deepEqual(calls, [
        ['website_site_id', SITE_ID], ['revision_id', REVISION_ID], ['page_kind', expectedKind],
      ])
      else assert.deepEqual(calls, [])
    }
  } finally {
    if (previous === undefined) delete process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
    else process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = previous
  }
})

test('Home Seekers lead endpoint rejects pages on another host before CRM access', async () => {
  const result = await createHomeSeekersLeadCaptureResponse({
    headers: { host: 'app.arch9.co.za' },
    body: { type: 'general_enquiry', name: 'Alex Example', email: 'alex@example.com', privacyAccepted: true, pageUrl: 'https://other.example/demo/homeseekers', idempotencyKey: 'valid-key-1234567890' },
    getConnection: () => { throw new Error('Must not access CRM') },
  })
  assert.equal(result.status, 400)
})

test('public property feed includes only Home Seekers listings approved for this website', async () => {
  const channels = [
    { listing_id: LISTING_ID, publication_json: { title: 'Approved home', listing_type: 'Sale', suburb: 'Pretoria', asking_price: 2500000 }, media_json: [{ media_type: 'image', file_url: 'https://example.com/home.jpg' }] },
    { listing_id: '4d38ec70-3cff-4b8b-b590-1238ec86be89', publication_json: { title: 'Other home', listing_type: 'Sale' }, media_json: [] },
  ]
  const calls = []
  const chain = (table) => ({
    select(value) { calls.push([table, 'select', value]); return this },
    eq(field, value) { calls.push([table, field, value]); return this },
    in() { return this }, order() { return this }, limit() { return this },
    then(resolve) { resolve(table === 'website_listing_publications' ? { data: channels, error: null } : { data: [{ listing_id: LISTING_ID }], error: null }) },
  })
  const listings = await getHomeSeekersPublishedListings({ client: { from: chain }, site: { id: SITE_ID } })
  assert.equal(listings.length, 1)
  assert.equal(listings[0].id, LISTING_ID)
  assert.equal(listings[0].image, 'https://example.com/home.jpg')
  assert.ok(calls.some(([table, field, value]) => table === 'listing_publication_data' && field === 'private_listings.organisation_id' && value === HOME_SEEKERS_ORGANISATION_ID))
})
