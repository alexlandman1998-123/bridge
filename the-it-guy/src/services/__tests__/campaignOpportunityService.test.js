import { beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ auth: { getUser: vi.fn() }, rpc: vi.fn(), from: vi.fn(), rows: {}, calls: [] }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: runtime }))
import { loadCampaignOpportunities } from '../campaignOpportunityService'

const now = '2026-10-25T08:00:00Z'
const listing = { id: 'listing', organisation_id: 'agency', assigned_agent_id: 'me', title: 'Garden apartment', suburb: 'Brooklyn', city: 'Pretoria', asking_price: 2500000, listing_status: 'active', is_active: true, listing_category: 'private_sale', created_at: now, updated_at: now }
beforeEach(() => {
  vi.clearAllMocks()
  runtime.calls = []
  runtime.rows = { private_listings: { data: [listing] }, marketing_events: { data: [] } }
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
  runtime.rpc.mockResolvedValue({ data: false })
  runtime.from.mockImplementation((table) => {
    const query = {}
    for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit']) query[method] = (...args) => { runtime.calls.push([table, method, ...args]); return query }
    query.then = (resolve, reject) => Promise.resolve(runtime.rows[table]).then(resolve, reject)
    return query
  })
})

it('reads bounded source projections under the checked user and agency scope without requiring setup', async () => {
  const result = await loadCampaignOpportunities('agency', 'me', { now })
  expect(result.items).toHaveLength(1)
  expect(Date.parse(result.checkedAt)).toBe(Date.parse(now))
  expect(runtime.auth.getUser).toHaveBeenCalledTimes(2)
  expect(runtime.rpc).toHaveBeenCalledWith('email_campaign_can_send', { p_organisation_id: 'agency' })
  expect(runtime.calls).toContainEqual(['private_listings', 'eq', 'organisation_id', 'agency'])
  expect(runtime.calls).toContainEqual(['private_listings', 'eq', 'assigned_agent_id', 'me'])
  expect(runtime.calls).toContainEqual(['private_listings', 'eq', 'is_active', true])
  expect(runtime.calls).toContainEqual(['private_listings', 'in', 'listing_status', ['active', 'listing_active', 'in_progress', 'mandate_signed', 'live', 'published']])
  expect(runtime.calls.find((call) => call[0] === 'private_listings' && call[1] === 'select')[2]).toContain('is_active')
  expect(runtime.calls).toContainEqual(['private_listings', 'limit', 200])
  expect(runtime.calls).toContainEqual(['marketing_events', 'limit', 100])
  expect(runtime.calls).toContainEqual(['marketing_events', 'eq', 'metadata->>visibility', 'public'])
  expect(runtime.calls).toContainEqual(['marketing_events', 'in', 'status', ['planning', 'upcoming']])
  expect(runtime.calls.filter((call) => call[1] === 'select').map((call) => call[2]).join(' ')).not.toMatch(/seller_|onboarding|address|email|phone/)
  expect(runtime.from).not.toHaveBeenCalledWith('marketing_campaign_setup')
})

it('allows agency-wide listing suggestions only after an affirmative permission check', async () => {
  runtime.rpc.mockResolvedValue({ data: true })
  runtime.rows.private_listings.data.push({ ...listing, id: 'other-owner', assigned_agent_id: 'colleague' })
  const result = await loadCampaignOpportunities('agency', 'me', { now })
  expect(result.items).toHaveLength(2)
  expect(runtime.calls).not.toContainEqual(['private_listings', 'eq', 'assigned_agent_id', 'me'])
})

it('drops foreign, other-agent and archived rows even if a source response includes them', async () => {
  runtime.rows.private_listings.data.push({ ...listing, id: 'foreign', organisation_id: 'other' }, { ...listing, id: 'other-owner', assigned_agent_id: 'colleague' }, { ...listing, id: 'archived', listing_visibility: 'archived' })
  const result = await loadCampaignOpportunities('agency', 'me', { now })
  expect(result.items.map((item) => item.listingId)).toEqual(['listing'])
})

it('excludes inactive or missing-active rows and preserves raw live/published status compatibility', async () => {
  runtime.rows.private_listings.data = [
    { ...listing, id: 'inactive', is_active: false },
    { ...listing, id: 'unknown', is_active: undefined },
    { ...listing, id: 'live', listing_status: 'live' },
    { ...listing, id: 'published', listing_status: 'published' },
    { ...listing, id: 'signed', listing_status: 'mandate_signed' },
  ]
  const result = await loadCampaignOpportunities('agency', 'me', { now })
  expect(result.items.map((item) => item.listingId).sort()).toEqual(['live', 'published', 'signed'])
})

it('preserves available work and reports unavailable event sources without an all-clear', async () => {
  runtime.rows.marketing_events = { error: { message: 'Unavailable' } }
  const result = await loadCampaignOpportunities('agency', 'me', { now })
  expect(result.items).toHaveLength(1)
  expect(result.sourceStates.events).toBe('unavailable')
  expect(result.warnings.join(' ')).toContain('Show days are unavailable')
  runtime.rows.private_listings = { error: { message: 'Unavailable' } }
  const empty = await loadCampaignOpportunities('agency', 'me', { now })
  expect(empty.items).toEqual([])
  expect(empty.warnings).toHaveLength(2)
})

it('does not start source reads when auth or permission checks fail', async () => {
  await expect(loadCampaignOpportunities('agency', 'other', { now })).rejects.toThrow('account changed')
  expect(runtime.from).not.toHaveBeenCalled()
  runtime.rpc.mockResolvedValue({ error: { message: 'Permission unavailable' } })
  await expect(loadCampaignOpportunities('agency', 'me', { now })).rejects.toThrow('Listing access could not be checked')
  expect(runtime.from).not.toHaveBeenCalled()
})

it('discards responses when the signed-in account changes during loading', async () => {
  runtime.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'me' } } }).mockResolvedValueOnce({ data: { user: { id: 'other' } } })
  await expect(loadCampaignOpportunities('agency', 'me', { now })).rejects.toThrow('account changed')
})

it('explains a capped sample instead of implying agency-wide completeness', async () => {
  runtime.rows.private_listings.data = Array.from({ length: 200 }, (_, i) => ({ ...listing, id: `listing-${i}` }))
  const result = await loadCampaignOpportunities('agency', 'me', { now })
  expect(result.items).toHaveLength(6)
  expect(result.warnings.join(' ')).toContain('200 most recently updated')
})

it('passes saved channel associations to opportunity suppression and preserves unavailable-channel warnings', async () => {
  const result = await loadCampaignOpportunities('agency', 'me', { now, emailCampaigns: [{ id: 'email', status: 'draft', ai_listing_id: 'listing', ai_objective: 'new_listing' }] })
  expect(result.items).toEqual([])
  const unavailable = await loadCampaignOpportunities('agency', 'me', { now, emailCampaignsAvailable: false })
  expect(unavailable.items).toHaveLength(1)
  expect(unavailable.sourceStates.emailCampaigns).toBe('unavailable')
  expect(unavailable.warnings.join(' ')).toContain('Email drafts are unavailable')
})
