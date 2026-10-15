import { beforeEach, expect, it, vi } from 'vitest'
const repository = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ listAgencyCrmLeadContacts: repository.list, createAgencyCrmLeadActivity: vi.fn(), createAgencyCrmLeadRecord: vi.fn(), fetchAgencyCrmLeadWorkspace: vi.fn(), updateAgencyCrmLeadRecord: vi.fn() }))
vi.mock('../../../lib/settingsApi', () => ({ listOrganisationUsersForWorkspace: vi.fn() }))
import { buildRentalLeadView, listRentalLeads } from '../rentalLeadService.js'

beforeEach(() => vi.clearAllMocks())
it('canonical and legacy known stages map into the rental columns', () => {
  for (const [saved, expected] of [['New Lead', 'new'], ['viewing', 'viewing_scheduled'], ['application', 'application_pending']]) {
    const row = buildRentalLeadView({ leadId: 'fixture', organisationId: 'org', rawEnquiryPayload: { classification: 'rental', role: 'tenant', stage: saved } })
    expect(row.stage).toBe(expected)
    expect(row.workflowIssue).toBe('')
  }
})
it('unknown saved stages are preserved and require review, rather than being reset', () => {
  const row = buildRentalLeadView({ leadId: 'fixture', organisationId: 'org', rawEnquiryPayload: { classification: 'rental', role: 'tenant', stage: 'application_started' } })
  expect(row.stage).toBe('application_started')
  expect(row.stageLabel).toBe('Review needed')
})
it('reports unavailable CRM data instead of silently returning an empty rental board', async () => {
  repository.list.mockResolvedValue({ contacts: [], leads: [], leadsAvailable: false, source: 'remote' })
  await expect(listRentalLeads('org', { scopeLevel: 'organisation', includeAllOrganisationLeads: true })).rejects.toThrow()
})
it('allows a successfully loaded empty organisation to show its ordinary empty state', async () => {
  repository.list.mockResolvedValue({ contacts: [], leads: [], leadsAvailable: true, source: 'remote' })
  await expect(listRentalLeads('org', { scopeLevel: 'organisation', includeAllOrganisationLeads: true })).resolves.toEqual([])
})
