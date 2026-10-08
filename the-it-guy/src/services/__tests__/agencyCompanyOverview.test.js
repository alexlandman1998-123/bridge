import { createClient } from '@supabase/supabase-js'
import { beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ client: null, settings: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: (...args) => api.client.from(...args) } }))
vi.mock('../../lib/settingsApi', () => ({ fetchOrganisationSettings: api.settings }))
import { buildAgencyBranchOverview, getAgencyBranchOverview, __agencyBranchServiceTestUtils as utils } from '../agencyBranchService'

const ORG = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const now = new Date('2026-10-08T12:00:00Z')
const listing = (id, extra = {}) => ({ id, organisation_id: ORG, branch_id: 'branch-a', listing_category: 'private_sale', listing_status: 'active', asking_price: 1000000, created_at: '2026-09-15T10:00:00Z', ...extra })
let requests

function database(rows = {}, errorFor = () => null) {
  return createClient('https://company.example.test', 'fixture-public-key', { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(input)
    const table = url.pathname.split('/').at(-1)
    requests.push(url)
    const error = errorFor(table, url.searchParams.get('select'))
    if (error) return new Response(JSON.stringify(error), { status: 400, headers: { 'Content-Type': 'application/json' } })
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Number(url.searchParams.get('limit') || 500)
    const data = (rows[table] || []).filter((row) => row.organisation_id === url.searchParams.get('organisation_id')?.replace('eq.', '')).slice(offset, offset + limit)
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } } })
}

beforeEach(() => {
  requests = []
  api.settings.mockResolvedValue({ organisation: { id: ORG, type: 'agency' }, profile: { id: ORG, role: 'agent' }, membershipRole: 'owner', membershipStatus: 'active', membershipBranchScope: 'all_branches' })
  api.client = database()
})

it('recovers a missing optional listing column instead of returning false zero listings', async () => {
  const client = database({ private_listings: [listing('one')] }, (table, columns) => table === 'private_listings' && columns.includes('estimated_value') ? { code: '42703', message: 'column private_listings.estimated_value does not exist' } : null)
  const rows = await utils.listOrganisationPrivateListings(client, ORG)
  expect(rows).toHaveLength(1)
  expect(requests).toHaveLength(2)
  expect(requests[1].searchParams.get('select')).toContain('listing_category')
})

it('queries columns present in production without the obsolete mandate expiry and transaction status', async () => {
  await utils.listOrganisationPrivateListings(database(), ORG)
  await utils.listOrganisationTransactions(database(), ORG)
  expect(requests[0].searchParams.get('select')).not.toContain('mandate_expiry_date')
  expect(requests[1].searchParams.get('select').split(',')).not.toContain('status')
})

it('recovers optional transaction columns and preserves transaction value', async () => {
  const client = database({ transactions: [{ id: 'tx', organisation_id: ORG, sales_price: 700000, lifecycle_state: 'offer' }] }, (_, columns) => columns.includes('gross_commission') ? { code: '42703', message: 'column gross_commission_amount does not exist' } : null)
  expect((await utils.listOrganisationTransactions(client, ORG))[0].sales_price).toBe(700000)
  expect(requests).toHaveLength(3)
})

it.each(['42P01', '42501', 'PGRST205'])('reports required table/read failures (%s) instead of zero totals', async (code) => {
  api.client = database({}, (table) => table === 'private_listings' ? { code, message: 'Company data is unavailable' } : null)
  await expect(getAgencyBranchOverview(ORG)).rejects.toMatchObject({ code })
})

it('reads every page, includes unallocated stock and team, and filters every request to this organisation', async () => {
  const listings = Array.from({ length: 1205 }, (_, index) => listing(String(index), { branch_id: index ? 'branch-a' : null }))
  api.client = database({
    organisation_branches: [{ id: 'branch-a', organisation_id: ORG, name: 'Main' }],
    private_listings: [...listings, listing('foreign', { organisation_id: OTHER })],
    organisation_users: [{ id: 'member', user_id: 'owner', organisation_id: ORG, branch_id: null, role: 'owner', status: 'active' }],
  })
  const overview = await getAgencyBranchOverview(ORG)
  expect(overview.organisationId).toBe(ORG)
  expect(overview.totals).toMatchObject({ activeListings: 1205, companyPipeline: 1205000000, activeTeam: 1, unassignedListings: 1 })
  expect(requests.filter((url) => url.pathname.endsWith('/private_listings')).map((url) => url.searchParams.get('offset'))).toEqual(['0', '500', '1000'])
  for (const url of requests) {
    expect(url.searchParams.get('organisation_id')).toBe(`eq.${ORG}`)
    expect(url.searchParams.get('order')).toMatch(/^(id|lead_id)\.asc$/)
  }
})

it('rejects a different requested organisation before requesting any company records', async () => {
  await expect(getAgencyBranchOverview(OTHER)).rejects.toThrow('selected organisation')
  expect(requests).toHaveLength(0)
})

it('keeps present-day totals separate from period additions and monthly rental prices', () => {
  const records = {
    listings: [listing('sale'), listing('rental', { listing_category: 'rental', asking_price: 29500, created_at: '2026-10-03T10:00:00Z' }), listing('unallocated', { branch_id: null, asking_price: 2000000 }), listing('sold', { listing_status: 'sold', created_at: '2026-10-01T10:00:00Z' })],
    transactions: [{ id: 'active', lifecycle_state: 'offer', sales_price: 500000, created_at: '2026-09-20' }, { id: 'closed', lifecycle_state: 'registered', sales_price: 800000, created_at: '2026-10-02' }],
    members: [{ id: 'one', user_id: 'owner', role: 'owner', status: 'active', created_at: '2026-09-01' }, { id: 'two', user_id: 'principal', role: 'principal', status: 'ACTIVE', created_at: '2026-10-04' }, { id: 'duplicate', user_id: 'owner', role: 'owner', status: 'active', created_at: '2026-09-01' }, { id: 'old', role: 'agent', status: 'deactivated' }],
  }
  const month = buildAgencyBranchOverview([], { now, records })
  const previous = buildAgencyBranchOverview([], { now, records, period: 'last_month' })
  expect(month.totals).toMatchObject({ companyPipeline: 3500000, activeListings: 3, activeTransactions: 1, activeTeam: 2, salesAgents: 0, unassignedListings: 1 })
  expect(previous.totals).toEqual(month.totals)
  expect(month.periodMetrics.listings.value).toBe(2)
  expect(month.periodMetrics.pipeline.value).toBe(0)
  expect(previous.periodMetrics.pipeline.value).toBe(3500000)
  expect(month.periodMetrics.transactions.value).toBe(1)
  expect(month.periodMetrics.team.value).toBe(1)
})

it('does not report a partial dataset when a later page fails', async () => {
  let calls = 0
  const client = database({ private_listings: Array.from({ length: 501 }, (_, i) => listing(String(i))) }, () => ++calls === 2 ? { code: '42501', message: 'Permission denied' } : null)
  const result = await utils.readOrganisationRows(client, 'private_listings', ORG, 'id,organisation_id')
  expect(result.data).toBeNull()
  expect(result.error.code).toBe('42501')
})

it('keeps branch managers inside their authorised branch instead of including all company stock', async () => {
  api.settings.mockResolvedValue({ organisation: { id: ORG, type: 'agency' }, profile: { id: ORG, role: 'agent' }, membershipRole: 'branch_manager', membershipStatus: 'active', membershipBranchId: 'branch-a', membershipBranchScope: 'branch_only' })
  api.client = database({ organisation_branches: [{ id: 'branch-a', organisation_id: ORG, name: 'Assigned' }, { id: 'branch-b', organisation_id: ORG, name: 'Other' }], private_listings: [listing('assigned'), listing('other', { branch_id: 'branch-b' }), listing('unallocated', { branch_id: null })] })
  const overview = await getAgencyBranchOverview(ORG)
  expect(overview.branches.map((row) => row.id)).toEqual(['branch-a'])
  expect(overview.totals).toMatchObject({ activeListings: 1, companyPipeline: 1000000, unassignedListings: 0 })
})
