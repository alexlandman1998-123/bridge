import { describe, expect, it, vi } from 'vitest'
const { calls, from } = vi.hoisted(() => ({ calls: [], from: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from } }))
import { getPrincipalDashboardData, clearPrincipalDashboardRuntimeCache } from '../principalDashboardService'

describe('principal dashboard seller onboarding source', () => {
  it('reads the current listing-owned rows and retains their commission calculation', async () => {
    calls.length = 0
    clearPrincipalDashboardRuntimeCache()
    from.mockImplementation((table) => {
      calls.push({ table })
      const rows = table === 'private_listings' ? [{ id: 'listing', organisation_id: 'agency', is_active: true, listing_status: 'active', listing_visibility: 'live', asking_price: 1000000 }]
        : table === 'private_listing_seller_onboarding' ? [{ private_listing_id: 'listing', form_data: { commissionPercentage: 10 } }] : []
      const query = { then: (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve) }
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = (...args) => { calls.push({table,method,args}); return query }
      return query
    })
    const result = await getPrincipalDashboardData({ organisationId: 'agency' })
    expect(calls.some((call) => call.table === 'seller_onboarding')).toBe(false)
    expect(calls).toContainEqual({ table: 'private_listing_seller_onboarding', method: 'in', args: ['private_listing_id', ['listing']] })
    expect(result.kpis.commissionForecast).toBe(100000)
  })
})
