import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), activity: vi.fn(), advanceRental: vi.fn(), rentalView: vi.fn() }))
vi.mock('../rentals/rentalLeadService.js', () => ({ buildRentalLeadView: api.rentalView, advanceRentalLead: api.advanceRental }))
vi.mock('../../lib/agencyCrmRepository.js', () => ({ fetchAgencyCrmLeadWorkspace: api.fetch, updateAgencyCrmLeadRecord: api.update, createAgencyCrmLeadActivity: api.activity }))
import { markMobileBuyerLeadContacted } from '../mobileLeadContactService.js'

const lead = { leadId: 'lead-one', leadCategory: 'buyer', stage: 'New Lead', status: 'Active', updatedAt: '2026-10-20T08:00:00Z' }
const request = { organisationId: 'org-one', leadId: 'lead-one', actor: { id: 'agent-one' } }
beforeEach(() => {
  vi.resetAllMocks()
  api.fetch.mockResolvedValue({ leads: [lead] })
  api.update.mockResolvedValue({ stage: 'Contacted' })
  api.activity.mockResolvedValue({})
})

it('records the same first-contact evidence and stage consumed by the buyer journey with a revision guard', async () => {
  await markMobileBuyerLeadContacted(request)
  expect(api.fetch).toHaveBeenCalledWith('org-one', 'lead-one')
  expect(api.update).toHaveBeenCalledWith('org-one', 'lead-one', expect.objectContaining({ stage: 'Contacted', currentStage: 'Contacted', status: 'Active', ownershipStatus: 'contacted', firstContactedAt: expect.any(String) }), { expectedUpdatedAt: lead.updatedAt })
  const patch = api.update.mock.calls[0][2]
  expect(patch).not.toHaveProperty('buyerQualification')
  expect(api.activity).toHaveBeenCalledWith('org-one', 'lead-one', expect.objectContaining({ activityType: 'Buyer Contacted', outcome: 'Contacted', activityDate: patch.firstContactedAt }), { actor: request.actor })
})

it.each([{ ...lead, stage: 'Qualified' }, { ...lead, stage: 'Converted' }, { ...lead, leadCategory: 'seller' }])('does not regress or modify an ineligible fresh lead: %j', async fresh => {
  api.fetch.mockResolvedValue({ leads: [fresh] })
  await expect(markMobileBuyerLeadContacted(request)).rejects.toThrow()
  expect(api.update).not.toHaveBeenCalled()
  expect(api.activity).not.toHaveBeenCalled()
})

it('keeps a failed or conflicting write visible and does not claim a contact activity', async () => {
  api.update.mockRejectedValue(new Error('Revision conflict'))
  await expect(markMobileBuyerLeadContacted(request)).rejects.toThrow('Revision conflict')
  expect(api.activity).not.toHaveBeenCalled()
})

it('preserves the first-contact timestamp and does not replay a successful save when activity logging fails', async () => {
  api.fetch.mockResolvedValue({ leads: [{ ...lead, firstContactedAt: '2026-10-19T09:00:00Z' }] })
  api.activity.mockRejectedValue(new Error('History unavailable'))
  await expect(markMobileBuyerLeadContacted(request)).resolves.toEqual({ stage: 'Contacted' })
  expect(api.update.mock.calls[0][2].firstContactedAt).toBe('2026-10-19T09:00:00Z')
  expect(api.update).toHaveBeenCalledOnce()
})

it('records tenant contact through the rental workflow without writing buyer milestones', async () => {
  const raw = { ...lead, rawEnquiryPayload: { arch9RentalLead: true, role: 'tenant' } }
  api.fetch.mockResolvedValue({ leads: [raw], contacts: [] })
  const tenant = { id: lead.leadId, role: 'tenant', stage: 'new', raw }
  api.rentalView.mockReturnValue(tenant)
  api.advanceRental.mockResolvedValue({ ...tenant, stage: 'contacted' })
  await expect(markMobileBuyerLeadContacted(request)).resolves.toHaveProperty('stage', 'contacted')
  expect(api.advanceRental).toHaveBeenCalledWith(tenant, { organisationId: request.organisationId, actor: request.actor, toStage: 'contacted' })
  expect(api.update).not.toHaveBeenCalled()
  expect(api.activity).not.toHaveBeenCalled()
})
