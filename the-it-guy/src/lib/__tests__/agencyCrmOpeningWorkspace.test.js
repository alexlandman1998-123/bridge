// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const org = '11111111-1111-4111-8111-111111111111'
const lead = '22222222-2222-4222-8222-222222222222'
const state = vi.hoisted(() => ({ reads: [] }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from(table) {
  const call = { table, filters: [] }; state.reads.push(call)
  const query = {}
  for (const method of ['select', 'eq', 'neq', 'order', 'limit', 'maybeSingle']) query[method] = (...args) => { call.filters.push([method, ...args]); return query }
  query.then = (yes, no) => {
    const rows = Array.from({ length: 100 }, (_, i) => table === 'tasks' ? { task_id: `task-${i}` } : { activity_id: `activity-${i}` })
    const limit = call.filters.find(([method]) => method === 'limit')?.[1]
    const data = table === 'leads' ? { lead_id: '22222222-2222-4222-8222-222222222222', organisation_id: '11111111-1111-4111-8111-111111111111', contact_id: 'contact', lead_category: 'buyer' }
      : table === 'contacts' ? { contact_id: 'contact', first_name: 'Buyer' } : rows.slice(0, limit ?? rows.length)
    return Promise.resolve({ data, error: null }).then(yes, no)
  }
  return query
} } }))
import { fetchAgencyCrmLeadWorkspace } from '../agencyCrmRepository.js'
beforeEach(() => { state.reads = [] })
it('opens one lead and contact with a bounded recent history instead of an organisation-wide collection', async () => {
  const result = await fetchAgencyCrmLeadWorkspace(org, lead, { relatedLimit: 3 })
  expect(result.leads).toHaveLength(1)
  expect(result.contacts).toHaveLength(1)
  expect(result.leadActivities).toHaveLength(3)
  expect(result.tasks).toHaveLength(3)
  expect(state.reads).toHaveLength(4)
  for (const call of state.reads) expect(call.filters).toContainEqual(['eq', 'organisation_id', org])
  for (const call of state.reads.filter(call => ['tasks', 'lead_activities'].includes(call.table))) {
    expect(call.filters).toContainEqual(['eq', 'lead_id', lead])
    expect(call.filters).toContainEqual(['limit', 3])
  }
})
it('skips related history for a detail-only request and preserves the complete-read default', async () => {
  const core = await fetchAgencyCrmLeadWorkspace(org, lead, { includeRelatedRecords: false })
  expect(core.relatedRecordsStatus).toBe('deferred')
  expect(state.reads.map(call => call.table)).toEqual(['leads', 'contacts'])
  state.reads = []
  const complete = await fetchAgencyCrmLeadWorkspace(org, lead)
  expect(complete.tasks).toHaveLength(100)
  expect(complete.leadActivities).toHaveLength(100)
})
