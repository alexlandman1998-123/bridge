// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ calls: [], responses: [] }))
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { rpc(name, parameters) {
  state.calls.push({ rpc: name, parameters })
  return Promise.resolve(state.responses.shift() || { data: null, error: null })
}, from(table) {
  const call = { table, filters: [] }; state.calls.push(call)
  const query = {}
  for (const method of ['select', 'eq', 'order', 'limit', 'maybeSingle', 'in']) query[method] = (...args) => { call.filters.push([method, ...args]); return query }
  query.then = (resolve, reject) => Promise.resolve(state.responses.shift() || { data: [], error: null }).then(resolve, reject)
  return query
} } }))
vi.mock('../../../lib/developmentMediaStorage.js', () => ({ refreshDevelopmentMedia: vi.fn(async (_client, rows) => rows) }))
vi.mock('../../../lib/api', () => { throw new Error('Read-only development entry must not load the legacy API') })
import * as reads from '../api.js'
import * as adapter from '../../../lib/developmentDetailApi.js'
beforeEach(() => { state.calls = []; state.responses = [] })

it.each([
  ['fetchDevelopmentDocumentRequirements', 'document_requirements'],
  ['fetchDevelopmentMarketingAccess', 'development_marketing_access'],
  ['fetchDevelopmentMarketingActivity', 'development_marketing_activity'],
])('keeps %s scoped to the requested development', async (name, table) => {
  await reads[name]('development-one')
  expect(state.calls[0].table).toBe(table)
  expect(state.calls[0].filters).toContainEqual(['eq', 'development_id', 'development-one'])
})
it('keeps event ownership filters and mapping unchanged', async () => {
  state.responses.push({ data: [{ id: 'event', event_type: 'launch', title: 'Launch' }], error: null })
  expect(await adapter.fetchDevelopmentMarketingEvents('dev', 'org')).toMatchObject([{ id: 'event', eventType: 'launch' }])
  expect(state.calls[0].filters).toContainEqual(['eq', 'organisation_id', 'org'])
  expect(state.calls[0].filters).toContainEqual(['eq', 'subject_id', 'dev'])
})
it('uses the small read entry for website analytics without importing the legacy API', async () => {
  await adapter.fetchDevelopmentVisualAnalytics('dev', { days: 7 })
  expect(state.calls[0]).toEqual({ rpc: 'get_development_visual_analytics', parameters: { requested_development_id: 'dev', requested_days: 7 } })
})
it('preserves financial defaults and numeric mapping', async () => {
  state.responses.push({ data: { land_cost: '150', notes: 'Original' }, error: null })
  expect(await reads.fetchDevelopmentFinancials('dev')).toMatchObject({ developmentId: 'dev', landCost: 150, notes: 'Original' })
})
it('preserves missing-schema and denied access handling, but propagates genuine failures', async () => {
  state.responses.push({ data: null, error: { code: '42501', message: 'Permission denied' } })
  expect(await reads.fetchDevelopmentMarketingAccess('dev')).toEqual([])
  state.responses.push({ data: null, error: new Error('Connection failed') })
  await expect(reads.fetchDevelopmentMarketingAccess('dev')).rejects.toThrow('Connection failed')
})
