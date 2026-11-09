import { readDomainApiSource } from '../../../scripts/helpers/domainApiSource.mjs'

import { expect, it } from 'vitest'
const source = readDomainApiSource()
it('reads linked drafts and active listings from the shared listing table, excluding archived and unrelated records', async () => {
  const records = [
    { id: 'new-draft', development_id: 'dev', listing_status: 'seller_lead', is_active: false },
    { id: 'draft', development_id: 'dev', listing_status: 'draft', is_active: false },
    { id: 'review', development_id: 'dev', listing_status: 'listing_review', is_active: false },
    { id: 'active', development_id: 'dev', listing_status: 'active', is_active: true },
    { id: 'archived', development_id: 'dev', listing_status: 'archived', is_active: false },
    { id: 'other', development_id: 'other', listing_status: 'active', is_active: true },
  ]
  const filters = []
  const client = { from(table) {
    const query = { select() { return query }, order() { return query }, range() { return query }, in() { return query },
      eq(key, value) { filters.push([table, key, value]); return query },
      then(resolve, reject) { return Promise.resolve({ data: table === 'private_listings' ? records : [] }).then(resolve, reject) },
    }; return query
  } }
  const start = source.indexOf('async function fetchDevelopmentLinkedListings(')
  const end = source.indexOf('\n}\n', start) + 2
  const read = new Function('normalizeTextValue', 'privateListingMatchesDevelopment', 'mapDevelopmentLinkedListing', 'loadDevelopmentListingCoverImages', `${source.slice(start, end)}; return fetchDevelopmentLinkedListings`)(value => String(value ?? '').trim(), (row, { development }) => row.development_id === development.id, row => row, async (_client, ids) => Object.fromEntries(ids.map(id => [id, `https://storage.example.test/${id}.jpg?fresh=1`])))
  const result = await read(client, { development: { id: 'dev' } })
  expect(result.map(row => row.id)).toEqual(['new-draft', 'draft', 'review', 'active'])
  expect(filters).toEqual([['private_listings', 'development_id', 'dev']])
  expect(result[0]).toMatchObject(records[0])
  expect(result[0].coverImageUrl).toBe('https://storage.example.test/new-draft.jpg?fresh=1')
})
