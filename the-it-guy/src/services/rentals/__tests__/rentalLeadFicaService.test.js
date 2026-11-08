import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ current: vi.fn(), advance: vi.fn(), update: vi.fn() }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ updateAgencyCrmLeadRecord: api.update, createAgencyCrmLeadActivity: vi.fn().mockResolvedValue({}) }))
vi.mock('../rentalLeadService', async importOriginal => ({ ...await importOriginal(), getRentalLeadWorkspace: api.current, advanceRentalLead: api.advance }))
import { completeRentalLeadFica, saveRentalLeadFicaChecklist } from '../rentalLeadFicaService'
import { createRentalCrmLeadMetadata } from '../rentalCrmLeadModel'
const checklist = { identity: 'verified', proof_of_address: 'verified', bank_details: 'verified', source_of_funds: 'verified' }
const context = { organisationId: 'org', actor: { id: 'agent' }, scope: { assignedAgentId: 'agent' } }
let lead
beforeEach(() => {
  vi.clearAllMocks()
  lead = { id: 'lead', role: 'tenant', stage: 'fica_pending', updatedAt: 'v1', raw: { leadId: 'lead', organisationId: 'org', rawEnquiryPayload: createRentalCrmLeadMetadata({ organisationId: 'org', role: 'tenant', stage: 'fica_pending' }) } }
  api.current.mockImplementation(async () => ({ lead }))
  api.update.mockImplementation(async (_org, _id, patch) => ({ ...lead.raw, ...patch, updatedAt: 'v2' }))
  api.advance.mockResolvedValue({ stage: 'fica_complete' })
})
it('uses the checklist save receipt when advancing rather than its obsolete revision', async () => {
  await completeRentalLeadFica(lead, checklist, 'Reviewed application', context)
  expect(api.update.mock.calls[0][3]).toEqual({ expectedUpdatedAt: 'v1' })
  expect(api.advance.mock.calls[0][0]).toMatchObject({ updatedAt: 'v2', raw: { rawEnquiryPayload: { compliance: { fica: { checklist } } } } })
})
it('rechecks current scope and stage before editing FICA', async () => {
  api.current.mockRejectedValue(new Error('This rental lead is not available in your current scope.'))
  await expect(saveRentalLeadFicaChecklist(lead, checklist, context)).rejects.toThrow('current scope')
  expect(api.update).not.toHaveBeenCalled()
})
it('does not restore an outdated stage after another agent advances the lead', async () => {
  api.current.mockResolvedValue({ lead: { ...lead, stage: 'placement_ready' } })
  await expect(saveRentalLeadFicaChecklist(lead, checklist, context)).rejects.toThrow('FICA readiness')
  expect(api.update).not.toHaveBeenCalled()
})
