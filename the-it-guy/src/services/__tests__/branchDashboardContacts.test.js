import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ branch: vi.fn(), read: vi.fn() }))
vi.mock('../agencyBranchService', () => ({ getBranch: api.branch, readScopedBranchRows: api.read }))
import { getBranchDashboardData } from '../branchDashboardDataService'
beforeEach(() => {
  vi.clearAllMocks()
  api.branch.mockResolvedValue({ organisationId: 'org-one', leads: [{ lead_id: 'lead-one', contact_id: 'contact-one' }, { lead_id: 'lead-two', contact_id: 'contact-missing', name: 'Existing name', phone: 'Existing phone' }], listings: [], transactions: [], dataAvailability: {} })
  api.read.mockImplementation(async (table) => ({ rows: table === 'contacts' ? [{ contact_id: 'contact-one', first_name: 'Alex', last_name: 'Buyer', phone: '27820000000', email: 'alex@example.test' }] : [], available: true }))
})
it('reads only linked contacts in the branch organisation and preserves existing lead details', async () => {
  const result = await getBranchDashboardData('branch-one')
  expect(api.read).toHaveBeenCalledWith('contacts', 'org-one', 'contact_id', ['contact-one', 'contact-missing'], 'contact_id')
  expect(result.leads[0]).toMatchObject({ lead_id: 'lead-one', name: 'Alex Buyer', phone: '27820000000', email: 'alex@example.test' })
  expect(result.leads[1]).toMatchObject({ name: 'Existing name', phone: 'Existing phone' })
})
