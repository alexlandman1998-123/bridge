import { createContactProvenance } from '../campaignContactProvenance'
import { beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ auth: { getUser: vi.fn() }, from: vi.fn(), source: vi.fn(), calls: [], campaign: null, latest: null, event: null }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: runtime }))
vi.mock('../justListedCampaignService', () => ({ loadJustListedSource: runtime.source }))
import { loadCampaignReadiness } from '../campaignReadinessService'

const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
const now = '2026-10-25T08:00:00Z'
const source = { title: 'Garden apartment', price: 'R 2 500 000', location: 'Brooklyn, Pretoria', agencyName: 'Oak', agentName: 'Alex', destination: 'alex@example.test', language: 'en-ZA', imageId: 'cover', listingUpdatedAt: now }
const builder = { version: 1, template: 'new-listing', listingId: id(1), agentId: id(2), source, contactProvenance: { ...createContactProvenance(source), confirmed: true } }
const campaign = { id: 'campaign', organisation_id: 'agency', revision: 3, status: 'draft', planned_channels: ['email'], listing_builder: builder, channel_content: { email: { title: 'Garden apartment', body: 'Book a viewing.' } } }
const current = { listingId: id(1), agentId: id(2), listingStatus: 'active', source, images: [{ id: 'cover', url: 'https://example.test/photo.jpg' }] }

beforeEach(() => {
  vi.clearAllMocks()
  runtime.calls = []
  runtime.campaign = { data: campaign }
  runtime.latest = { data: { revision: campaign.revision } }
  runtime.event = { data: null }
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
  runtime.source.mockResolvedValue(current)
  runtime.from.mockImplementation((table) => {
    let selected = ''
    const query = {}
    for (const method of ['select', 'eq', 'in']) query[method] = (...args) => { runtime.calls.push([table, method, ...args]); if (method === 'select') selected = args[0]; return query }
    query.maybeSingle = async () => table === 'marketing_events' ? runtime.event : selected === 'revision' ? runtime.latest : runtime.campaign
    return query
  })
})

it('refreshes only a saved campaign and its authorised selected listing with exact check times', async () => {
  const result = await loadCampaignReadiness('agency', 'me', campaign, { now })
  expect(result.readyToPrepare).toBe(true)
  expect(result.sourceCheckedAt).toBe(new Date(now).toISOString())
  expect(result.checkedAt).toBe(new Date(now).toISOString())
  expect(result.eventCheckedAt).toBe(null)
  expect(runtime.source).toHaveBeenCalledWith('agency', 'me', id(1), { listings: [{ id: id(1) }] }, 'new-listing')
  expect(runtime.calls).toContainEqual(['marketing_campaigns', 'eq', 'organisation_id', 'agency'])
  expect(runtime.calls).toContainEqual(['marketing_campaigns', 'eq', 'id', 'campaign'])
  expect(runtime.from).not.toHaveBeenCalledWith('marketing_events')
  expect(runtime.auth.getUser).toHaveBeenCalledTimes(2)
})

it('loads collection members serially and avoids an unbounded listing picker', async () => {
  const additionalListings = [3, 4].map((n) => ({ listingId: id(n), agentId: id(2), source, contactProvenance: { ...createContactProvenance(source), confirmed: true } }))
  runtime.campaign = { data: { ...campaign, listing_builder: { ...builder, version: 2, template: 'property-collection', settings: {}, additionalListings } } }
  let concurrent = 0, highest = 0
  runtime.source.mockImplementation(async (_org, _user, listingId) => {
    concurrent += 1
    highest = Math.max(highest, concurrent)
    await Promise.resolve()
    concurrent -= 1
    return { ...current, listingId }
  })
  const result = await loadCampaignReadiness('agency', 'me', campaign, { now })
  expect(result.blockers).toEqual([])
  expect(runtime.source).toHaveBeenCalledTimes(3)
  expect(highest).toBe(1)
  expect(runtime.from).not.toHaveBeenCalledWith('private_listings')
})

it('preserves a useful blocked review when a listing source fails instead of treating it as empty facts', async () => {
  runtime.source.mockRejectedValue(new Error('This listing is no longer assigned to you.'))
  const result = await loadCampaignReadiness('agency', 'me', campaign, { now })
  expect(result.sourceState).toBe('unavailable')
  expect(result.sourceError).toContain('no longer assigned')
  expect(result.sourceCheckedAt).toBe(null)
  expect(result.readyToPrepare).toBe(false)
  expect(result.checks.find((item) => item.id === 'source').status).toBe('blocked')
})

it('looks up one exact public event and exposes its separate source check time', async () => {
  const settings = { eventId: id(9), date: '2026-10-27', startTime: '10:00', endTime: '12:00' }
  runtime.campaign = { data: { ...campaign, listing_builder: { ...builder, version: 2, template: 'show-day', settings } } }
  runtime.event = { data: { id: id(9), organisation_id: 'agency', subject_type: 'listing', subject_id: id(1), status: 'planning', starts_at: '2026-10-27T08:00:00Z', ends_at: '2026-10-27T10:00:00Z', metadata: { visibility: 'public' }, updated_at: now } }
  const result = await loadCampaignReadiness('agency', 'me', campaign, { now })
  expect(result.eventState).toBe('available')
  expect(result.eventCheckedAt).toBe(new Date(now).toISOString())
  expect(result.checks.find((item) => item.id === 'event').status).toBe('ready')
  expect(runtime.calls).toContainEqual(['marketing_events', 'eq', 'id', id(9)])
  expect(runtime.calls).toContainEqual(['marketing_events', 'eq', 'metadata->>visibility', 'public'])
  expect(runtime.calls).toContainEqual(['marketing_events', 'eq', 'subject_id', id(1)])
  expect(runtime.calls).toContainEqual(['marketing_events', 'in', 'status', ['planning', 'upcoming']])
})

it('distinguishes an event no longer public from a failed event source', async () => {
  runtime.campaign = { data: { ...campaign, listing_builder: { ...builder, version: 2, template: 'show-day', settings: { eventId: id(9), date: '2026-10-27', startTime: '10:00', endTime: '12:00' } } } }
  const missing = await loadCampaignReadiness('agency', 'me', campaign, { now })
  expect(missing.eventState).toBe('available')
  expect(missing.checks.find((item) => item.id === 'event').detail).toContain('no longer public')
  runtime.event = { error: { message: 'Offline' } }
  const failed = await loadCampaignReadiness('agency', 'me', campaign, { now })
  expect(failed.eventState).toBe('unavailable')
  expect(failed.eventError).toContain('could not be refreshed')
  expect(failed.eventCheckedAt).toBe(null)
})

it('rejects stale or foreign campaigns before any listing source is requested', async () => {
  await expect(loadCampaignReadiness('agency', 'me', { ...campaign, revision: 2 }, { now })).rejects.toThrow('campaign changed')
  runtime.campaign = { data: { ...campaign, organisation_id: 'foreign' } }
  await expect(loadCampaignReadiness('agency', 'me', campaign, { now })).rejects.toThrow('no longer available')
  expect(runtime.source).not.toHaveBeenCalled()
})

it('rejects an account or campaign revision changed during a source check', async () => {
  runtime.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'me' } } }).mockResolvedValueOnce({ data: { user: { id: 'other' } } })
  await expect(loadCampaignReadiness('agency', 'me', campaign, { now })).rejects.toThrow('account changed')
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
  runtime.latest = { data: { revision: 4 } }
  await expect(loadCampaignReadiness('agency', 'me', campaign, { now })).rejects.toThrow('changed while its sources were checked')
})

it('keeps campaigns without linked listings useful and never starts source reads for them', async () => {
  runtime.campaign = { data: { ...campaign, listing_builder: null } }
  const result = await loadCampaignReadiness('agency', 'me', campaign, { now })
  expect(result.readyToPrepare).toBe(true)
  expect(result.checks.find((item) => item.id === 'source').status).toBe('review')
  expect(runtime.source).not.toHaveBeenCalled()
})
