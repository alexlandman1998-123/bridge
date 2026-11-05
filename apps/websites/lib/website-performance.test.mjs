import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('./site-repository.ts', import.meta.url), 'utf8')
const part = source.slice(source.indexOf('async function getPublishedWebsiteListings('), source.indexOf('const listingsForRequest'))
const js = ts.transpileModule(part, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const reader = partner => new Function('getPublishedPartnerListings', 'mapSnapshotMedia', `${js};return getPublishedWebsiteListings`)(partner, value => value)
function emptyNative(result, onRead) {
  return { from(table) {
    assert.equal(table, 'website_listing_publications')
    const filters = []
    const query = { select() { return query }, order() { return query }, limit() { return query }, eq(key, value) { filters.push([key, value]); return query }, then(resolve, reject) {
      assert.deepEqual(filters, [['website_site_id', 'kingdom'], ['status', 'published']])
      onRead?.()
      return Promise.resolve(result).then(resolve, reject)
    } }
    return query
  } }
}
test('native and partner public reads start independently and preserve partner-only inventory', async () => {
  let partnerStarted = false
  const partnerRows = [{ row: { listing_id: 'partner', partner_listing: true }, media: [] }]
  const load = reader(async (client, site, limit) => { partnerStarted = true; assert.deepEqual(site, { id: 'kingdom', organisationId: 'agency' }); assert.equal(limit, 100); return partnerRows })
  const result = await load(emptyNative({ data: [], error: null }, () => assert.equal(partnerStarted, true)), { id: 'kingdom', organisationId: 'agency' })
  assert.deepEqual(result, partnerRows)
})
test('a native publication read failure still fails closed when partner data succeeds', async () => {
  const failure = new Error('publication read failed')
  const load = reader(async () => [{ row: { listing_id: 'partner' }, media: [] }])
  await assert.rejects(load(emptyNative({ data: null, error: failure }), { id: 'kingdom', organisationId: 'agency' }), /publication read failed/)
})
