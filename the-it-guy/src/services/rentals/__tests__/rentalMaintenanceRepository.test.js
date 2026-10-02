import { expect, it, vi } from 'vitest'
import { createRentalMaintenanceRequest, listRentalMaintenanceRequests } from '../rentalMaintenanceRepository.js'
vi.mock('../../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: null }))
it('reads all job statuses with organisation/branch constraints and pagination', async () => {
  const calls = []
  const query = {
    select(fields) { calls.push(['select', fields]); return this },
    eq(...args) { calls.push(['eq', ...args]); return this },
    order(...args) { calls.push(['order', ...args]); return this },
    range(...args) { calls.push(['range', ...args]); return this },
    then(resolve) { return Promise.resolve({ data: [{ id: 'resolved-1', status: 'resolved', description: 'Repaired leak', rental_maintenance_assignments: [{ assignee_name: 'Plumber', status: 'completed' }] }], error: null }).then(resolve) },
  }
  const client = { from: vi.fn(() => query) }
  const rows = await listRentalMaintenanceRequests({ organisationId: 'org-1', branchId: 'branch-1', offset: 100 }, { client })
  expect(client.from).toHaveBeenCalledWith('rental_maintenance_requests')
  expect(calls).toContainEqual(['eq', 'organisation_id', 'org-1'])
  expect(calls).toContainEqual(['eq', 'rental_properties.branch_id', 'branch-1'])
  expect(calls).toContainEqual(['range', 100, 199])
  expect(rows[0]).toMatchObject({ request_id: 'resolved-1', status: 'resolved', description: 'Repaired leak', assignee_name: 'Plumber' })
})
it('persists the selected tenancy, category, priority, description and evidence through the existing RPC', async () => {
  const client = { rpc: vi.fn(async () => ({ data: { request_id: 'job-1' }, error: null })) }
  const media = [{ media_link: 'https://example.test/leak.jpg', caption: 'Issue evidence' }]
  await createRentalMaintenanceRequest({ tenancyId: 'tenancy-1', category: 'plumbing', priority: 'urgent', description: 'Kitchen leak', media }, { client })
  expect(client.rpc).toHaveBeenCalledWith('rental_create_maintenance_request', { x: 'tenancy-1', c: 'plumbing', pr: 'urgent', d: 'Kitchen leak', m: media })
})
