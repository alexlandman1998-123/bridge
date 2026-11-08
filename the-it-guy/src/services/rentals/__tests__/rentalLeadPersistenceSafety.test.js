import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ list: vi.fn(), fetch: vi.fn(), update: vi.fn(), users: vi.fn() }))
vi.mock('../../../lib/agencyCrmRepository', () => ({
  listAgencyCrmLeadContacts: api.list, fetchAgencyCrmLeadWorkspace: api.fetch,
  updateAgencyCrmLeadRecord: api.update, createAgencyCrmLeadRecord: vi.fn(),
  createAgencyCrmLeadActivity: vi.fn().mockResolvedValue({}),
}))
vi.mock('../../../lib/settingsApi', () => ({ listOrganisationUsersForWorkspace: api.users }))
import { assignRentalLead, getRentalLeadWorkspace, updateRentalLeadQualification } from '../rentalLeadService'
import { recordRentalLeadOutcome } from '../rentalLeadOutcomeService'
import { createRentalCrmLeadMetadata } from '../rentalCrmLeadModel'
const version = '2026-11-08T10:00:00Z'
const context = { organisationId: 'org', actor: { id: 'manager' }, scope: { scopeLevel: 'branch', branchId: 'branch' } }
let raw
beforeEach(() => {
  vi.clearAllMocks()
  raw = { leadId: 'lead', organisationId: 'org', branchId: 'branch', assignedAgentId: 'agent', updatedAt: version,
    rawEnquiryPayload: createRentalCrmLeadMetadata({ organisationId: 'org', role: 'tenant', stage: 'contacted' }) }
  api.list.mockImplementation(async () => ({ leads: [raw], contacts: [] }))
  api.fetch.mockImplementation(async () => ({ leads: [raw], contacts: [] }))
  api.update.mockImplementation(async (_org, _id, patch) => ({ ...raw, ...patch }))
  api.users.mockResolvedValue([{ userId: 'new-agent', organisationId: 'org', branchId: 'branch', status: 'active' }])
})
it('opens a scoped lead directly without depending on the first page of the whole CRM', async () => {
  api.list.mockResolvedValue({ leads: [], contacts: [] })
  expect((await getRentalLeadWorkspace('org', 'lead', context.scope)).lead.id).toBe('lead')
  expect(api.list).not.toHaveBeenCalled()
  expect(api.fetch).toHaveBeenCalledExactlyOnceWith('org', 'lead')
})
it.each([
  ['branch reassignment', { branchId: 'other-branch' }],
  ['wrong organisation', { organisationId: 'other-org' }],
  ['different resolved record', { leadId: 'other-lead' }],
])('rejects a fresh record after %s even if the old board allowed it', async (_label, patch) => {
  api.fetch.mockResolvedValue({ leads: [{ ...raw, ...patch }] })
  await expect(getRentalLeadWorkspace('org', 'lead', context.scope)).rejects.toThrow(/scope|not found/)
})
it('distinguishes a denied lookup from an ordinary missing lead', async () => {
  api.fetch.mockResolvedValue({ leads: [], leadWorkspaceStatus: 'unavailable' })
  await expect(getRentalLeadWorkspace('org', 'lead', context.scope)).rejects.toThrow(/access|loaded/)
})
it.each([
  ['qualification', () => updateRentalLeadQualification('lead', { desiredArea: 'Newlands', monthlyBudget: 11000 }, context)],
  ['assignment', () => assignRentalLead('lead', 'new-agent', context)],
  ['outcome', () => recordRentalLeadOutcome({ id: 'lead' }, { status: 'lost', reason: 'budget' }, context)],
])('protects %s against a concurrent saved metadata change', async (_label, save) => {
  api.update.mockImplementation(async (_org, _id, _patch, options) => {
    if (options?.expectedUpdatedAt === version) throw new Error('This rental lead changed while you were saving. Refresh and review.')
    return raw
  })
  await expect(save()).rejects.toThrow('changed while you were saving')
  expect(api.update.mock.calls[0][3]).toEqual({ expectedUpdatedAt: version })
})
it('does not write an unverifiable legacy revision', async () => {
  raw.updatedAt = ''
  await expect(updateRentalLeadQualification('lead', { desiredArea: 'Newlands' }, context)).rejects.toThrow('Refresh')
  expect(api.update).not.toHaveBeenCalled()
})
