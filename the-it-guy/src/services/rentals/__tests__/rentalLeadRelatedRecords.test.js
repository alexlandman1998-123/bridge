import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ workspace: vi.fn(), leads: vi.fn(), records: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), history: vi.fn(), log: vi.fn() }))
vi.mock('../rentalLeadService', () => ({ getRentalLeadWorkspace: api.workspace, listRentalLeads: api.leads }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ listAgencyCrmLeadContacts: api.records, createAgencyCrmLeadTask: api.createTask, updateAgencyCrmLeadTask: api.updateTask }))
vi.mock('../../leadCommunicationService', () => ({ listLeadCommunications: api.history, createCommunicationEvent: api.log }))
import { listRentalLeadCommunications, logRentalLeadCommunication } from '../rentalLeadCommunicationService'
import { completeRentalLeadFollowUp, listRentalLeadFollowUps } from '../rentalLeadFollowUpService'
const scope = { assignedAgentId: 'agent', scopeLevel: 'assigned' }
const context = { organisationId: 'org', actor: { id: 'agent' }, scope }
beforeEach(() => { vi.clearAllMocks(); api.workspace.mockResolvedValue({ lead: { id: 'lead', role: 'tenant', raw: { contactId: 'contact' } }, tasks: [] }); api.leads.mockResolvedValue([{ id: 'lead' }]); api.history.mockResolvedValue([]) })
it('reads one scoped lead for communication history, without loading the full CRM board', async () => {
  await listRentalLeadCommunications('org', 'lead', scope)
  expect(api.workspace).toHaveBeenCalledExactlyOnceWith('org', 'lead', scope)
  expect(api.history).toHaveBeenCalledExactlyOnceWith({ organisationId: 'org', leadId: 'lead' })
  expect(api.leads).not.toHaveBeenCalled()
})
it('denies a communication write when current lead access has been revoked', async () => {
  api.workspace.mockRejectedValue(new Error('Access changed'))
  await expect(logRentalLeadCommunication({ id: 'lead' }, { communicationType: 'call', direction: 'outbound', summary: 'Called tenant' }, context)).rejects.toThrow('Access changed')
  expect(api.log).not.toHaveBeenCalled()
})
it('distinguishes failed follow-up access from an empty task list', async () => {
  api.records.mockResolvedValue({ tasks: [], tasksAvailable: false })
  await expect(listRentalLeadFollowUps('org', scope)).rejects.toThrow('could not be loaded')
  expect(api.records).toHaveBeenCalledWith('org', expect.objectContaining({ paginateRelatedRecords: true, includeLocalFallback: false }))
})
it('only returns tasks linked to the currently scoped rental leads', async () => {
  api.records.mockResolvedValue({ tasks: [{ taskId: 'allowed', leadId: 'lead' }, { taskId: 'foreign', leadId: 'other' }], tasksAvailable: true })
  expect((await listRentalLeadFollowUps('org', scope)).map(t => t.taskId)).toEqual(['allowed'])
})
it('cannot complete a task borrowed from a different lead', async () => {
  await expect(completeRentalLeadFollowUp({ taskId: 'foreign', leadId: 'lead' }, context)).rejects.toThrow('not linked')
  expect(api.updateTask).not.toHaveBeenCalled()
})
