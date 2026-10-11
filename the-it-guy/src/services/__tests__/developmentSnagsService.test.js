import { describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null }))
import { fetchDevelopmentSnagSubmissions } from '../developmentSnagsService.js'

const developmentId = '8b8d5c35-ba13-4175-a26b-cdec8f4c1891'
function fakeClient(data, fail = () => null) {
  const calls = []
  return { calls, from(table) {
    const query = { table, filters: [], start: 0, end: 999,
      select(fields) { this.fields = fields; return this },
      eq(column, value) { this.filters.push([column, value]); return this },
      in(column, values) { this.filters.push([column, values]); return this },
      order() { return this }, range(start, end) { this.start = start; this.end = end; return this }, abortSignal() { return this },
      then(resolve, reject) {
        calls.push(this)
        const rows = (data[table] || []).filter(row => this.filters.every(([column, value]) => Array.isArray(value) ? value.includes(row[column]) : row[column] === value))
        return Promise.resolve({ data: rows.slice(this.start, this.end + 1), error: fail(this) }).then(resolve, reject)
      },
    }
    return query
  } }
}

describe('development snag reads', () => {
  it('scopes submissions and handovers and keeps each purchaser paired to their handover', async () => {
    const client = fakeClient({
      client_issues: [{ id: 'issue', development_id: developmentId, unit_id: 'unit', transaction_id: 'old-purchase', buyer_id: 'owner' }, { id: 'other-issue', development_id: 'other' }],
      buyers: [{ id: 'owner', name: 'Owner One' }], units: [{ id: 'unit', unit_number: '01' }],
      transaction_handover: [{ id: 'new', development_id: developmentId, unit_id: 'unit', buyer_id: 'new-owner', transaction_id: 'new-purchase', handover_date: '2026-10-01' }, { id: 'old', development_id: developmentId, transaction_id: 'old-purchase', handover_date: '2026-07-01' }],
    })
    const result = await fetchDevelopmentSnagSubmissions({ developmentId, client })
    expect(result).toHaveLength(1)
    expect(result[0].handover.id).toBe('old')
    expect(result[0].buyer.name).toBe('Owner One')
    expect(client.calls.filter(call => ['client_issues', 'transaction_handover'].includes(call.table)).every(call => call.filters.some(([column, value]) => column === 'development_id' && value === developmentId))).toBe(true)
    expect(client.calls.find(call => call.table === 'buyers').fields).toBe('id, name')
  })
  it('loads all pages of submitted items', async () => {
    const client = fakeClient({ client_issues: Array.from({ length: 1001 }, (_, index) => ({ id: String(index), development_id: developmentId })) })
    expect(await fetchDevelopmentSnagSubmissions({ developmentId, client })).toHaveLength(1001)
    expect(client.calls.filter(call => call.table === 'client_issues').map(call => call.start)).toEqual([0, 1000])
  })
  it('supports older issue columns and does not attach another owner’s handover', async () => {
    const client = fakeClient({ client_issues: [{ id: 'legacy', development_id: developmentId, unit_id: 'unit', buyer_id: 'owner' }], transaction_handover: [{ id: 'wrong', development_id: developmentId, unit_id: 'unit', buyer_id: 'another-owner' }] }, query => query.table === 'client_issues' && query.fields.includes('transaction_id') ? { code: '42703', message: 'transaction_id does not exist' } : null)
    const result = await fetchDevelopmentSnagSubmissions({ developmentId, client })
    expect(result[0].handover).toBeNull()
  })
  it('reports denied reads and rejects missing scope before querying', async () => {
    const client = fakeClient({}, () => ({ code: '42501', message: 'Permission denied' }))
    await expect(fetchDevelopmentSnagSubmissions({ developmentId, client })).rejects.toMatchObject({ code: '42501' })
    await expect(fetchDevelopmentSnagSubmissions({ developmentId: '', client })).rejects.toThrow('valid development')
    expect(client.calls).toHaveLength(1)
  })
})
