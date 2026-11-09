// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ calls: [], payload: null, rpcError: null, profileError: null, profileData: null }))
vi.mock('../../../lib/supabaseClient', () => ({ supabase: {
  rpc: async (name, args) => { state.calls.push({ rpc: name, args }); return { data: state.payload, error: state.rpcError } },
  from(table) {
    const call = { table, filters: [] }; state.calls.push(call)
    const query = {}
    for (const method of ['select', 'eq', 'maybeSingle']) query[method] = (...args) => { call.filters.push([method, ...args]); return query }
    query.then = (yes, no) => Promise.resolve({ data: table === 'developments' ? { id: 'dev', name: 'Development' } : state.profileData, error: table === 'development_profiles' ? state.profileError : null }).then(yes, no)
    return query
  },
} }))
vi.mock('../configurationApi.js', () => ({
  ensureDevelopmentSettings: async (_client, id, options) => { state.calls.push({ config: 'settings', id, options }); return {} },
  fetchDevelopmentAttorneyConfig: async id => { state.calls.push({ config: 'attorney', id }); return {} },
  fetchDevelopmentBondConfig: async id => { state.calls.push({ config: 'bond', id }); return {} },
}))
import { fetchDevelopmentOverview, fetchDevelopmentOverviewPage } from '../overviewReadApi.js'

const payload = () => ({ contract: 'development-overview-v1', developmentId: 'dev',
  summary: { totalUnits: 5000, available: 1000, registered: 2000, inProgress: 2000, inTransfer: 800 },
  rows: Array.from({ length: 25 }, (_, i) => ({ unit: { id: `unit-${i}`, development_id: 'dev', unit_number: String(i), status: 'Available' } })),
  nextCursor: 'unit-24', attentionRows: [], recentRows: [],
})
beforeEach(() => { state.calls = []; state.payload = payload(); state.rpcError = null; state.profileError = null; state.profileData = null })

it('opens through one summary/page RPC and scoped metadata reads without full inventory or document lookups', async () => {
  const data = await fetchDevelopmentOverview('dev')
  expect(data.rows).toHaveLength(25)
  expect(data.stats).toMatchObject({ totalUnits: 5000, available: 1000, registered: 2000, soldActive: 4000 })
  expect(data.unitPage.nextCursor).toBe('unit-24')
  expect(data.documents).toBeUndefined()
  expect(data.transactionRows).toBeUndefined()
  expect(data.listings).toBeUndefined()
  expect(state.calls.map(call => call.table).filter(Boolean)).toEqual(['developments', 'development_profiles'])
  expect(state.calls.filter(call => call.table).every(call => call.filters.some(([method, field, id]) => method === 'eq' && id === 'dev' && ['id', 'development_id'].includes(field)))).toBe(true)
  const fields = state.calls.find(call => call.table === 'development_profiles').filters[0][1].split(',').map(field => field.trim())
  for (const field of ['marketing_content', 'plans', 'image_links', 'supporting_documents']) expect(fields).not.toContain(field)
  expect(fields).toContain('overview_first_image:image_links->0')
  expect(state.calls.find(call => call.config === 'settings').options).toEqual({ createIfMissing: false })
})

it('does not start supporting reads for an inaccessible development or failed summary', async () => {
  state.payload = null
  expect(await fetchDevelopmentOverview('dev')).toBeNull()
  expect(state.calls).toHaveLength(1)
  state.calls = []; state.rpcError = { code: '42501', message: 'permission denied' }
  await expect(fetchDevelopmentOverview('dev')).rejects.toMatchObject({ code: '42501' })
  expect(state.calls).toHaveLength(1)
})

it('fails locally with a retry message when the new read is unavailable; never falls back to an unbounded read', async () => {
  state.rpcError = { code: 'PGRST202' }
  await expect(fetchDevelopmentOverview('dev')).rejects.toThrow(/latest database update/)
  expect(state.calls).toHaveLength(1)
})

it.each(['too many rows', 'foreign row', 'wrong development', 'wrong contract'])('rejects an invalid overview response: %s', async mode => {
  if (mode === 'too many rows') state.payload.rows.push(state.payload.rows[0])
  if (mode === 'foreign row') state.payload.rows[0].unit.development_id = 'other'
  if (mode === 'wrong development') state.payload.developmentId = 'other'
  if (mode === 'wrong contract') state.payload.contract = 'unknown'
  await expect(fetchDevelopmentOverviewPage('dev')).rejects.toThrow(/could not be confirmed/)
})

it('keeps optional inaccessible profiles optional and forwards the cursor without changing the summary scope', async () => {
  state.profileError = { code: '42501' }
  expect((await fetchDevelopmentOverview('dev')).development.id).toBe('dev')
  await fetchDevelopmentOverviewPage('dev', { afterUnitId: 'unit-24' })
  expect(state.calls.at(-1).args).toEqual({ p_development_id: 'dev', p_after_unit_id: 'unit-24' })
})

it.each(['https://example.test/first.jpg', { url: 'https://example.test/first.jpg' }])('retains the overview cover and legacy image pointers without a media gallery or unit-type payload: %j', async firstImage => {
  state.profileData = { development_id: 'dev', overview_cover: 'https://example.test/cover.jpg', overview_first_image: firstImage }
  const result = await fetchDevelopmentOverview('dev')
  expect(result.profile.marketingContent.mediaLibrary.coverImageUrl).toBe('https://example.test/cover.jpg')
  expect(result.profile.imageLinks).toEqual(['https://example.test/first.jpg'])
  expect(state.calls.filter(call => call.table).map(call => call.table)).toEqual(['developments', 'development_profiles'])
})
