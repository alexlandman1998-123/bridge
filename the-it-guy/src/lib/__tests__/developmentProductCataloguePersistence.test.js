import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Exercise the real catalogue writer/reader with isolated row storage. No
// hosted database, credentials, or network are used by these checks.
const api = await readFile(new URL('../api.js', import.meta.url), 'utf8')
const start = api.indexOf('async function fetchDevelopmentProductCatalogue(')
const end = api.indexOf('\nexport async function updateDevelopmentTransactionSalesPrice(', start)
const source = api.slice(start, end).replace('export async function', 'async function')

function fixture() {
  const tables = new Map(), calls = []
  const client = { from(table) {
    calls.push(table)
    if (!tables.has(table)) tables.set(table, [])
    let operation = 'select', payload, columns = '*', single = false
    const filters = []
    const query = {
      upsert(value) { operation = 'upsert'; payload = Array.isArray(value) ? value : [value]; return query },
      update(value) { operation = 'update'; payload = value; return query },
      select(value = '*') { columns = value; return query },
      eq(key, value) { filters.push((row) => row[key] === value); return query },
      order() { return query },
      single() { single = true; return query },
      async then(resolve) {
        const rows = tables.get(table)
        let result
        if (operation === 'upsert') {
          result = payload.map((row) => {
            const saved = JSON.parse(JSON.stringify({ ...row, id: row.id || crypto.randomUUID() }))
            const existing = rows.find((item) => item.id === saved.id)
            if (existing) Object.assign(existing, saved)
            else rows.push(saved)
            return existing || saved
          })
        } else {
          result = rows.filter((row) => filters.every((matches) => matches(row)))
          if (operation === 'update') result.forEach((row) => Object.assign(row, payload))
        }
        const data = result.map((row) => columns === '*' ? { ...row } : Object.fromEntries(columns.split(',').map((key) => [key.trim(), row[key.trim()]])))
        return resolve({ data: single ? data[0] : data, error: null })
      },
    }
    return query
  } }
  const deps = {
    requireClient: () => client,
    normalizeTextValue: (value) => String(value ?? '').trim(),
    normalizeNullableText: (value) => String(value ?? '').trim() || null,
    normalizeOptionalNumber: (value) => value === undefined || value === null || value === '' ? null : Number(value),
    normalizeNullableBoolean: (value) => value === undefined || value === null ? null : Boolean(value),
    persistDevelopmentMedia: (_client, rows) => rows,
    refreshDevelopmentMedia: async (_client, rows) => rows,
    isMissingTableError: () => false, isMissingSchemaError: () => false, isPermissionDeniedError: () => false,
  }
  const save = new Function(...Object.keys(deps), `${source}; return saveDevelopmentProductCatalogue`)(...Object.values(deps))
  return { save, tables, calls }
}

const catalogue = () => ({ developmentId: 'development', unitTypes: [{ id: 'type', name: 'Duplex' }], floorplans: [{ id: 'layout', unitTypeId: 'type', name: 'D1', storeys: '2', metadata: { existingDetail: 'retained' } }] })

test('storeys round-trip through layout metadata and retain existing metadata on a second save', async () => {
  const { save, tables } = fixture()
  const first = await save(catalogue())
  assert.equal(tables.get('development_floorplans')[0].metadata.storeys, 2)
  assert.equal(first.floorplans[0].storeys, 2)
  assert.equal(first.floorplans[0].metadata.existingDetail, 'retained')
  const second = await save({ developmentId: 'development', ...first, floorplans: [{ ...first.floorplans[0], storeys: '3' }] })
  assert.equal(second.floorplans[0].storeys, 3)
  assert.equal(second.floorplans[0].unitTypeId, 'type')
  assert.equal(second.floorplans[0].metadata.existingDetail, 'retained')
})

test('legacy layouts have an unknown storey count and clearing it does not invent one', async () => {
  const { save } = fixture()
  const input = catalogue()
  delete input.floorplans[0].storeys
  const legacy = await save(input)
  assert.equal(legacy.floorplans[0].storeys, '')
  const cleared = await save({ ...input, floorplans: [{ ...legacy.floorplans[0], storeys: '' }] })
  assert.equal(cleared.floorplans[0].storeys, '')
  assert.equal(cleared.floorplans[0].metadata.existingDetail, 'retained')
})

test('invalid storeys are rejected before any table is read or written', async () => {
  for (const storeys of [0, -1, 1.5, Infinity]) {
    const { save, calls } = fixture()
    const input = catalogue(); input.floorplans[0].storeys = storeys
    await assert.rejects(save(input), /positive whole number/)
    assert.deepEqual(calls, [])
  }
})
