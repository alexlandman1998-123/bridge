import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const { client } = vi.hoisted(() => ({ client: { from: vi.fn() } }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }))
import { createSellerOnboardingCoreResponse } from './sellerOnboardingCoreApi.js'

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.invalid')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only')
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllEnvs())
const row = { id: 'onboarding-a', private_listing_id: 'listing-a', token: 'legacy-a', seller_portal_token: 'stable-a', form_data: { sellerName: 'Owner' } }
function records(onboarding) {
  client.from.mockImplementation((table) => ({ select: () => ({ eq: (key, value) => ({ maybeSingle: async () => ({
    data: table === 'private_listing_seller_onboarding' ? (onboarding[key] === value ? onboarding : null)
      : table === 'private_listings' ? { id: 'listing-a', listing_status: 'seller_lead' } : null,
    error: null,
  }) }) }) }))
}
it.each(['', '&onboardingId=onboarding-a&listingId=listing-a'])('API rejects expired legacy tokens with or without ID hints: %s', async (hint) => {
  records({ ...row, token_expires_at: '2000-01-01T00:00:00Z' })
  const result = await createSellerOnboardingCoreResponse({ url: `/api/public/seller-onboarding-core?token=legacy-a${hint}` })
  expect(result.status).toBe(404)
  expect(client.from.mock.calls.every(([name]) => name === 'private_listing_seller_onboarding')).toBe(true)
})
it('valid exact token reads its record, strips credential hashes, and ignores unrelated IDs', async () => {
  records({ ...row, token_expires_at: '2999-01-01T00:00:00Z', seller_portal_password_hash: 'secret', seller_portal_recovery_token_hash: 'secret' })
  const result = await createSellerOnboardingCoreResponse({ url: '/api/public/seller-onboarding-core?token=legacy-a' })
  expect(result.status).toBe(200)
  expect(result.body.onboarding.form_data.sellerName).toBe('Owner')
  expect(JSON.stringify(result.body)).not.toContain('secret')
  expect((await createSellerOnboardingCoreResponse({ url: '/api/public/seller-onboarding-core?token=wrong&onboardingId=onboarding-a' })).status).toBe(404)
  expect((await createSellerOnboardingCoreResponse({ url: '/api/public/seller-onboarding-core?token=legacy-a&onboardingId=onboarding-a&listingId=other' })).status).toBe(404)
})
it('stable workspace link keeps its own lifecycle after legacy onboarding expires', async () => {
  records({ ...row, token_expires_at: '2000-01-01T00:00:00Z' })
  expect((await createSellerOnboardingCoreResponse({ url: '/api/public/seller-onboarding-core?token=stable-a' })).status).toBe(200)
})
