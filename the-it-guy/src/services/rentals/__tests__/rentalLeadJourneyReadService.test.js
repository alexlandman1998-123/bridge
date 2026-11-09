import { beforeEach, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
vi.mock('../../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: false, supabase: null }))
import { enrichRentalLeadJourneyViews } from '../rentalLeadJourneyReadService.js'
import { tenantJourneyStage, projectRentalLeadJourney } from '../rentalLeadJourneyProjection.js'
import { buildRentalLeadKanbanColumns, filterRentalLeadList, rentalLeadListSummary } from '../rentalLeadListModel.js'

let requests, applications, conversions, failure, db
const lead = (id = 'lead', patch = {}) => ({ id, role: 'tenant', stage: 'new', savedStage: 'new', stageLabel: 'New', outcome: { status: 'open' }, ...patch })
beforeEach(() => {
  requests = []; applications = []; conversions = []; failure = false
  db = createClient('http://localhost:55555', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async input => {
    const url = new URL(String(input)); requests.push(url)
    if (failure) return new Response(JSON.stringify({ message: 'Access unavailable' }), { status: 403 })
    const data = url.pathname.endsWith('/rental_applications') ? applications : conversions
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Number(url.searchParams.get('limit') || 1000)
    return new Response(JSON.stringify(data.slice(offset, offset + limit)), { headers: { 'Content-Type': 'application/json' } })
  } } })
})

it.each([
  ['draft', '2026-11-09T07:00:00Z', [], 'application_pending', 4],
  ['submitted', null, [], 'application_submitted', 5],
  ['approved', null, [{ id: 'tenancy', status: 'draft', rental_leases: [{ id: 'lease', status: 'draft' }] }], 'lease', 6],
  ['approved', null, [{ id: 'tenancy', status: 'active', rental_leases: [{ id: 'lease', status: 'active' }] }], 'tenancy', 7],
])('aligns the board with %s application/tenancy evidence without changing the saved milestone', async (status, sentAt, tenancies, expected, journeyIndex) => {
  applications = [{ id: 'app', organisation_id: 'org', lead_id: 'lead', status, onboarding_sent_at: sentAt }]
  conversions = tenancies.map(row => ({ ...row, organisation_id: 'org', source_application_id: 'app' }))
  const original = lead()
  const [row] = await enrichRentalLeadJourneyViews('org', [original], { client: db })
  expect(row).toMatchObject({ stage: 'new', savedStage: 'new', journeyStage: expected, journeyAhead: true })
  expect(original.journeyStage).toBeUndefined()
  expect(tenantJourneyStage(original, tenancies, [{ status, data: { onboarding: { sentAt } } }])).toBe(journeyIndex)
  expect(buildRentalLeadKanbanColumns([row], 'tenant').find(column => column.stage === expected).cards).toEqual([row])
  expect(filterRentalLeadList([row], { role: 'tenant', stage: expected })).toEqual([row])
  expect(filterRentalLeadList([row], { role: 'tenant', stage: 'new' })).toEqual([])
  expect(rentalLeadListSummary([row]).newLeads).toBe(0)
  expect(requests).toHaveLength(2)
  expect(requests.every(url => url.searchParams.get('organisation_id') === 'eq.org')).toBe(true)
  expect(requests[0].searchParams.get('select')).toContain('onboarding_sent_at:application_data->onboarding->>sentAt')
  expect(requests[0].searchParams.get('select')).not.toMatch(/application_data(?:,|$)|token|documents/)
})

it('leaves unshared drafts, landlord stages, review-needed records and existing closed outcomes intact', async () => {
  applications = [{ id: 'app', organisation_id: 'org', lead_id: 'lead', status: 'draft' }]
  const rows = [lead(), lead('landlord', { role: 'landlord', stage: 'mandate_pending', savedStage: 'mandate_pending' }), lead('unknown', { stage: 'vendor_stage', savedStage: 'vendor_stage', workflowIssue: 'Review saved stage' })]
  expect(await enrichRentalLeadJourneyViews('org', rows, { client: db })).toEqual(rows)
  const closed = projectRentalLeadJourney(lead('closed', { outcome: { status: 'won' } }), { applications: [{ status: 'submitted' }] })
  expect(buildRentalLeadKanbanColumns([closed], 'tenant').flatMap(column => column.cards)).toEqual([])
  expect(buildRentalLeadKanbanColumns([closed], 'closed').flatMap(column => column.cards)).toEqual([closed])
})

it('does not read other organisations or use another lead application as progress evidence', async () => {
  applications = [{ id: 'foreign', organisation_id: 'other', lead_id: 'lead', status: 'approved' }, { id: 'unrelated', organisation_id: 'org', lead_id: 'not-visible', status: 'submitted' }]
  const original = lead()
  expect(await enrichRentalLeadJourneyViews('org', [original], { client: db })).toEqual([original])
  expect(requests).toHaveLength(1)
  expect(requests[0].searchParams.get('lead_id')).toContain('lead')
})

it('skips all evidence reads for a landlord-only or empty list', async () => {
  expect(await enrichRentalLeadJourneyViews('org', [], { client: db })).toEqual([])
  await enrichRentalLeadJourneyViews('org', [lead('owner', { role: 'landlord' })], { client: db })
  expect(requests).toEqual([])
})

it('paginates application evidence instead of losing the final submitted application', async () => {
  applications = Array.from({ length: 1001 }, (_, index) => ({ id: `app-${index}`, organisation_id: 'org', lead_id: 'lead', status: index === 1000 ? 'submitted' : 'draft' }))
  const [row] = await enrichRentalLeadJourneyViews('org', [lead()], { client: db })
  expect(row.journeyStage).toBe('application_submitted')
  expect(requests.filter(url => url.pathname.endsWith('/rental_applications'))).toHaveLength(2)
  expect(requests.some(url => url.searchParams.get('offset') === '1000')).toBe(true)
})

it('reports failed evidence reads instead of pretending the stale stage is current', async () => {
  failure = true
  await expect(enrichRentalLeadJourneyViews('org', [lead()], { client: db })).rejects.toThrow('Rental journey progress could not be loaded')
})
