import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ lead: vi.fn(), appointment: vi.fn(), interest: vi.fn() }))
vi.mock('../../../lib/agencyCrmRepository.js', () => ({ createAgencyCrmLeadRecord: mocks.lead }))
vi.mock('../../../lib/agencyPipelineService.js', () => ({ createAppointmentAsync: mocks.appointment }))
vi.mock('../../leadListingInterestService.js', () => ({ upsertLeadListingInterest: mocks.interest }))
import { createListingViewingRequest } from '../listingBuyerActionsService'

const listing = { id: 'property-1', propertyAddress: '1 Rose Street' }
const buyer = { firstName: 'Taylor', lastName: 'Buyer', email: 'buyer@example.test', phone: '0821111111', proposedDate: '2030-10-12', proposedTime: '11:00' }
const seller = { name: 'Seller', email: 'seller@example.test', phone: '0822222222' }
const actor = { id: 'agent-1', name: 'Agent', email: 'agent@example.test' }
const lead = { leadId: 'buyer-lead-1', contactId: 'buyer-contact-1' }
const input = { organisationId: 'org-1', listing, buyer, seller, actor }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lead.mockResolvedValue(lead)
  mocks.appointment.mockResolvedValue({ appointmentId: 'viewing-1' })
  mocks.interest.mockResolvedValue({ id: 'interest-1' })
})

it('links an existing buyer lead and property to a three-party viewing request', async () => {
  await createListingViewingRequest({ ...input, existingLead: lead })
  expect(mocks.lead).not.toHaveBeenCalled()
  const [organisationId, appointment] = mocks.appointment.mock.calls[0]
  expect(organisationId).toBe('org-1')
  expect(appointment).toMatchObject({ listingId: 'property-1', leadId: 'buyer-lead-1', contactId: 'buyer-contact-1', listingViewingMode: 'three_party_request' })
  expect(appointment.participants.map((person) => person.participantRole)).toEqual(['Buyer', 'Seller', 'Agent'])
  expect(mocks.interest.mock.calls[0][0]).toMatchObject({ listingId: 'property-1', leadId: 'buyer-lead-1', status: 'viewing_scheduled' })
})

it('creates the buyer lead before creating a linked viewing when buyer details are entered', async () => {
  await createListingViewingRequest(input)
  expect(mocks.lead).toHaveBeenCalledTimes(1)
  expect(mocks.lead.mock.invocationCallOrder[0]).toBeLessThan(mocks.appointment.mock.invocationCallOrder[0])
  expect(mocks.appointment.mock.calls[0][1]).toMatchObject({ listingId: 'property-1', leadId: 'buyer-lead-1', contactId: 'buyer-contact-1' })
})

it.each([
  ['missing property', { listing: {} }],
  ['missing buyer', { buyer: { ...buyer, firstName: '', lastName: '', email: '' } }],
  ['unconfirmed booking', { buyer: { ...buyer, mode: 'book' } }],
])('rejects %s before creating any records', async (_name, changes) => {
  await expect(createListingViewingRequest({ ...input, ...changes })).rejects.toThrow()
  expect(mocks.lead).not.toHaveBeenCalled()
  expect(mocks.appointment).not.toHaveBeenCalled()
  expect(mocks.interest).not.toHaveBeenCalled()
})
