import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ from: vi.fn(), rows: {}, queries: [], profileError: null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: fixture.from }) }))
import { createSellerOnboardingBrandingResponse } from './sellerOnboardingBrandingApi.js'

const env = { SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' }
beforeEach(() => {
  fixture.profileError = null
  fixture.queries = []
  fixture.rows = {
    private_listing_seller_onboarding: [{ private_listing_id: 'listing-a', token: 'legacy-a', seller_portal_token: 'stable-a' }],
    private_listings: [{ id: 'listing-a', organisation_id: 'org-a', assigned_agent_id: 'agent-a', listing_status: 'seller_lead' }],
    organisations: [{ id: 'org-a', name: 'Kingdom' }],
    organisation_settings: [],
    profiles: [{ id: 'agent-a', full_name: 'Kevin Croft', email: 'private@example.test' }],
  }
  fixture.from.mockImplementation(table => {
    const call = { table, select: '', filters: [] }
    fixture.queries.push(call)
    const query = {
      select(columns) { call.select = columns; return query },
      eq(key, value) { call.filters.push([key, value]); return query },
      maybeSingle: async () => ({
        data: (fixture.rows[table] || []).find(row => call.filters.every(([key, value]) => row[key] === value)) || null,
        error: table === 'profiles' ? fixture.profileError : null,
      }),
    }
    return query
  })
})

it.each(['legacy-a', 'stable-a'])('resolves only the listing-assigned agent for the existing token %s', async token => {
  const result = await createSellerOnboardingBrandingResponse({ env, url: `/api/public/seller-onboarding-branding?token=${token}` })
  expect(result.status).toBe(200)
  expect(result.body.branding).toMatchObject({ organisationName: 'Kingdom', agentName: 'Kevin Croft' })
  expect(fixture.queries.find(query => query.table === 'profiles')).toEqual({
    table: 'profiles', select: 'full_name, first_name, last_name', filters: [['id', 'agent-a']],
  })
  expect(JSON.stringify(result.body)).not.toContain('private@example.test')
})

it('uses profile first and last name when the full-name alias is empty', async () => {
  fixture.rows.profiles = [{ id: 'agent-a', full_name: ' ', first_name: 'Kevin', last_name: 'Croft' }]
  const result = await createSellerOnboardingBrandingResponse({ env, url: '/api/public/seller-onboarding-branding?token=stable-a' })
  expect(result.body.branding.agentName).toBe('Kevin Croft')
})

it('optional profile failure leaves agency branding available', async () => {
  fixture.profileError = { code: '42703', message: 'optional profile field unavailable' }
  const result = await createSellerOnboardingBrandingResponse({ env, url: '/api/public/seller-onboarding-branding?token=stable-a' })
  expect(result.status).toBe(200)
  expect(result.body.branding.agentName).toBe('')
})

it.each(['invalid-token', 'inactive-listing'])('does not read an agent profile for %s', async token => {
  if (token === 'inactive-listing') {
    fixture.rows.private_listing_seller_onboarding[0].seller_portal_token = token
    fixture.rows.private_listings[0].listing_status = 'withdrawn'
  }
  const result = await createSellerOnboardingBrandingResponse({ env, url: `/api/public/seller-onboarding-branding?token=${token}` })
  expect(result.status).toBe(404)
  expect(fixture.queries.some(query => query.table === 'profiles')).toBe(false)
})
