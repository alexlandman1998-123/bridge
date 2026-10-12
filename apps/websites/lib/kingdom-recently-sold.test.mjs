import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('./kingdom-recently-sold.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const exported = {}
new Function('require', 'exports', javascript)(() => ({ getServerSupabase() { throw new Error('Unexpected production connection') } }), exported)
const { getKingdomRecentlySold, KINGDOM_SOLD_SITE_ID, KINGDOM_SOLD_ORGANISATION_ID } = exported
const isell = '6cb5b65b-51cb-4fba-aef4-75b6201f9c21'
process.env.SUPABASE_URL = 'https://project.supabase.co'
const site = { id: KINGDOM_SOLD_SITE_ID, organisationId: KINGDOM_SOLD_ORGANISATION_ID }
const listing = (id, organisation_id, extra = {}) => ({ id, organisation_id, listing_status: 'sold', listing_category: 'private_sale', is_demo_data: false, updated_at: '2026-10-12', title: 'Family home', suburb: 'Pretoria', asking_price: 2000000, ...extra })
const imageUrl = (id, org) => `https://project.supabase.co/storage/v1/object/public/listing-media/organisations/${org}/websites/${site.id}/listings/${id}/photo.jpg`

function database({ rows = [], grant = true, errorTable } = {}) {
  const tables = {
    private_listings: rows,
    listing_media: [],
    website_partner_listing_grants: [{ id: 'grant', website_site_id: site.id, source_organisation_id: isell, enabled: grant }],
    listing_publication_data: rows.map(row => ({ listing_id: row.id, asking_price: row.asking_price, parking_bays: 2 })),
    website_listing_publications: rows.filter(row => row.organisation_id === site.organisationId).map(row => ({ listing_id: row.id, website_site_id: site.id, status: 'unpublished', media_json: [{ media_type: 'image', file_url: imageUrl(row.id, row.organisation_id) }] })),
    website_partner_listing_publications: rows.filter(row => row.organisation_id === isell).map(row => ({ listing_id: row.id, website_site_id: site.id, grant_id: 'grant', status: 'unpublished', media_json: [{ media_type: 'image', file_url: imageUrl(row.id, row.organisation_id) }] })),
  }
  const signedPaths = []
  return { tables, signedPaths, supabaseUrl: 'https://project.supabase.co', storage: { from(bucket) { return {
    async createSignedUrl(path, expiresIn) { signedPaths.push({ bucket, path, expiresIn }); return { data: { signedUrl: `https://project.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=fresh-fixture` }, error: null } },
  } } }, from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`)
    let results = tables[table]
    const query = {
      select() { return query },
      limit(count) { results = results.slice(0, count); return query },
      eq(key, value) { results = results.filter(row => row[key] === value); return query },
      in(key, values) { results = results.filter(row => values.includes(row[key])); return query },
      or() { results = results.filter(row => !row.is_demo_data); return query },
      order(key, options) { results = [...results].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (options?.ascending === false ? -1 : 1)); return query },
      range(start, end) { results = results.slice(start, end + 1); return query },
      then(resolve) { return Promise.resolve({ data: results, error: table === errorTable ? { code: 'XX000' } : null }).then(resolve) },
    }
    return query
  } }
}

test('CRM Sold includes both agencies after active adverts have been unpublished', async () => {
  const db = database({ rows: [listing('own', site.organisationId), listing('partner', isell)] })
  const result = await getKingdomRecentlySold(site, () => db)
  assert.equal(result.length, 2)
  assert.deepEqual(new Set(result.map(row => row.sourceAgency)), new Set(['Kingdom Real Estate', 'I Sell Properties']))
  assert.ok(result.every(row => row.listingStatus === 'sold' && row.media.length === 1))
})

test('active, under offer, rentals, demo rows and unrelated agencies are excluded', async () => {
  const db = database({ rows: [listing('sold', site.organisationId), listing('active', isell, { listing_status: 'active' }), listing('offer', isell, { listing_status: 'under_offer' }), listing('rental', isell, { listing_category: 'rental' }), listing('demo', isell, { is_demo_data: true }), listing('other', 'other')] })
  assert.deepEqual((await getKingdomRecentlySold(site, () => db)).map(row => row.id), ['sold'])
})

test('disabled sharing excludes I Sell; another website cannot read either agency', async () => {
  const db = database({ grant: false, rows: [listing('own', site.organisationId), listing('partner', isell)] })
  assert.deepEqual((await getKingdomRecentlySold(site, () => db)).map(row => row.id), ['own'])
  assert.deepEqual(await getKingdomRecentlySold({ ...site, id: 'other-site' }), [])
  assert.deepEqual(await getKingdomRecentlySold({ ...site, organisationId: 'other-agency' }), [])
})

test('private files, signed images, wrong website copies and seller facts never reach cards', async () => {
  const db = database({ rows: [listing('own', site.organisationId, { seller_canonical_facts_json: { secret: true }, internal_listing_notes: 'Private notes' })] })
  db.tables.website_listing_publications[0].media_json = [
    { media_type: 'image', file_url: imageUrl('own', site.organisationId) },
    { media_type: 'image', file_url: `${imageUrl('own', site.organisationId)}?token=private` },
    { media_type: 'image', file_url: imageUrl('own', site.organisationId).replace(site.id, 'other-site') },
    { media_type: 'image', file_url: 'https://project.supabase.co/storage/v1/object/sign/private/file.jpg' },
    { media_type: 'document', file_url: imageUrl('own', site.organisationId) },
  ]
  const [result] = await getKingdomRecentlySold(site, () => db)
  assert.equal(result.media.length, 1)
  assert.equal(JSON.stringify(result).includes('secret'), false)
  assert.equal(JSON.stringify(result).includes('Private notes'), false)
})

test('never-advertised sold stock works without photos; explicit POA stays hidden', async () => {
  const db = database({ rows: [listing('own', site.organisationId)] })
  db.tables.website_listing_publications = []
  db.tables.listing_publication_data[0].asking_price = null
  const [result] = await getKingdomRecentlySold(site, () => db)
  assert.deepEqual(result.media, [])
  assert.equal(result.price, undefined)
})

test('more than one database page is retained and empty CRM remains empty', async () => {
  const db = database({ rows: Array.from({ length: 205 }, (_, index) => listing(String(index).padStart(3, '0'), site.organisationId)) })
  assert.equal((await getKingdomRecentlySold(site, () => db)).length, 205)
  assert.deepEqual(await getKingdomRecentlySold(site, () => database()), [])
})

test('database failures fail closed rather than display misleading results', async () => {
  await assert.rejects(getKingdomRecentlySold(site, () => database({ errorTable: 'private_listings' })))
  await assert.rejects(getKingdomRecentlySold(site, () => database({ errorTable: 'website_partner_listing_grants' })))
})


test('missing website copy uses the CRM gallery cover and refreshes expired viewing links', async () => {
  const db = database({ rows: [listing('own', site.organisationId)] })
  db.tables.website_listing_publications = []
  db.tables.listing_media = [
    { listing_id: 'own', media_type: 'image', is_cover: false, sort_order: 0, file_url: 'https://project.supabase.co/storage/v1/object/sign/documents/private-listings/own/gallery/other.jpg?token=expired' },
    { listing_id: 'own', media_type: 'image', is_cover: true, sort_order: 0, file_url: 'https://project.supabase.co/storage/v1/object/sign/documents/private-listings/own/gallery/cover.jpg?token=expired' },
  ]
  const [result] = await getKingdomRecentlySold(site, () => db)
  assert.equal(result.media.length, 1)
  assert.match(result.media[0].url, /cover.jpg\?token=fresh-fixture$/)
  assert.deepEqual(db.signedPaths, [{ bucket: 'documents', path: 'private-listings/own/gallery/cover.jpg', expiresIn: 604800 }])
})

test('CRM fallback excludes documents, other listings, foreign origins and path traversal', async () => {
  const db = database({ rows: [listing('own', site.organisationId)] })
  db.tables.website_listing_publications = []
  db.tables.listing_media = [
    { listing_id: 'own', media_type: 'image', storage_bucket: 'documents', storage_path: 'private-listings/own/documents/id.png' },
    { listing_id: 'own', media_type: 'image', storage_bucket: 'documents', storage_path: 'private-listings/other/gallery/photo.jpg' },
    { listing_id: 'own', media_type: 'image', storage_bucket: 'documents', storage_path: 'private-listings/own/gallery/../documents/id.png' },
    { listing_id: 'own', media_type: 'image', storage_bucket: 'documents', storage_path: 'private-listings/own/gallery/mandate.pdf' },
    { listing_id: 'own', media_type: 'image', file_url: 'https://foreign.test/storage/v1/object/sign/documents/private-listings/own/gallery/id.png' },
    { listing_id: 'own', media_type: 'document', storage_bucket: 'documents', storage_path: 'private-listings/own/gallery/doc.jpg' },
  ]
  assert.deepEqual((await getKingdomRecentlySold(site, () => db))[0].media, [])
  assert.deepEqual(db.signedPaths, [])
})

test('partner CRM cover requires the enabled source grant', async () => {
  for (const grant of [false, true]) {
    const db = database({ rows: [listing('partner', isell)], grant })
    db.tables.website_partner_listing_publications = []
    db.tables.listing_media = [{ listing_id: 'partner', media_type: 'image', storage_bucket: 'documents', storage_path: 'private-listings/partner/gallery/photo.jpg' }]
    const result = await getKingdomRecentlySold(site, () => db)
    assert.equal(result.length, grant ? 1 : 0)
    assert.equal(db.signedPaths.length, grant ? 1 : 0)
  }
})
