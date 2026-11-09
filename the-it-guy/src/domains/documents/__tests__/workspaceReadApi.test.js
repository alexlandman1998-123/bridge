// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ calls: [], units: [], allowed: ['dev'], accessible: [], participantUnits: [], transactions: [], documents: vi.fn(), requirements: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { from(table) {
  const call = { table, filters: [] }; state.calls.push(call)
  const query = {}
  for (const method of ['select', 'in', 'eq', 'order', 'gt', 'limit']) query[method] = (...args) => { call.filters.push([method, ...args]); return query }
  query.then = (yes, no) => {
    const after = call.filters.find(([method]) => method === 'gt')?.[2]
    const limit = call.filters.find(([method]) => method === 'limit')?.[1] || 100
    const start = after ? state.units.findIndex(unit => unit.id === after) + 1 : 0
    const ids = call.filters.find(([method, field]) => method === 'in' && field === 'unit_id')?.[2] || []
    const data = table === 'units' ? state.units.slice(start, start + limit)
      : table === 'buyers' ? state.units.map(unit => ({ id: `buyer-${unit.id}`, name: 'Buyer' }))
      : call.filters.some(([method, fields]) => method === 'select' && fields === 'unit_id') ? state.participantUnits
      : state.transactions.filter(row => ids.includes(row.unit_id))
    return Promise.resolve({ data, error: null }).then(yes, no)
  }
  return query
} } }))
vi.mock('../../developments/scopeReadApi.js', () => ({ fetchDevelopmentIdsForOrganisation: async () => state.allowed }))
vi.mock('../../access/transactionApi.js', () => ({ getAccessibleTransactionIdsForUser: async () => state.accessible }))
vi.mock('../listReadApi.js', () => ({ loadSharedDocuments: (...args) => state.documents(...args) }))
vi.mock('../requirementReadModel.js', async original => ({ ...await original(), fetchTransactionRequiredDocumentsByTransactionIds: async () => ({}), fetchDocumentRequirements: (...args) => state.requirements(...args) }))
import { fetchDocumentWorkspacePage, fetchDocumentClientWorkspace } from '../workspaceReadApi.js'

beforeEach(() => {
  vi.clearAllMocks(); state.calls = []; state.allowed = ['dev']; state.accessible = []; state.participantUnits = []
  state.units = Array.from({ length: 60 }, (_, i) => ({ id: `unit-${i}`, development_id: 'dev', unit_number: String(i), development: { id: 'dev', name: 'Development' } }))
  state.transactions = state.units.map(unit => ({ id: `transaction-${unit.id}`, unit_id: unit.id, buyer_id: `buyer-${unit.id}`, stage: 'Offer Accepted', comment: 'Private workflow history' }))
  state.documents.mockResolvedValue([]); state.requirements.mockResolvedValue([])
})

it('bounds selector pages at 25 and never loads documents, checklists or file URLs', async () => {
  const first = await fetchDocumentWorkspacePage({ organisationId: 'org' })
  expect(first.rows).toHaveLength(25)
  expect(first.nextCursor).toBe('unit-24')
  expect(state.calls[0].filters).toContainEqual(['limit', 26])
  expect(state.calls[0].filters).toContainEqual(['in', 'development_id', ['dev']])
  const transactions = state.calls.find(call => call.table === 'transactions')
  expect(transactions.filters.find(([method, field]) => method === 'in' && field === 'unit_id')[2]).toHaveLength(25)
  expect(transactions.filters).toContainEqual(['select', 'id, unit_id, buyer_id, stage, updated_at, created_at'])
  expect(JSON.stringify(first.rows).length).toBeLessThan(25000)
  expect(first.rows[0].buyer).toEqual({ name: 'Buyer' })
  expect(first.rows[0].transaction.comment).toBeUndefined()
  expect(first.rows[0].documents).toBeUndefined()
  expect(state.documents).not.toHaveBeenCalled()
  expect(state.requirements).not.toHaveBeenCalled()
  const last = await fetchDocumentWorkspacePage({ organisationId: 'org', afterUnitId: 'unit-49' })
  expect(last.rows).toHaveLength(10)
  expect(last.nextCursor).toBeNull()
})

it('fails closed on missing organisation, out-of-scope developments and unassigned participants', async () => {
  await expect(fetchDocumentWorkspacePage()).rejects.toThrow('organisation is required')
  expect((await fetchDocumentWorkspacePage({ organisationId: 'org', developmentId: 'other' })).rows).toEqual([])
  expect((await fetchDocumentWorkspacePage({ organisationId: 'org', roleType: 'agent' })).rows).toEqual([])
  expect(state.calls).toEqual([])
  state.accessible = ['assigned']; state.participantUnits = [{ unit_id: 'unit-0' }]
  expect((await fetchDocumentWorkspacePage({ organisationId: 'org', roleType: 'agent', userId: 'actor' })).rows).toEqual([])
  expect(state.calls.find(call => call.table === 'units').filters).toContainEqual(['in', 'id', ['unit-0']])
})

it('loads evidence and requirements for exactly the selected transaction', async () => {
  const row = { unit: { id: 'unit', development_id: 'dev' }, transaction: { id: 'selected' } }
  const result = await fetchDocumentClientWorkspace(row)
  expect(state.documents).toHaveBeenCalledWith(expect.anything(), { transactionIds: ['selected'], viewer: 'internal' })
  expect(state.requirements).toHaveBeenCalledWith(expect.anything(), 'dev')
  expect(result).toMatchObject({ transaction: { id: 'selected' }, documents: [] })
  expect(result.requiredChecklist).toEqual([])
})
