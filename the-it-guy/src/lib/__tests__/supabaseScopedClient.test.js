import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('isolates token-scoped portal Auth locks from agent sessions and other capabilities', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://scoped-client-test.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_scope_test')
  const { supabase, createScopedSupabaseClient } = await import('../supabaseClient.js')
  const buyer = createScopedSupabaseClient({ 'x-bridge-client-portal-token': 'private-buyer-capability' })
  const seller = createScopedSupabaseClient({ 'x-bridge-seller-portal-token': 'private-seller-capability' })
  expect(buyer.auth.storageKey).toMatch(/^arch9:scoped-auth:/)
  expect(new Set([supabase.auth.storageKey, buyer.auth.storageKey, seller.auth.storageKey]).size).toBe(3)
  expect(buyer.auth.storageKey).not.toContain('private-buyer-capability')
  expect(seller.auth.storageKey).not.toContain('private-seller-capability')
  expect(createScopedSupabaseClient({ 'x-bridge-client-portal-token': 'private-buyer-capability' })).toBe(buyer)
  expect((await buyer.auth.getSession()).data.session).toBeNull()
  expect((await seller.auth.getSession()).data.session).toBeNull()
  await supabase.auth.stopAutoRefresh()
})
