import { describe, expect, it, vi } from 'vitest'
const { calls, from } = vi.hoisted(() => ({ calls: [], from: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from } }))
import { getPrincipalDashboardData, clearPrincipalDashboardRuntimeCache } from '../principalDashboardService'

describe('principal dashboard seller onboarding source', () => {
  it('uses the same active listing definition as company and branch reporting', async () => {
    clearPrincipalDashboardRuntimeCache()
    const listings = ['active', 'under_offer', 'seller_lead', 'onboarding_completed', 'sold', 'withdrawn'].map((status, index) => ({ id: `stock-${index}`, organisation_id: 'agency', listing_status: status }))
    listings.push({ id: 'qa-stock', organisation_id: 'agency', listing_status: 'active', is_demo_data: true })
    from.mockImplementation(table => {
      const query = { then: resolve => Promise.resolve({ data: table === 'private_listings' ? listings : [], error: null }).then(resolve) }
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = () => query
      return query
    })
    const result = await getPrincipalDashboardData({ organisationId: 'agency', forceRefresh: true })
    expect(result.kpis.activeListings).toBe(2)
  })
  it('preserves the latest saved zero commission instead of using a stale amount or a percentage', async () => {
    clearPrincipalDashboardRuntimeCache()
    from.mockImplementation(table => {
      const data = table === 'transactions' ? [{ id: 'real', organisation_id: 'agency', current_main_stage: 'OTP', sales_price: 1600000, gross_commission_amount: 100000 }]
        : table === 'transaction_commissions' ? [{ id: 'old', transaction_id: 'real', gross_commission_amount: 100000, updated_at: '2026-11-01' }, { id: 'current', transaction_id: 'real', gross_commission_amount: 0, updated_at: '2026-11-15' }] : []
      const query = { then: resolve => Promise.resolve({ data, error: null }).then(resolve) }
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = () => query
      return query
    })
    const result = await getPrincipalDashboardData({ organisationId: 'agency', forceRefresh: true })
    expect(result.kpis.commissionForecast).toBe(0)
  })
  it('excludes synthetic finance deals and onboarding placeholders from the real company dashboard', async () => {
    clearPrincipalDashboardRuntimeCache()
    const transactions = [
      { id: 'real-one', organisation_id: 'agency', current_main_stage: 'OTP', sales_price: 1240000, is_active: true },
      { id: 'real-two', organisation_id: 'agency', current_main_stage: 'OTP', sales_price: 1600000, is_active: true },
      { id: 'qa', organisation_id: 'agency', current_main_stage: 'FIN', sales_price: 1000000, is_active: true, is_demo_data: true },
      { id: 'pending', organisation_id: 'agency', current_main_stage: 'AVAIL', stage: 'Available', sales_price: 875000, is_active: true },
    ]
    from.mockImplementation(table => {
      const query = { then: resolve => Promise.resolve({ data: table === 'transactions' ? transactions : [], error: null }).then(resolve) }
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = () => query
      return query
    })
    const result = await getPrincipalDashboardData({ organisationId: 'agency', forceRefresh: true })
    expect(JSON.stringify(result)).not.toContain('"qa"')
    expect(result.activeTransactions).toHaveLength(2)
    expect(result.kpis.pipelineValue).toBe(2840000)
    expect(result.kpis.commissionForecast).toBeNull()
  })
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
    expect(result.kpis.listingStockCommissionForecast).toBe(100000)
    expect(result.kpis.commissionForecast).toBe(0)
  })
})
