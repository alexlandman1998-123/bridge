import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { getSession: mocks.session }, from: mocks.from, rpc: mocks.rpc } }))
import { aiCampaignAction, aiCampaignDocument, reviewAiCampaign, approveAiCampaign } from '../aiCampaignService'
beforeEach(() => {
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'user-session' } } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
it('passes cancellation to the request and fixes agency/action outside user input', async () => {
  const controller = new AbortController()
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ requestId: 'request', copy: {} }) })
  vi.stubGlobal('fetch', request)
  await aiCampaignAction('agency', 'generate', { organisationId: 'other-agency', action: 'send', targetField: 'intro' }, { signal: controller.signal })
  const [url, init] = request.mock.calls[0]
  expect(url).toBe('/api/marketing/ai-campaign')
  expect(init.signal).toBe(controller.signal)
  expect(JSON.parse(init.body)).toMatchObject({ organisationId: 'agency', action: 'generate', targetField: 'intro' })
  expect(init.headers.Authorization).toBe('Bearer user-session')
})
it('retains stale-result and metering context on a recoverable API error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'Campaign changed', code: 'CAMPAIGN_CHANGED', usageId: 'usage', requestId: 'request' }) }))
  await expect(aiCampaignAction('agency', 'generate')).rejects.toMatchObject({ message: 'Campaign changed', status: 409, code: 'CAMPAIGN_CHANGED', usageId: 'usage', requestId: 'request' })
})
it('already cancelled requests never read auth or contact the API', async () => {
  const controller = new AbortController(); controller.abort()
  const request = vi.fn(); vi.stubGlobal('fetch', request)
  await expect(aiCampaignAction('agency', 'generate', {}, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(request).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled()
})
it('persists only authoritative source provenance and confirmed event for freshness checks', () => {
  const listing = { id: 'listing', organisation_id: 'agency', asking_price: '2000000', is_active: true, listing_status: 'active', updated_at: '2026-10-25T10:00:00Z', title: 'Home' }
  const event = { start: '2030-01-01T10:00:00+02:00', end: '2030-01-01T12:00:00+02:00' }
  const document = aiCampaignDocument({ listing, event, copy: { heading: 'Discover this home', intro: 'Arrange a viewing.', cta: 'View property', source_snapshot: { asking_price: 1 } }, brand: {}, objective: 'show_day', language: 'en', usageId: 'usage' })
  expect(document.ai_campaign.source_snapshot).toEqual({ version: 1, listing_id: 'listing', organisation_id: 'agency', asking_price: '2000000', is_active: true, listing_status: 'active', updated_at: '2026-10-25T10:00:00Z' })
  expect(document.ai_campaign.event).toEqual(event)
})
function sourceFixture(listingChange = {}, campaignChange = {}) {
  const listing = { id: '00000000-0000-4000-8000-000000000003', organisation_id: '00000000-0000-4000-8000-000000000001', asking_price: 2000000, is_active: true, listing_status: 'active', ...listingChange }
  const snapshot = { version: 1, listing_id: listing.id, organisation_id: listing.organisation_id, asking_price: 2000000, is_active: true, listing_status: 'active' }
  const campaign = { id: 'campaign', organisation_id: listing.organisation_id, content_json: { ai_campaign: { objective: 'new_listing', listing_id: listing.id, source_snapshot: snapshot } }, ...campaignChange }
  const filters = []
  mocks.from.mockImplementation((table) => {
    const query = { select: () => query, eq: (key, value) => { filters.push({ table, key, value }); return query }, maybeSingle: async () => ({ data: table === 'email_campaigns' ? campaign : listing }) }
    return query
  })
  mocks.rpc.mockResolvedValue({ data: { token: 'review-token' } })
  return { filters, listing }
}
it('checks current listing in the saved agency before issuing a review token', async () => {
  const { filters, listing } = sourceFixture()
  await expect(reviewAiCampaign('campaign', '2030-01-01T10:00:00Z')).resolves.toEqual({ token: 'review-token' })
  expect(filters).toContainEqual({ table: 'private_listings', key: 'organisation_id', value: listing.organisation_id })
  expect(filters).toContainEqual({ table: 'private_listings', key: 'id', value: listing.id })
  expect(mocks.rpc).toHaveBeenCalledWith('ai_campaign_review', { p_campaign: 'campaign', p_send_at: '2030-01-01T10:00:00Z' })
})
it('changed price or missing legacy source prevents review and approval before RPC', async () => {
  sourceFixture({ asking_price: 2100000 })
  await expect(reviewAiCampaign('campaign', '2030-01-01T10:00:00Z')).rejects.toMatchObject({ code: 'source_price_changed' })
  await expect(approveAiCampaign('campaign', { token: 'old', send_at: '2030-01-01T10:00:00Z' })).rejects.toMatchObject({ code: 'source_price_changed' })
  expect(mocks.rpc).not.toHaveBeenCalled()
  sourceFixture({}, { content_json: { ai_campaign: { listing_id: 'listing', objective: 'new_listing' } } })
  await expect(reviewAiCampaign('campaign', '2030-01-01T10:00:00Z')).rejects.toMatchObject({ code: 'source_review_required' })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
