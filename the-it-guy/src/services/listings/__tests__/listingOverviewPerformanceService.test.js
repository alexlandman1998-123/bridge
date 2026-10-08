import { beforeEach, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))
import { buildListingOverviewPerformance, normalizeListingOverviewAnalytics, getListingOverviewAnalytics, getSellerListingOverviewPerformance, getSellerListingOverviewContext, resolveListingOverviewMarketStartDate, getListingOverviewDaysOnMarket } from '../listingOverviewPerformanceService.js'

beforeEach(() => rpc.mockReset())

it('loads only the session-authorised agent and activity context', async () => {
  const args = { token: 'link', accessToken: 'session', listingId: 'listing' }
  rpc.mockResolvedValueOnce({ data: { listingId: 'other', agent: { name: 'Other agent' } } })
  await expect(getSellerListingOverviewContext(args)).rejects.toThrow('scope mismatch')
  rpc.mockResolvedValueOnce({ data: { listingId: 'listing', agent: { name: 'Assigned agent' }, activity: [] } })
  expect((await getSellerListingOverviewContext(args)).agent.name).toBe('Assigned agent')
  expect(rpc).toHaveBeenLastCalledWith('bridge_seller_listing_overview_context', { p_token: 'link', p_access_token: 'session' })
})

it('aborts a stalled overview request and allows the next refresh to succeed', async () => {
  vi.useFakeTimers()
  try {
    rpc.mockReturnValueOnce({ abortSignal(signal) {
      return new Promise((resolve) => signal.addEventListener('abort', () => resolve({ error: { code: 'ABORTED' } })))
    } })
    const args = { token: 'link', accessToken: 'session', listingId: 'listing' }
    const failure = expect(getSellerListingOverviewContext(args)).rejects.toEqual({ code: 'ABORTED' })
    await vi.advanceTimersByTimeAsync(15_000)
    await failure
    rpc.mockResolvedValueOnce({ data: { listingId: 'listing', activity: [] } })
    expect((await getSellerListingOverviewContext(args)).listingId).toBe('listing')
  } finally {
    vi.useRealTimers()
  }
})

it('deduplicates buyers and counts the same active and upcoming viewings for either portal', () => {
  const now = new Date('2026-10-03T10:00:00')
  const performance = buildListingOverviewPerformance({ now,
    leads: [{ id: '1', email: 'Buyer@example.com', createdAt: '2026-10-01' }, { id: '2', email: 'buyer@example.com', createdAt: '2026-10-02' }, { id: '3', createdAt: '2026-09-01' }],
    viewings: [{ status: 'confirmed', proposed_date: '2026-10-04', proposed_time: '10:00' }, { status: 'completed' }, { status: 'cancelled' }, { status: 'declined' }, { status: 'pending_approval', proposed_date: '2026-09-01', proposed_time: '10:00' }],
  })
  expect(performance).toMatchObject({ leadCount: 2, newThisWeek: 1, scheduledViewings: 3, upcomingViewings: 1, completedViewings: 1, totalViews: null })
})

it('uses the saved market date without inventing a date from record creation', () => {
  expect(resolveListingOverviewMarketStartDate({ created_at: '2026-01-01' })).toBe('')
  const date = resolveListingOverviewMarketStartDate({ published_at: '2026-09-01' }, { listingDate: '2026-10-01' })
  expect(getListingOverviewDaysOnMarket(date, new Date('2026-10-03T00:00:00Z'))).toBe(2)
  expect(getListingOverviewDaysOnMarket('invalid')).toBe(0)
})

it('requires a seller session and verifies the returned listing scope', async () => {
  await expect(getSellerListingOverviewPerformance({ token: 'link', listingId: 'listing' })).rejects.toThrow()
  expect(rpc).not.toHaveBeenCalled()
  rpc.mockResolvedValue({ data: { listingId: 'other' } })
  await expect(getSellerListingOverviewPerformance({ token: 'link', accessToken: 'session', listingId: 'listing' })).rejects.toThrow('scope mismatch')
})

it('returns real zero counts and permits retry after a temporary failure', async () => {
  const args = { token: 'link', accessToken: 'session', listingId: 'listing' }
  rpc.mockResolvedValueOnce({ error: { code: '57014' } }).mockResolvedValueOnce({ data: { listingId: 'listing', leads: [], viewings: [] } })
  await expect(getSellerListingOverviewPerformance(args)).rejects.toEqual({ code: '57014' })
  const result = await getSellerListingOverviewPerformance(args)
  expect(result.available).toBe(true)
  expect(buildListingOverviewPerformance(result).leadCount).toBe(0)
  expect(rpc).toHaveBeenLastCalledWith('bridge_seller_listing_marketing_performance', { p_token: 'link', p_access_token: 'session' })
})

it('preserves channel metrics, coverage, pending refreshes and website tracking timestamps', () => {
  const result = normalizeListingOverviewAnalytics({period:{startDate:'2026-10-01',endDate:'2026-10-07',days:7,timeZone:'Africa/Johannesburg',completedDaysOnly:true},privateProperty:{connected:true,available:true,views:0,complete:false,metrics:{views:{value:0,available:true,complete:false,coveredDays:1,expectedDays:7},phoneContacts:{value:null,available:false}},lastAttempt:{status:'partial',pendingCount:1},dataThrough:'2026-10-06'},website:{available:true,views:8,lastTrackedAt:'2026-10-07T20:00:00Z',metrics:{enquiries:{value:0,available:true}}}})
  expect(result.privateProperty).toMatchObject({views:0,metrics:{views:{value:0},phoneContacts:{value:null}},lastAttempt:{pendingCount:1},dataThrough:'2026-10-06'})
  expect(result.website).toMatchObject({lastSyncedAt:'',lastTrackedAt:'2026-10-07T20:00:00Z',metrics:{enquiries:{value:0}}})
  expect(result.period).toMatchObject({completedDaysOnly:true,days:7})
})

it('includes Private Property views and does not report changes from incomplete coverage', () => {
  const result = buildListingOverviewPerformance({analytics:{property24:{connected:true,available:true,complete:true,views:10,previousViews:5},privateProperty:{connected:true,available:true,complete:false,views:20,previousViews:10},website:{connected:true,available:false}}})
  expect(result).toMatchObject({totalViews:30,privatePropertyViews:20,partialViews:true,priorViews:null,viewChangePercent:null})
  expect(result).toMatchObject({property24Views:10,websiteViews:null,channels:{property24:{views:10},privateProperty:{views:20}}})
  expect(result).not.toHaveProperty('portalViews')
  expect(result).not.toHaveProperty('bridgeViews')
})

it('requests the selected period under the current organisation and listing', async () => {
  rpc.mockResolvedValueOnce({data:{windowDays:90,privateProperty:{connected:true,available:true,views:0}}})
  const data = await getListingOverviewAnalytics({organisationId:'org',listingId:'listing',days:90})
  expect(rpc).toHaveBeenCalledWith('listing_overview_performance',{p_organisation_id:'org',p_listing_id:'listing',p_days:90})
  expect(data.privateProperty.views).toBe(0)
})
