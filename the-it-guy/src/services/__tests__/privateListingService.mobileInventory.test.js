import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const uuid = (number) => `11111111-1111-4111-8111-${String(number).padStart(12, '0')}`
const org = uuid(999)
const user = uuid(998)
function clientFor(rows, { failurePage = -1, missingTable = false } = {}) {
  const requests = []
  return { requests, from(table) {
    const request = { table, filters: [], orders: [], range: null }
    requests.push(request)
    const query = {
      select() { return this }, not() { return this }, neq() { return this }, or() { return this },
      eq(key, value) { request.filters.push([key, value]); return this },
      in(key, value) { request.filters.push([key, value]); return this },
      order(key, options) { request.orders.push([key, options]); return this },
      range(from, to) { request.range = [from, to]; return this },
      then(resolve) {
        if (table === 'private_listings') {
          if (missingTable) return resolve({ error: { code: '42P01', message: 'relation private_listings does not exist' } })
          const [from, to] = request.range || [0, rows.length - 1]
          if (from === failurePage) return resolve({ error: new Error('Second page unavailable') })
          return resolve({ data: rows.slice(from, to + 1), error: null })
        }
        assert.equal(table, 'listing_publication_data')
        const ids = request.filters.find(([key]) => key === 'listing_id')[1]
        return resolve({ data: ids.map((listing_id) => ({ listing_id, bedrooms: 3, bathrooms: 1.5, floor_size: 123 })), error: null })
      },
    }
    return query
  } }
}

test('mobile inventory reads every scoped page with stable ordering and complete property metadata', async () => {
  const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const { getAgentPrivateListingSummaries } = await server.ssrLoadModule('/src/services/privateListingService.js')
    const rows = Array.from({ length: 405 }, (_, i) => ({ id: uuid(i), organisation_id: org, assigned_agent_id: user, listing_status: 'active', title: `Unit ${i}`, is_active: true, seller_canonical_facts_json: { property: i === 404 ? { scheme: { unit_number: String(i) } } : { unitNumber: String(i) } } }))
    const client = clientFor(rows)
    const inventory = await getAgentPrivateListingSummaries(user, { organisationId: org, fetchAll: true, includePublicationDetails: true, requireAvailable: true, client })
    assert.equal(inventory.length, 405)
    assert.deepEqual(client.requests.filter((r) => r.table === 'private_listings').map((r) => r.range), [[0, 199], [200, 399], [400, 599]])
    for (const request of client.requests.filter((r) => r.table === 'private_listings')) {
      assert.deepEqual(request.filters, [['organisation_id', org], ['assigned_agent_id', user]])
      assert.deepEqual(request.orders, [['updated_at', { ascending: false }], ['id', { ascending: true }]])
    }
    assert.deepEqual(client.requests.filter((r) => r.table === 'listing_publication_data').map((r) => r.filters[0][1].length), [200, 200, 5])
    assert.equal(inventory[404].unitNumber, '404')
    assert.equal(inventory[404].bedrooms, 3)
    assert.equal(inventory[404].bathrooms, 1.5)
    assert.equal(inventory[404].floorSize, 123)
    await assert.rejects(getAgentPrivateListingSummaries(user, { organisationId: org, fetchAll: true, client: clientFor(rows, { failurePage: 200 }) }), /Second page unavailable/)
    await assert.rejects(getAgentPrivateListingSummaries(user, { organisationId: org, requireAvailable: true, client: clientFor([], { missingTable: true }) }), (error) => error.code === '42P01')
  } finally { await server.close() }
})
