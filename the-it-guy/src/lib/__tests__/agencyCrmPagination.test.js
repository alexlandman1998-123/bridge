import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ rows: {}, reads: [], failAt: null, cap: 127 }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from(table) {
  let start = 0; let end = 999
  const query = {
    select: () => query, eq: (field, value) => { expect(field).toBe('organisation_id'); expect(value).toBe('11111111-1111-4111-8111-111111111111'); return query }, order: () => query,
    range: (first, last) => { start = first; end = last; return query },
    then(resolve, reject) {
      fixture.reads.push({ table, start, end })
      return Promise.resolve(fixture.failAt !== null && table === 'leads' && start >= fixture.failAt
        ? { data: null, error: new Error('Later page timed out') }
        : { data: (fixture.rows[table] || []).slice(start, Math.min(end + 1, start + fixture.cap)), error: null }).then(resolve, reject)
    },
  }
  return query
} } }))
import { listAgencyCrmLeadContacts } from '../agencyCrmRepository'
const options = { includeLocalFallback: false, includeRelatedRecords: false, paginatePrimaryRecords: true }
beforeEach(() => { fixture.reads = []; fixture.failAt = null; fixture.cap = 127; fixture.rows = {
  leads: Array.from({ length: 1005 }, (_, i) => ({ lead_id: `lead-${i}`, organisation_id: '11111111-1111-4111-8111-111111111111', contact_id: `contact-${i}` })),
  contacts: Array.from({ length: 1005 }, (_, i) => ({ contact_id: `contact-${i}`, organisation_id: '11111111-1111-4111-8111-111111111111', first_name: `Tenant ${i}` })),
} })
it('loads beyond the default row cap, including contacts, even with a smaller server page limit', async () => {
  const result = await listAgencyCrmLeadContacts('11111111-1111-4111-8111-111111111111', options)
  expect(result.leads).toHaveLength(1005)
  expect(result.contacts).toHaveLength(1005)
  expect(result.leads[1004].contactId).toBe('contact-1004')
  expect(fixture.reads.filter(r => r.table === 'leads').map(r => r.start)).toEqual([0,127,254,381,508,635,762,889,1005])
})
it('does not present an incomplete board as successfully loaded when a later page fails', async () => {
  fixture.failAt = 254
  await expect(listAgencyCrmLeadContacts('11111111-1111-4111-8111-111111111111', options)).rejects.toThrow('Later page timed out')
})
it('preserves the existing single-request behavior for other CRM consumers', async () => {
  fixture.cap = 1000
  const result = await listAgencyCrmLeadContacts('11111111-1111-4111-8111-111111111111', { ...options, paginatePrimaryRecords: false })
  expect(result.leads).toHaveLength(1000)
  expect(fixture.reads).toHaveLength(2)
})
