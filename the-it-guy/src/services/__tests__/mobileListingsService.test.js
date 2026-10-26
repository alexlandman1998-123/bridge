import { beforeEach, expect, it, vi } from 'vitest'
import { getMobileListingsAsync, mobileListingGroup } from '../mobileListingsService.js'
const mocks = vi.hoisted(() => ({ summaries: vi.fn(), covers: vi.fn() }))
vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true }))
vi.mock('../privateListingService.js', () => ({ getAgentPrivateListingSummaries: mocks.summaries, getPrivateListingCoverImageUrls: mocks.covers }))
beforeEach(() => { vi.resetAllMocks(); mocks.summaries.mockResolvedValue([]); mocks.covers.mockResolvedValue({}) })
const workspace = { role: 'agent', profile: { id: 'agent-one' } }
const organisation = { id: 'org-one' }
it('requests the complete agent inventory within the current organisation and assignment scope', async () => {
  await getMobileListingsAsync({ workspace, organisation })
  expect(mocks.summaries).toHaveBeenCalledWith('agent-one', { organisationId: 'org-one', includeAllOrganisationListings: false, fetchAll: true, includePublicationDetails: true, requireAvailable: true })
})
it.each(['developer', 'principal'])('uses organisation inventory for %s while retaining the organisation filter', async (role) => {
  await getMobileListingsAsync({ workspace: { ...workspace, role }, organisation })
  expect(mocks.summaries.mock.calls[0][1]).toMatchObject({ organisationId: 'org-one', includeAllOrganisationListings: true })
})
it('includes scoped sales and rentals while excluding closed records and retaining listing details', async () => {
  mocks.summaries.mockResolvedValue([
    { id: 'one', listingTitle: 'Oak', listingStatus: 'active', askingPrice: 2190000, unitNumber: '001', bedrooms: 2, bathrooms: 1.5, floorSize: 85 },
    { id: 'draft', listingStatus: 'seller_lead' }, { id: 'offer', listingStatus: 'under_offer' },
    { id: 'rental', listingStatus: 'active', listingCategory: 'rental', organisationId: 'org-one', assignedAgentId: 'agent-one', sellerCanonicalFacts: { rentalInfo: { monthlyRent: 13500, rentalPriceFrequency: 'monthly' } } }, { id: 'closed', listingStatus: 'sold' },
  ])
  mocks.covers.mockResolvedValue({ one: '/cover.jpg' })
  const rows = await getMobileListingsAsync({ workspace, organisation })
  expect(rows.map((row) => row.id)).toEqual(['one', 'draft', 'offer', 'rental'])
  expect(rows[0]).toMatchObject({ price: 2190000, unitNumber: '001', bathrooms: 1.5, coverUrl: '/cover.jpg', group: 'active' })
  expect(rows[1]).toMatchObject({ group: 'drafts', statusLabel: 'Draft' })
  expect(rows[3]).toMatchObject({ kind: 'rentals', group: 'active', price: 13500, rentalPriceFrequency: 'monthly' })
  expect(mocks.covers).toHaveBeenCalledWith(['one', 'draft', 'offer', 'rental'])
})
it('does not disguise an unavailable inventory as an empty list or issue unscoped reads', async () => {
  await expect(getMobileListingsAsync({ workspace })).rejects.toThrow('Select an agent or developer workspace')
  expect(mocks.summaries).not.toHaveBeenCalled()
  mocks.summaries.mockRejectedValue(new Error('Permission denied'))
  await expect(getMobileListingsAsync({ workspace, organisation })).rejects.toThrow('Permission denied')
})
it.each(['sold', 'withdrawn', 'transaction_created', 'archived', 'expired', 'deleted', 'let', 'rented', 'leased'])('excludes closed status %s', (status) => expect(mobileListingGroup({ status })).toBe('closed'))

it('includes the current agent membership alias without broadening to other agents', async () => {
  await getMobileListingsAsync({ workspace: { ...workspace, currentMembership: { id: 'my-membership', userId: 'agent-one', role: 'agent' } }, organisation })
  expect(mocks.summaries.mock.calls[0][1]).toMatchObject({ organisationId: 'org-one', includeAllOrganisationListings: false, assignedAgentIds: ['my-membership'] })
})

it('retains rental organisation, branch and assignment boundaries', async () => {
  const rental = { listingCategory: 'rental', listingStatus: 'active', organisationId: 'org-one', branchId: 'branch-one', assignedAgentId: 'agent-one' }
  mocks.summaries.mockResolvedValue([
    { ...rental, id: 'mine' }, { ...rental, id: 'other-agent', assignedAgentId: 'other' },
    { ...rental, id: 'other-org', organisationId: 'other' },
    { ...rental, id: 'other-branch', branchId: 'branch-two' },
  ])
  const assigned = await getMobileListingsAsync({ workspace, organisation })
  expect(assigned.map(row => row.id)).toEqual(['mine', 'other-branch'])
  const branch = await getMobileListingsAsync({ workspace: { ...workspace, currentMembership: { role: 'branch_manager', branchId: 'branch-one' } }, organisation })
  expect(branch.map(row => row.id)).toEqual(['mine', 'other-agent'])
})
