// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  crm: vi.fn(), transactions: vi.fn(), organisationTransactions: vi.fn(), listings: vi.fn(), canvassing: vi.fn(),
  identities: vi.fn(), activity: vi.fn(), settings: vi.fn(), users: vi.fn(),
  from: vi.fn(), guard: vi.fn(), overview: vi.fn(),
  auth: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
}))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: api.from, auth: { onAuthStateChange: api.auth } } }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ listAgencyCrmLeadContacts: api.crm }))
vi.mock('../../../domains/reporting/api', () => ({ fetchDashboardOverview: api.overview }))
vi.mock('../../../lib/transactionsListApi', () => ({ fetchTransactionsByParticipantSummary: api.transactions, fetchTransactionsListSummary: api.organisationTransactions }))
vi.mock('../../../services/privateListingService', () => ({ getOrganisationPrivateListings: api.listings }))
vi.mock('../../../lib/canvassingRepository', () => ({ listCanvassingWorkspace: api.canvassing }))
vi.mock('../../../services/clientIdentityService', () => ({ loadClientIdentities: api.identities }))
vi.mock('../../../services/clientActivityService', () => ({ loadLatestClientActivity: api.activity }))
vi.mock('../../../lib/settingsApi', () => ({ fetchOrganisationSettings: api.settings, listOrganisationUsersForWorkspace: api.users }))
vi.mock('../../../services/workspaceResolutionService', () => ({ assertResolvedWorkspaceContext: api.guard }))
import { getAgentClientProfile, invalidateAgentClientDirectoryCache, loadAgentClientDirectory } from '../agentClientDirectory'

const organisationId = '11111111-1111-4111-8111-111111111111'
const context = { profile: { id: 'agent-a', email: 'agent@example.test', fullName: 'Agent A' }, role: 'agent', workspace: { id: organisationId } }
const crm = { contacts: [], leads: [], leadActivities: [], tasks: [] }
const identity = (name = 'Client A') => ({ available: true, canManage: true, profiles: [{ id: 'client-a', organisation_id: organisationId, name, updated_at: '2026-10-01T12:00:00Z' }], links: [], identifiers: [] })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
let queries, sellerRows
beforeEach(() => {
  invalidateAgentClientDirectoryCache()
  for (const mock of [api.crm, api.transactions, api.organisationTransactions, api.listings, api.canvassing, api.identities, api.activity, api.settings, api.users, api.from, api.guard, api.overview]) mock.mockReset()
  api.crm.mockResolvedValue(crm)
  api.transactions.mockResolvedValue([])
  api.organisationTransactions.mockResolvedValue([])
  api.listings.mockResolvedValue([])
  api.canvassing.mockResolvedValue({ prospects: [], activities: [] })
  api.identities.mockResolvedValue(identity())
  api.activity.mockResolvedValue(new Map())
  api.settings.mockResolvedValue({ organisation: { id: organisationId } })
  api.users.mockResolvedValue([{ userId: 'agent-a', fullName: 'Agent A' }])
  queries = []
  sellerRows = []
  api.from.mockImplementation((table) => {
    const query = { table, filters: [] }; queries.push(query)
    const chain = { then: (resolve, reject) => Promise.resolve({ data: table === 'transactions' ? sellerRows.filter(row => query.ids?.includes(row.id)) : [], error: null }).then(resolve, reject) }
    for (const method of ['select', 'order', 'limit', 'neq']) chain[method] = () => chain
    chain.in = (column, values) => { if (column === 'id') query.ids = values; return chain }
    chain.eq = (column, value) => { query.filters.push([column, value]); return chain }
    return chain
  })
})
afterEach(() => { vi.useRealTimers(); invalidateAgentClientDirectoryCache() })

test('starts independent sources while CRM is pending, and reuses the resolved workspace', async () => {
  const pendingCrm = deferred()
  api.crm.mockReturnValueOnce(pendingCrm.promise)
  const loading = loadAgentClientDirectory(context)
  await vi.waitFor(() => expect(api.identities).toHaveBeenCalled())
  for (const source of [api.transactions, api.listings, api.canvassing, api.users]) expect(source).toHaveBeenCalledTimes(1)
  expect(queries.some((query) => query.table === 'buyers' && query.filters.some(([column, value]) => column === 'organisation_id' && value === organisationId))).toBe(true)
  expect(api.settings).not.toHaveBeenCalled()
  expect(api.transactions).toHaveBeenCalledWith(expect.objectContaining({ organisationId, includePropertyDetails: false }))
  expect(api.listings).toHaveBeenCalledWith(organisationId, { includeRequirementsAndDocuments: false, includeExternalLinks: false, includePublicationDetails: false })
  pendingCrm.resolve(crm)
  expect((await loading).clients[0].name).toBe('Client A')
})

test('shows core clients without waiting for activity and enriches without mutating those rows', async () => {
  const activity = deferred()
  api.activity.mockReturnValueOnce(activity.promise)
  const directory = await loadAgentClientDirectory({ ...context, deferActivity: true })
  expect(directory.clients[0].lastActivityAt).toBe('2026-10-01T12:00:00Z')
  activity.resolve(new Map([['client-a', '2026-10-09T12:00:00Z']]))
  const enriched = await directory.activityPromise
  expect(enriched.clients[0].lastActivityAt).toBe('2026-10-09T12:00:00Z')
  expect(directory.clients[0].lastActivityAt).toBe('2026-10-01T12:00:00Z')
  expect((await loadAgentClientDirectory(context)).clients[0].lastActivityAt).toBe('2026-10-09T12:00:00Z')
  expect(api.crm).toHaveBeenCalledTimes(1)
})

test('activity failures retain the client list and report the existing warning', async () => {
  api.activity.mockRejectedValue(new Error('activity unavailable'))
  const directory = await loadAgentClientDirectory(context)
  expect(directory.clients[0].name).toBe('Client A')
  expect(directory.activityWarning).toMatch(/Recent client activity could not load/)
})

test('shares concurrent reads and caches return visits only within the same user and access scope', async () => {
  await Promise.all([loadAgentClientDirectory(context), loadAgentClientDirectory(context)])
  await loadAgentClientDirectory(context)
  expect(api.crm).toHaveBeenCalledTimes(1)
  await loadAgentClientDirectory({ ...context, profile: { ...context.profile, id: 'agent-b' } })
  await loadAgentClientDirectory({ ...context, workspace: { id: '22222222-2222-4222-8222-222222222222' } })
  await loadAgentClientDirectory({ ...context, currentMembership: { id: 'member-a', branchId: 'branch-a' } })
  await loadAgentClientDirectory({ ...context, currentMembership: { id: 'member-a', branchId: 'branch-b' } })
  await loadAgentClientDirectory({ ...context, businessWorkspaceId: 'rentals' })
  expect(api.crm).toHaveBeenCalledTimes(6)
})

test('expires cached data after 30 seconds and refreshes following an auth event', async () => {
  vi.useFakeTimers()
  await loadAgentClientDirectory(context)
  vi.advanceTimersByTime(30_001)
  await loadAgentClientDirectory(context)
  expect(api.crm).toHaveBeenCalledTimes(2)
  api.auth.mock.calls[0][0]('SIGNED_OUT')
  await loadAgentClientDirectory(context)
  expect(api.crm).toHaveBeenCalledTimes(3)
})

test('refresh bypasses cached data and a late previous load cannot refill it', async () => {
  const oldCrm = deferred()
  api.crm.mockReturnValueOnce(oldCrm.promise)
  api.identities.mockResolvedValueOnce(identity('Old client')).mockResolvedValueOnce(identity('Updated client'))
  const oldLoad = loadAgentClientDirectory(context)
  await vi.waitFor(() => expect(api.crm).toHaveBeenCalledTimes(1))
  expect((await loadAgentClientDirectory({ ...context, forceRefresh: true })).clients[0].name).toBe('Updated client')
  expect(api.transactions).toHaveBeenLastCalledWith(expect.objectContaining({ forceRefresh: true }))
  oldCrm.resolve(crm)
  await oldLoad
  expect((await loadAgentClientDirectory(context)).clients[0].name).toBe('Updated client')
  expect(api.crm).toHaveBeenCalledTimes(2)
})

test('failed required reads are visible and optional failures are retried on the next visit', async () => {
  api.crm.mockRejectedValueOnce(new Error('CRM unavailable'))
  await expect(loadAgentClientDirectory(context)).rejects.toThrow('CRM unavailable')
  api.listings.mockRejectedValueOnce(new Error('listings unavailable'))
  expect((await loadAgentClientDirectory(context)).clients[0].name).toBe('Client A')
  await loadAgentClientDirectory(context)
  expect(api.crm).toHaveBeenCalledTimes(3)
})

test('rejects an unresolved workspace before reading its directory', async () => {
  api.guard.mockImplementation(() => { throw new Error('Select a workspace') })
  await expect(loadAgentClientDirectory(context)).rejects.toThrow('Select a workspace')
  expect(api.crm).not.toHaveBeenCalled()
})


test('developer directory retains portfolio reads and scopes identities to the organisation', async () => {
  api.overview.mockResolvedValue({ rows: [] })
  await loadAgentClientDirectory({ ...context, role: 'developer', workspace: { id: '22222222-2222-4222-8222-222222222222', organisationId } })
  expect(api.identities).toHaveBeenCalledWith(organisationId)
  expect(api.crm).toHaveBeenCalledWith(organisationId, { includeLocalFallback: false })
  expect(api.overview).toHaveBeenCalledWith({ developmentId: null, organisationId, includeSecondaryData: false })
  expect(api.transactions).not.toHaveBeenCalled()
  expect(api.organisationTransactions).not.toHaveBeenCalled()
})

test.each([{ workspaceRole: 'principal' }, { workspace_role: 'owner' }, { role: 'principal' }])('principal clients include other agents’ linked and completed deals (%j)', async (membership) => {
  const linked = id => ({ transaction: { id, organisation_id: organisationId, assigned_agent: 'Another Agent', stage: id === 'completed' ? 'Registered' : 'OTP Signed', is_active: true }, buyer: { id: `buyer-${id}`, name: 'Client A' } })
  api.organisationTransactions.mockResolvedValue([linked('active'), linked('completed'), { transaction: { id: 'unrelated', organisation_id: organisationId }, buyer: { id: 'other-buyer', name: 'Other client' } }])
  api.identities.mockResolvedValue({ ...identity(), links: ['active','completed'].map(source_id => ({ client_id: 'client-a', source_kind: 'transaction_buyer', source_id })) })
  const directory = await loadAgentClientDirectory({ ...context, currentMembership: { id: 'membership', ...membership } })
  const detail = getAgentClientProfile(directory.clients, 'client:client-a')
  expect(detail.transactions.map(row => row.id).sort()).toEqual(['active','completed'])
  expect(detail.transactions.find(row => row.id === 'completed').status).toBe('Completed')
  expect(api.organisationTransactions).toHaveBeenCalledWith(expect.objectContaining({ organisationId, userId: 'agent-a', activeTransactionsOnly: true, includePropertyDetails: false, readAllPages: true }))
  expect(api.transactions).not.toHaveBeenCalled()
})

test('changing principal membership back to agent never reuses the wider directory', async () => {
  const membership = { id: 'membership', workspaceRole: 'principal' }
  await loadAgentClientDirectory({ ...context, currentMembership: membership })
  await loadAgentClientDirectory({ ...context, currentMembership: { ...membership, role: 'principal', workspaceRole: 'agent' } })
  expect(api.organisationTransactions).toHaveBeenCalledTimes(1)
  expect(api.transactions).toHaveBeenCalledTimes(1)
  await loadAgentClientDirectory({ ...context, currentMembership: membership, forceRefresh: true })
  expect(api.organisationTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ forceRefresh: true }))
})

test('principal seller links stay complete beyond a thousand deals', async () => {
  const ids = Array.from({ length: 1001 }, (_, index) => `deal-${index}`)
  sellerRows = ids.map(id => ({ id, seller_name: 'Client A', seller_email: 'shared-representative@example.test' }))
  api.organisationTransactions.mockResolvedValue(ids.map(id => ({ transaction: { id, organisation_id: organisationId, assigned_agent: 'Another Agent' } })))
  api.identities.mockResolvedValue({ ...identity(), links: ids.map(source_id => ({ client_id: 'client-a', source_kind: 'transaction_seller', source_id })) })
  const directory = await loadAgentClientDirectory({ ...context, currentMembership: { workspaceRole: 'principal' } })
  expect(getAgentClientProfile(directory.clients, 'client:client-a').transactions).toHaveLength(1001)
  const sellerQueries = queries.filter(query => query.table === 'transactions')
  expect(sellerQueries).toHaveLength(6)
  expect(sellerQueries.every(query => query.ids.length <= 200 && query.filters.some(([column,value]) => column === 'organisation_id' && value === organisationId))).toBe(true)
})
