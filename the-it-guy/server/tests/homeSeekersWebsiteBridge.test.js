import test from 'node:test'
import assert from 'node:assert/strict'
import { createHomeSeekersLeadCaptureResponse } from '../services/homeSeekersLeadCaptureApi.js'
import { getHomeSeekersPublishedListings, getHomeSeekersWebsiteConnection, HOME_SEEKERS_ORGANISATION_ID } from '../services/homeSeekersWebsiteBridge.js'

const SITE_ID = 'c2fcb2e4-23c1-4302-b490-7332f5075669'
const REVISION_ID = '484c8537-9996-40e8-abc9-651d9058a10c'
const LISTING_ID = 'ffec99be-27f8-4bba-ae3f-76b37b4bd9c1'

test('Home Seekers enquiries follow the active custom domain after connection, including retired preview aliases', async () => {
  for (const domains of [
    [{ hostname: 'www.homeseeker.example', domain_kind: 'custom', is_primary: true }, { hostname: 'home-seekers-website-alpha.vercel.app', domain_kind: 'preview' }],
    [{ hostname: 'www.homeseeker.example', domain_kind: 'custom', is_primary: true }],
  ]) {
    const client = { from(table) { return {
      select() { return this }, eq() { return this },
      async maybeSingle() { return { data: { id: SITE_ID, published_revision_id: REVISION_ID }, error: null } },
      then(resolve) { assert.equal(table, 'website_domains'); resolve({ data: domains, error: null }) },
    } } }
    assert.equal((await getHomeSeekersWebsiteConnection(client)).hostname, 'www.homeseeker.example')
  }
})

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
      ['general_enquiry', '/', 'home', null],
      ['general_enquiry', '/contact', 'contact', null],
      ['general_enquiry', '/about/', 'about', null],
      ['valuation_request', '/selling', 'valuation', null],
      ['property_enquiry', `/properties/${LISTING_ID}`, null, LISTING_ID],
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
          ...(type === 'general_enquiry' ? { leadIntent: 'sell' } : {}),
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
      assert.equal(captured.params.p_attribution.pagePath, pathname)
      assert.equal(captured.params.p_attribution.leadIntent, type === 'property_enquiry' ? undefined : 'sell')
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

test('clean buying and renting enquiries retain their CRM intent', async () => {
  const previous = process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
  process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = 'a'.repeat(64)
  try {
    for (const [path, intent] of [['/buying', 'buy'], ['/renting', 'rent']]) {
      let attribution
      const result = await createHomeSeekersLeadCaptureResponse({
        headers: { host: 'homeseeker.co.za' },
        body: { type: 'general_enquiry', name: 'Fixture Visitor', email: 'visitor@example.test', privacyAccepted: true, pageUrl: `https://homeseeker.co.za${path}`, idempotencyKey: 'fixture-enquiry-123456' },
        getConnection: async () => ({ site: { id: SITE_ID, published_revision_id: REVISION_ID }, hostname: 'homeseeker.co.za', client: {
          from() { return pageQuery([], 'home') },
          async rpc(_name, params) { attribution = params.p_attribution; return { data: { accepted: true } } },
        } }),
      })
      assert.equal(result.status, 201)
      assert.equal(attribution.leadIntent, intent)
    }
    const rejected = await createHomeSeekersLeadCaptureResponse({
      headers: { host: 'homeseeker.co.za' },
      body: { type: 'general_enquiry', name: 'Fixture Visitor', email: 'visitor@example.test', privacyAccepted: true, pageUrl: 'https://homeseeker.co.za/agency/dashboard', idempotencyKey: 'fixture-enquiry-123456' },
      getConnection: () => assert.fail('Private paths must fail before database access'),
    })
    assert.equal(rejected.status, 400)
  } finally {
    if (previous === undefined) delete process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
    else process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = previous
  }
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

test('CRM publication snapshots control sales, rentals, updates and withdrawals without exposing private fields', async () => {
  const rentalId = '4615603e-7299-43df-9d94-b4f7b67460bc'
  const channel = (id, overrides = {}) => ({
    listing_id: id, website_site_id: SITE_ID, status: 'published',
    publication_json: { title: 'Published snapshot', listing_type: 'Sale', asking_price: 2500000, seller_email: 'private@example.test' },
    media_json: [
      { media_type: 'image', file_url: 'https://example.test/second.jpg', sort_order: 2 },
      { media_type: 'image', file_url: 'https://example.test/cover.jpg', sort_order: 0 },
      { media_type: 'image', file_url: 'blob:private-upload', sort_order: 1 },
    ], ...overrides,
  })
  const projection = (id, overrides = {}) => ({
    listing_id: id, status: 'Published', title: 'Unsynchronised CRM edit',
    private_listings: { organisation_id: HOME_SEEKERS_ORGANISATION_ID }, ...overrides,
  })
  const rows = {
    website_listing_publications: [
      channel(LISTING_ID),
      channel(rentalId, { publication_json: { title: 'Rental snapshot', listing_type: 'Rental', asking_price: 12000 } }),
      channel('unpublished', { status: 'unpublished' }),
      channel('draft'), channel('other-org'), channel('other-site', { website_site_id: 'another-site' }),
    ],
    listing_publication_data: [
      projection(LISTING_ID), projection(rentalId), projection('unpublished'),
      projection('draft', { status: 'Draft' }),
      projection('other-org', { private_listings: { organisation_id: 'another-organisation' } }),
      projection('other-site'),
    ],
  }
  const client = { from(table) {
    const predicates = []
    return {
      select() { return this }, order() { return this }, limit() { return this },
      eq(field, value) { predicates.push((row) => field.split('.').reduce((item, key) => item?.[key], row) === value); return this },
      in(field, values) { predicates.push((row) => values.includes(row[field])); return this },
      then(resolve) { resolve({ data: rows[table].filter((row) => predicates.every((predicate) => predicate(row))), error: null }) },
    }
  } }
  const connection = { client, site: { id: SITE_ID } }
  let feed = await getHomeSeekersPublishedListings(connection)
  assert.deepEqual(feed.map((listing) => [listing.id, listing.transactionType, listing.price]), [[LISTING_ID, 'sale', 2500000], [rentalId, 'rental', 12000]])
  assert.equal(feed[0].title, 'Published snapshot', 'editing CRM details alone does not overwrite the approved snapshot')
  assert.deepEqual(feed[0].images, ['https://example.test/cover.jpg', 'https://example.test/second.jpg'])
  assert.equal(feed[0].seller_email, undefined)
  assert.equal(feed[0].listingStatus, 'active', 'Older snapshots keep their For sale label')
  rows.website_listing_publications[0].publication_json = { title: 'Updated approved snapshot', listing_type: 'Sale', asking_price: 2400000 }
  feed = await getHomeSeekersPublishedListings(connection)
  assert.equal(feed[0].title, 'Updated approved snapshot')
  assert.equal(feed[0].price, 2400000)
  for (const status of ['under_offer', 'sold']) {
    rows.website_listing_publications[0].publication_json.listing_status = status
    feed = await getHomeSeekersPublishedListings(connection)
    assert.equal(feed[0].listingStatus, status, 'The public feed carries the approved sale status')
  }
  rows.website_listing_publications[0].status = 'unpublished'
  feed = await getHomeSeekersPublishedListings(connection)
  assert.deepEqual(feed.map((listing) => listing.id), [rentalId])
  assert.ok(rows.listing_publication_data.find((listing) => listing.listing_id === LISTING_ID), 'withdrawal retains the CRM listing')
  rows.listing_publication_data.find((listing) => listing.listing_id === rentalId).status = 'Draft'
  assert.deepEqual(await getHomeSeekersPublishedListings(connection), [])
})
