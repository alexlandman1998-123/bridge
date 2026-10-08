import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), guard: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: mocks.from } }))
vi.mock('../workspaceResolutionService', () => ({ assertResolvedWorkspaceContext: mocks.guard }))
import { loadAgentNeedsAttentionRecords } from '../agentNeedsAttentionService'
let pages, queries
beforeEach(() => {
  vi.resetAllMocks(); pages = {}; queries = []
  mocks.from.mockImplementation((table) => {
    const query = { table, filters: [], orders: [] }; queries.push(query)
    const chain = {
      select: (fields) => { query.fields = fields; return chain },
      eq: (field, value) => { query.filters.push([field, value]); return chain },
      order: (field) => { query.orders.push(field); return chain },
      not: () => chain,
      range: (from, to) => { query.range = [from, to]; return Promise.resolve(pages[table]?.[from] || { data: [], error: null }) },
    }
    return chain
  })
})

it('reads all four sources from the resolved organisation, with stable pagination beyond 500 rows', async () => {
  const first = Array.from({ length: 500 }, (_, index) => ({ lead_id: `lead-${index}` }))
  pages.leads = { 0: { data: first, error: null }, 500: { data: [{ lead_id: 'lead-500' }], error: null } }
  const data = await loadAgentNeedsAttentionRecords('org')
  expect(data.leads).toHaveLength(501)
  expect(queries).toHaveLength(5)
  expect(queries.every((query) => query.filters.some(([field, value]) => field === 'organisation_id' && value === 'org'))).toBe(true)
  expect(queries.filter((query) => query.table === 'leads').map((query) => query.range)).toEqual([[0, 499], [500, 999]])
  expect(queries.filter((query) => query.table === 'leads').every((query) => query.orders[0] === 'lead_id')).toBe(true)
})

it('fails clearly on permission/schema errors rather than returning an empty queue', async () => {
  pages.tasks = { 0: { data: null, error: new Error('permission denied') } }
  await expect(loadAgentNeedsAttentionRecords('org')).rejects.toThrow('permission denied')
})

it('requires a resolved workspace before making any request', async () => {
  mocks.guard.mockImplementation(() => { throw new Error('Select an organisation') })
  await expect(loadAgentNeedsAttentionRecords('')).rejects.toThrow('Select an organisation')
  expect(mocks.from).not.toHaveBeenCalled()
})
