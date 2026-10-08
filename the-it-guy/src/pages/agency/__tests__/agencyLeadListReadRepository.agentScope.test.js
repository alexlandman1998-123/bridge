import { beforeEach, expect, it, vi } from 'vitest'
import { agencyLeadAgentFilter, agencyLeadAgentScope } from '../agencyLeadAgentScope'
import { invalidateAgencyLeadListCache, listAgencyLeadLandingMetrics, listAgencyLeadListRecords } from '../agencyLeadListReadRepository'
const fixture = vi.hoisted(() => ({ urls: [], leads: [], legacy: false }))
vi.mock('../../../lib/supabaseClient', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return {
    isSupabaseConfigured: true,
    supabase: createClient('http://localhost:55555', 'local-test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input) => {
      const url = new URL(String(input))
      fixture.urls.push(url)
      if (!url.pathname.endsWith('/leads')) return new Response('[]', { headers: { 'Content-Type': 'application/json' } })
      if (fixture.legacy && url.searchParams.get('select').includes('assigned_user_id')) return new Response(JSON.stringify({ code: '42703', message: 'column assigned_user_id does not exist' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const organisationId = url.searchParams.get('organisation_id').slice(3)
      let rows = fixture.leads.filter((row) => row.organisation_id === organisationId)
      const predicate = url.searchParams.get('or')
      if (predicate) {
        const terms = [...predicate.matchAll(/(assigned_user_id|assigned_agent_id|assigned_agent_email)\.eq\.("(?:\\.|[^"\\])*")/g)].map(([, key, value]) => [key, JSON.parse(value)])
        rows = rows.filter((row) => terms.some(([key, value]) => row[key] === value))
      }
      const count = rows.length
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || count)
      rows = rows.slice(offset, offset + limit)
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json', 'Content-Range': `${offset}-${offset + rows.length - 1}/${count}` } })
    } } }),
  }
})
const org = '00000000-0000-4000-8000-000000000010'
const a = { userId: '00000000-0000-4000-8000-000000000012', organisationUserId: '00000000-0000-4000-8000-000000000013', email: 'agent@example.test' }
const b = { userId: '00000000-0000-4000-8000-000000000014', email: 'other@example.test' }
const makeLead = (index, assigned = a) => ({ lead_id: `lead-${index}`, organisation_id: org, lead_category: 'buyer', lead_source: 'Website', assigned_user_id: assigned.userId, assigned_agent_email: assigned.email, contact_id: null, stage: 'New Lead', updated_at: '2026-10-08T10:00:00Z' })
beforeEach(() => {
  invalidateAgencyLeadListCache()
  fixture.urls = []
  fixture.legacy = false
  fixture.leads = [...Array.from({ length: 40 }, (_, i) => makeLead(i, b)), ...Array.from({ length: 26 }, (_, i) => makeLead(i + 40))]
})
it('filters the real Supabase query before pagination and uses the assigned total count', async () => {
  const first = await listAgencyLeadListRecords(org, { scopedAgent: a, includeRelatedRecords: false, page: 0, pageSize: 25 })
  expect(first.leads).toHaveLength(25)
  expect(first.totalCount).toBe(26)
  expect(first.leads.every((row) => row.assignedUserId === a.userId)).toBe(true)
  const url = fixture.urls.find((row) => row.pathname.endsWith('/leads'))
  expect(url.searchParams.get('organisation_id')).toBe(`eq.${org}`)
  expect(url.searchParams.get('or')).toContain(`assigned_user_id.eq."${a.userId}"`)
  expect(url.searchParams.get('or')).toContain(`assigned_agent_id.eq."${a.organisationUserId}"`)
  const second = await listAgencyLeadListRecords(org, { scopedAgent: a, includeRelatedRecords: false, page: 1, pageSize: 25 })
  expect(second.leads.map((row) => row.leadId)).toEqual(['lead-65'])
})
it('isolates cached pages and summary counts between agents and the ordinary organisation list', async () => {
  const options = { includeRelatedRecords: false, pageSize: 25 }
  const first = await listAgencyLeadListRecords(org, { ...options, scopedAgent: a })
  const second = await listAgencyLeadListRecords(org, { ...options, scopedAgent: b })
  const all = await listAgencyLeadListRecords(org, options)
  expect([first.totalCount, second.totalCount, all.totalCount]).toEqual([26, 40, 66])
  const aMetrics = await listAgencyLeadLandingMetrics(org, { scopedAgent: a })
  const bMetrics = await listAgencyLeadLandingMetrics(org, { scopedAgent: b })
  expect([aMetrics.leads.length, bMetrics.leads.length]).toEqual([26, 40])
  const requests = fixture.urls.length
  await listAgencyLeadLandingMetrics(org, { scopedAgent: a })
  expect(fixture.urls).toHaveLength(requests)
  invalidateAgencyLeadListCache(org)
  fixture.leads.push(makeLead(99))
  expect((await listAgencyLeadLandingMetrics(org, { scopedAgent: a })).leads).toHaveLength(27)
})
it('supports a legacy agent membership assignment and email-only assignment', async () => {
  fixture.leads = [{ ...makeLead(1), assigned_user_id: null, assigned_agent_id: a.organisationUserId, assigned_agent_email: null }, { ...makeLead(2), assigned_user_id: null, assigned_agent_id: null }]
  expect((await listAgencyLeadListRecords(org, { scopedAgent: a, includeRelatedRecords: false })).leads).toHaveLength(2)
})
it('keeps assignment filtering when falling back to legacy database columns', async () => {
  fixture.legacy = true
  fixture.leads = [{ ...makeLead(1), assigned_agent_id: a.organisationUserId }, { ...makeLead(2, b), assigned_agent_id: b.userId }]
  const records = await listAgencyLeadListRecords(org, { scopedAgent: a, includeRelatedRecords: false })
  expect(records.leads.map((row) => row.leadId)).toEqual(['lead-1'])
  const last = fixture.urls.filter((row) => row.pathname.endsWith('/leads')).at(-1)
  expect(last.searchParams.get('or')).not.toContain('assigned_user_id')
  expect(last.searchParams.get('or')).not.toContain('assigned_agent_email')
})
it('fails closed for an unlinked identity instead of falling back to all organisation leads', async () => {
  await expect(listAgencyLeadListRecords(org, { scopedAgent: { id: 'unknown' }, includeRelatedRecords: false })).rejects.toThrow('linked user account')
  expect(fixture.urls).toHaveLength(0)
})
it('quotes punctuation in email values and excludes unavailable columns', () => {
  const scope = agencyLeadAgentScope({ email: 'agent,(x)@example.test' })
  expect(agencyLeadAgentFilter(scope, 'assigned_agent_email')).toBe('assigned_agent_email.eq."agent,(x)@example.test"')
  expect(() => agencyLeadAgentFilter(scope, 'assigned_agent_id')).toThrow('linked user account')
})
