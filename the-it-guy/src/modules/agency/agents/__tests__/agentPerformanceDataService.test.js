import { beforeEach, expect, it, vi } from 'vitest'

const reads = vi.hoisted(() => ({
  transactions: vi.fn(), participantTransactions: vi.fn(), settings: vi.fn(), users: vi.fn(),
  branches: vi.fn(), crm: vi.fn(), listings: vi.fn(), appointments: vi.fn(), canvassing: vi.fn(),
}))
vi.mock('../../../../domains/reporting/api.js', () => ({ fetchTransactionsListSummary: reads.transactions, fetchTransactionsByParticipantSummary: reads.participantTransactions }))
vi.mock('../../../../lib/settingsApi', () => ({ fetchOrganisationSettings: reads.settings, listOrganisationUsers: reads.users }))
vi.mock('../../../../services/agencyBranchService', () => ({ getBranchOptions: reads.branches }))
vi.mock('../../../../lib/agencyCrmRepository', () => ({ listAgencyCrmLeadContacts: reads.crm }))
vi.mock('../../../../services/privateListingService', () => ({ getOrganisationPrivateListings: reads.listings }))
vi.mock('../../../../lib/agencyPipelineService', () => ({ listAppointmentsAsync: reads.appointments }))
vi.mock('../../../../lib/canvassingRepository', () => ({ listCanvassingWorkspace: reads.canvassing }))

import { loadAgentPerformanceSources } from '../agentPerformanceDataService'

function deferred() {
  let resolve
  const promise = new Promise((settle) => { resolve = settle })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  reads.settings.mockResolvedValue({ organisation: { id: 'live-org' } })
  for (const name of ['transactions', 'participantTransactions', 'users', 'branches', 'listings', 'appointments']) reads[name].mockResolvedValue([])
  reads.crm.mockResolvedValue({ leads: [], leadActivities: [], tasks: [] })
  reads.canvassing.mockResolvedValue({ prospects: [], activities: [] })
})

it('starts scoped reads as soon as settings resolve while transaction and member reads remain pending', async () => {
  const settings = deferred()
  const transactions = deferred()
  const users = deferred()
  reads.settings.mockReturnValue(settings.promise)
  reads.transactions.mockReturnValue(transactions.promise)
  reads.users.mockReturnValue(users.promise)
  const pending = loadAgentPerformanceSources({ canManageDirectory: true, directorySummary: true, directory: { agency: { id: 'legacy-org' } } })
  expect(reads.transactions).toHaveBeenCalledOnce()
  expect(reads.users).toHaveBeenCalledOnce()
  expect(reads.listings).not.toHaveBeenCalled()
  settings.resolve({ organisation: { id: 'live-org' } })
  await vi.waitFor(() => expect(reads.listings).toHaveBeenCalledWith('live-org', { includeRequirementsAndDocuments: false, includeRelatedData: false }))
  expect(reads.crm).toHaveBeenCalledWith('live-org')
  expect(reads.branches).toHaveBeenCalledOnce()
  expect(reads.appointments).toHaveBeenCalledWith('live-org', { includeAll: true })
  transactions.resolve([{ transaction: { id: 'deal' }, rolePlayers: [{ id: 'agent-role', role_type: 'agent' }] }])
  users.resolve([{ id: 'member' }])
  const result = await pending
  expect(result.organisationId).toBe('live-org')
  expect(result.organisationUsers).toEqual([{ id: 'member' }])
  expect(result.transactionRolePlayers).toEqual([{ id: 'agent-role', role_type: 'agent', transaction_id: 'deal' }])
})

it('retains detail hydration by default and uses participant access for non-managers', async () => {
  await loadAgentPerformanceSources({ profile: { id: 'agent' }, role: 'agent' })
  expect(reads.participantTransactions).toHaveBeenCalledWith({ userId: 'agent', roleType: 'agent' })
  expect(reads.transactions).not.toHaveBeenCalled()
  expect(reads.users).not.toHaveBeenCalled()
  expect(reads.branches).not.toHaveBeenCalled()
  expect(reads.listings).toHaveBeenCalledWith('live-org', { includeRequirementsAndDocuments: false, includeRelatedData: true })
})

it('preserves existing local fallbacks when optional reads fail', async () => {
  reads.settings.mockRejectedValue(new Error('settings unavailable'))
  reads.listings.mockRejectedValue(new Error('listings unavailable'))
  reads.crm.mockRejectedValue(new Error('CRM unavailable'))
  const listings = [{ id: 'listing', assignedAgentId: 'agent' }]
  const leads = [{ id: 'lead' }]
  const result = await loadAgentPerformanceSources({ profile: { organisationId: 'profile-org' }, localPrivateListings: listings, localPipelineRows: leads })
  expect(result.organisationId).toBe('profile-org')
  expect(result.listings).toEqual(listings)
  expect(result.leads).toEqual(leads)
})
