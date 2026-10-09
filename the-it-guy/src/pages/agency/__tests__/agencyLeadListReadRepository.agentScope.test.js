import { beforeEach, expect, it, vi } from 'vitest'
import { agencyLeadAgentFilter, agencyLeadAgentScope } from '../agencyLeadAgentScope'
import { invalidateAgencyLeadListCache, listAgencyLeadLandingMetrics, listAgencyLeadListRecords } from '../agencyLeadListReadRepository'
const fixture = vi.hoisted(() => ({ urls: [], leads: [], contacts: [], legacy: false }))
vi.mock('../../../lib/supabaseClient', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return {
    isSupabaseConfigured: true,
    supabase: createClient('http://localhost:55555', 'local-test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input) => {
      const url = new URL(String(input))
      fixture.urls.push(url)
      if (url.pathname.endsWith('/contacts')) {
        const ids = url.searchParams.get('contact_id').slice(4, -1).split(',').map((id) => id.replace(/^"|"$/g, ''))
        const rows = fixture.contacts.filter((row) => ids.includes(row.contact_id) && `eq.${row.organisation_id}` === url.searchParams.get('organisation_id'))
        return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } })
      }
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
const makeLead = (index, assigned = a) => ({ lead_id: `lead-${index}`, organisation_id: org, lead_category: 'buyer', lead_source: 'Website', assigned_user_id: assigned.userId, assigned_agent_id: assigned.organisationUserId || assigned.userId, assigned_agent_email: assigned.email, contact_id: null, stage: 'New Lead', updated_at: '2026-10-08T10:00:00Z' })
beforeEach(() => {
  invalidateAgencyLeadListCache()
  fixture.urls = []
  fixture.legacy = false
  fixture.contacts = []
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

it('filters the seller category before pagination using the same complete snapshot as the badge', async () => {
  fixture.leads = [...Array.from({ length: 55 }, (_, i) => makeLead(i)), { ...makeLead(99), lead_category: 'seller', seller_property_address: 'Older seller', updated_at: '2026-09-01T00:00:00Z' }]
  const result = await listAgencyLeadListRecords(org, { category: 'seller', scopedAgent: a, includeRelatedRecords: false, pageSize: 25 })
  expect(result.leads.map((lead) => lead.leadId)).toEqual(['lead-99'])
  expect(result.totalCount).toBe(1)
  expect(result.page).toBe(0)
  expect(result.metricLeads).toHaveLength(56)
  const requests = fixture.urls.length
  expect((await listAgencyLeadLandingMetrics(org, { scopedAgent: a })).leads).toBe(result.metricLeads)
  expect(fixture.urls).toHaveLength(requests)
})

it('searches contact names outside the first mixed page before counting and paging', async () => {
  fixture.leads = [...Array.from({ length: 55 }, (_, i) => makeLead(i)), { ...makeLead(99), contact_id: 'older-contact' }]
  fixture.contacts = [{ contact_id: 'older-contact', organisation_id: org, first_name: 'Older', last_name: 'Buyer' }]
  const result = await listAgencyLeadListRecords(org, { category: 'buyer', filters: { search: 'Older Buyer' }, includeRelatedRecords: false, pageSize: 25 })
  expect(result.totalCount).toBe(1)
  expect(result.leads.map((lead) => lead.leadId)).toEqual(['lead-99'])
  expect(result.contacts[0].lastName).toBe('Buyer')
})

it('applies category, source, stage and agent filters before paging and keeps category caches separate', async () => {
  fixture.leads = [...Array.from({ length: 55 }, (_, i) => makeLead(i, b)), ...Array.from({ length: 26 }, (_, i) => ({ ...makeLead(i + 100), lead_category: 'seller', lead_source: 'Canvassing', stage: 'Contacted' }))]
  const options = { category: 'seller', filters: { source: 'Canvassing', stage: 'Contacted', agent: a.userId }, includeRelatedRecords: false, pageSize: 25 }
  const first = await listAgencyLeadListRecords(org, options)
  const second = await listAgencyLeadListRecords(org, { ...options, page: 1 })
  expect(first.leads).toHaveLength(25)
  expect(first.totalCount).toBe(26)
  expect(second.leads.map((lead) => lead.leadId)).toEqual(['lead-125'])
  expect(second.totalCount).toBe(26)
  const buyers = await listAgencyLeadListRecords(org, { ...options, category: 'buyer', filters: {} })
  expect(buyers.totalCount).toBe(55)
  expect((await listAgencyLeadListRecords(org, { ...options, filters: { source: 'Property24' } })).totalCount).toBe(0)
})

it('finds legacy sellers and archived leads beyond the API first thousand rows', async () => {
  fixture.leads = [...Array.from({ length: 1000 }, (_, i) => makeLead(i)), { ...makeLead(1001), lead_category: null, seller_property_address: 'Legacy seller' }, { ...makeLead(1002), stage: 'Archived', status: 'Archived' }]
  const options = { scopedAgent: a, includeRelatedRecords: false, pageSize: 25 }
  expect((await listAgencyLeadListRecords(org, { ...options, category: 'seller' })).leads.map((lead) => lead.leadId)).toEqual(['lead-1001'])
  expect((await listAgencyLeadListRecords(org, { ...options, category: 'archived' })).leads.map((lead) => lead.leadId)).toEqual(['lead-1002'])
  const queries = fixture.urls.filter((url) => url.pathname.endsWith('/leads'))
  expect(queries).toHaveLength(2)
  expect(queries[1].searchParams.get('offset')).toBe('1000')
  expect(queries.every((url) => url.searchParams.get('or').includes(a.userId))).toBe(true)
})

it('refreshes category records after deletion and clamps an obsolete last page', async () => {
  fixture.leads = Array.from({ length: 26 }, (_, i) => makeLead(i))
  const options = { category: 'buyer', includeRelatedRecords: false, pageSize: 25, page: 1 }
  expect((await listAgencyLeadListRecords(org, options)).leads).toHaveLength(1)
  fixture.leads.pop()
  const result = await listAgencyLeadListRecords(org, { ...options, forceRefresh: true })
  expect(result.totalCount).toBe(25)
  expect(result.page).toBe(0)
  expect(result.leads).toHaveLength(25)
})

it('batches contact reads without truncating searches and excludes contacts from another organisation', async () => {
  fixture.leads = Array.from({ length: 401 }, (_, i) => ({ ...makeLead(i), contact_id: `contact-${i}` }))
  fixture.contacts = fixture.leads.map((lead, i) => ({ contact_id: lead.contact_id, organisation_id: org, first_name: `Contact ${i}`, last_name: 'Buyer' }))
  fixture.contacts.push({ contact_id: 'contact-400', organisation_id: 'other-org', first_name: 'Outside', last_name: 'Contact' })
  const options = { category: 'buyer', filters: { search: 'Contact 400' }, includeRelatedRecords: false, pageSize: 25 }
  expect((await listAgencyLeadListRecords(org, options)).leads.map((lead) => lead.leadId)).toEqual(['lead-400'])
  expect(fixture.urls.filter((url) => url.pathname.endsWith('/contacts'))).toHaveLength(3)
  const requests = fixture.urls.length
  expect((await listAgencyLeadListRecords(org, { ...options, filters: { search: 'Outside Contact' } })).totalCount).toBe(0)
  expect(fixture.urls).toHaveLength(requests)
})

it('orders all category matches before paging, including a newer lead beyond the original page', async () => {
  fixture.leads = [...Array.from({ length: 55 }, (_, i) => makeLead(i)), { ...makeLead(99), updated_at: '2026-10-09T10:00:00Z' }]
  const result = await listAgencyLeadListRecords(org, { category: 'buyer', includeRelatedRecords: false, pageSize: 25 })
  expect(result.totalCount).toBe(56)
  expect(result.leads).toHaveLength(25)
  expect(result.leads[0].leadId).toBe('lead-99')
})

it('keeps complete category snapshots and their contacts isolated between agents', async () => {
  fixture.leads = [{ ...makeLead(1), lead_category: 'seller', contact_id: 'a-contact' }, { ...makeLead(2, b), lead_category: 'seller', contact_id: 'b-contact' }]
  fixture.contacts = [{ contact_id: 'a-contact', organisation_id: org, first_name: 'First' }, { contact_id: 'b-contact', organisation_id: org, first_name: 'Second' }]
  const options = { category: 'seller', includeRelatedRecords: false, pageSize: 25 }
  const first = await listAgencyLeadListRecords(org, { ...options, scopedAgent: a })
  const second = await listAgencyLeadListRecords(org, { ...options, scopedAgent: b })
  expect(first.leads.map((lead) => lead.leadId)).toEqual(['lead-1'])
  expect(second.leads.map((lead) => lead.leadId)).toEqual(['lead-2'])
  expect(first.metricLeads.map((lead) => lead.leadId)).toEqual(['lead-1'])
  expect(first.contacts.map((contact) => contact.contactId)).toEqual(['a-contact'])
  expect(second.contacts.map((contact) => contact.contactId)).toEqual(['b-contact'])
})
