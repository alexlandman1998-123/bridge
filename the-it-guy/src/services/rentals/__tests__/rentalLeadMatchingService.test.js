import { beforeEach, expect, it, vi } from 'vitest'
import { listRentalLeadMatches, recordRentalLeadListingShortlist } from '../rentalLeadMatchingService'
import { listRentalListingsForAgent } from '../rentalListingDraftService'
import { listRentalLeads } from '../rentalLeadService'
import { createAgencyCrmLeadActivity } from '../../../lib/agencyCrmRepository'
vi.mock('../rentalListingDraftService', () => ({ listRentalListingsForAgent: vi.fn() }))
vi.mock('../rentalLeadService', () => ({ listRentalLeads: vi.fn() }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ createAgencyCrmLeadActivity: vi.fn() }))
const lead = { id: 'tenant', role: 'tenant', desiredArea: 'Newlands', monthlyBudget: 11000, bedrooms: 2 }
const listing = { id: 'home', listingTitle: 'Saved apartment', suburb: 'Newlands', monthlyRent: 10000, bedrooms: 2 }
beforeEach(() => {
  vi.clearAllMocks()
  listRentalLeads.mockResolvedValue([lead])
  listRentalListingsForAgent.mockResolvedValue([listing])
  createAgencyCrmLeadActivity.mockResolvedValue({ activityId: 'activity' })
})
it.each([
  ['organisation', '', true],
  ['branch', 'branch-1', true],
  ['assigned', '', false],
])('loads the correct %s listing scope and current saved requirements', async (scopeLevel, branchId, includeAllOrganisationListings) => {
  const result = await listRentalLeadMatches('org', 'tenant', { scopeLevel, assignedAgentId: 'agent', branchId: 'branch-1' })
  expect(listRentalListingsForAgent).toHaveBeenCalledWith('agent', { organisationId: 'org', branchId, includeAllOrganisationListings })
  expect(result.matches[0]).toMatchObject({ score: 100, budgetMatch: true, bedroomMatch: true, locationMatch: true })
})
it('does not read listings when the lead is outside scope or is a landlord', async () => {
  listRentalLeads.mockResolvedValue([{ id: 'tenant', role: 'landlord' }])
  await expect(listRentalLeadMatches('org', 'tenant', {})).rejects.toThrow('Choose a tenant lead')
  expect(listRentalListingsForAgent).not.toHaveBeenCalled()
})
it('shortlists only a currently accessible listing using its saved title and score', async () => {
  await recordRentalLeadListingShortlist(lead, { listing: { id: 'home', title: 'Forged title' }, recommendation: 'forged' }, { organisationId: 'org', actor: { id: 'agent' }, scope: { assignedAgentId: 'agent' } })
  expect(createAgencyCrmLeadActivity).toHaveBeenCalledWith('org', 'tenant', expect.objectContaining({ activityType: 'Rental Listing Shortlisted', activityNote: 'Shortlisted Saved apartment (strong match).', outcome: 'strong_match' }), { actor: { id: 'agent' } })
  listRentalListingsForAgent.mockResolvedValue([])
  await expect(recordRentalLeadListingShortlist(lead, { listing: { id: 'home' } }, { organisationId: 'org', scope: { assignedAgentId: 'agent' } })).rejects.toThrow('no longer available')
  expect(createAgencyCrmLeadActivity).toHaveBeenCalledTimes(1)
})
