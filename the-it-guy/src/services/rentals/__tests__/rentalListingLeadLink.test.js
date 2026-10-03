import { expect, it, vi } from 'vitest'
import { createRentalLead } from '../rentalLeadService'
const mocks = vi.hoisted(() => ({ create: vi.fn(), activity: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ createAgencyCrmLeadRecord: mocks.create, createAgencyCrmLeadActivity: mocks.activity, fetchAgencyCrmLeadWorkspace: vi.fn(), listAgencyCrmLeadContacts: vi.fn(), updateAgencyCrmLeadRecord: vi.fn() }))
it('persists a tenant enquiry listing relationship in the CRM payload and returned lead', async () => {
  mocks.create.mockImplementation(async (organisationId, payload) => ({ ...payload, leadId: 'lead-1', id: 'lead-1', organisationId }))
  const lead = await createRentalLead({ role: 'tenant', firstName: 'Amy', email: 'amy@example.test', desiredArea: 'Woodstock', listingId: 'listing-1' }, { organisationId: 'org-1', actor: { userId: 'agent-1' } })
  expect(mocks.create).toHaveBeenCalledWith('org-1', expect.objectContaining({ rawEnquiryPayload: expect.objectContaining({ relationships: expect.objectContaining({ listingId: 'listing-1' }) }) }), expect.anything())
  expect(lead.relationships.listingId).toBe('listing-1')
})
