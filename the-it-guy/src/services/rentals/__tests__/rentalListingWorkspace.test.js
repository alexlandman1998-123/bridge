import { beforeEach, expect, it, vi } from 'vitest'
import { getRentalListingForAgent, listRentalListingsForAgent, updateRentalListingGallery } from '../rentalListingDraftService'
import { buildRentalListingDraftStorageKey, buildRentalWorkspaceKey } from '../rentalWorkspaceScope'

const mocks = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), save: vi.fn() }))
vi.mock('../../privateListingService', () => ({ getPrivateListing: mocks.get, getAgentPrivateListings: mocks.list,
  createPrivateListing: vi.fn(), createPrivateListingActivity: vi.fn(), saveRentalListingSnapshot: mocks.save,
  signPrivateListingMediaAsset: vi.fn(), uploadPrivateListingMediaAsset: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: false, supabase: null }))
const id = '11111111-1111-4111-8111-111111111111'
const listing = { id, listingCategory: 'rental', organisationId: 'org-a', assignedAgentId: 'agent-a', branchId: 'branch-a' }
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(listing); mocks.list.mockResolvedValue([]) })

it('rejects a direct lookup from another organisation or agent despite database access', async () => {
  expect(await getRentalListingForAgent(id, 'agent-a', { organisationId: 'org-b' })).toBeNull()
  expect(await getRentalListingForAgent(id, 'agent-b', { organisationId: 'org-a' })).toBeNull()
  expect(mocks.list).not.toHaveBeenCalled()
})

it('enforces branch scope and permits organisation-wide access within the selected organisation', async () => {
  expect(await getRentalListingForAgent(id, 'manager', { organisationId: 'org-a', branchId: 'branch-b', includeAllOrganisationListings: true })).toBeNull()
  expect(await getRentalListingForAgent(id, 'manager', { organisationId: 'org-a', branchId: 'branch-a', includeAllOrganisationListings: true })).toEqual(listing)
  expect(await getRentalListingForAgent(id, 'principal', { organisationId: 'org-a', includeAllOrganisationListings: true })).toEqual(listing)
  expect(await getRentalListingForAgent(id, 'principal', { organisationId: 'org-b', includeAllOrganisationListings: true })).toBeNull()
})

it('surfaces read failures without masking them as missing listings', async () => {
  mocks.get.mockRejectedValue(new Error('Photo access failed'))
  await expect(getRentalListingForAgent(id, 'agent-a', { organisationId: 'org-a' })).rejects.toThrow('Photo access failed')
  expect(mocks.list).not.toHaveBeenCalled()
  await expect(getRentalListingForAgent(id, 'agent-a', {})).rejects.toThrow('Select an organisation')
})

it('applies scope again to reference fallback and fails visibly on incomplete reads', async () => {
  mocks.list.mockResolvedValue([{ ...listing, listingReference: 'REF' }, { ...listing, organisationId: 'org-b' }])
  expect(await getRentalListingForAgent('REF', 'agent-a', { organisationId: 'org-a' })).toEqual({ ...listing, listingReference: 'REF' })
  expect(mocks.list).toHaveBeenCalledWith('agent-a', expect.objectContaining({ organisationId: 'org-a', requireAvailable: true }))
  mocks.list.mockRejectedValue(new Error('Incomplete stock read'))
  await expect(listRentalListingsForAgent('agent-a', { organisationId: 'org-a' })).rejects.toThrow('Incomplete stock read')
})

it('rejects photo writes outside the selected workspace before uploading or saving', async () => {
  await expect(updateRentalListingGallery(id, { galleryImages: [] }, { organisationId: 'org-b', assignedAgentId: 'agent-a' })).rejects.toThrow('Rental listing not found')
  expect(mocks.save).not.toHaveBeenCalled()
})

it('isolates drafts and editor lifetimes by organisation, agent, branch, role and listing', () => {
  const scope = { organisationId: 'org-a', assignedAgentId: 'agent-a', scopeLevel: 'assigned' }
  const original = buildRentalListingDraftStorageKey(scope)
  for (const change of [{ organisationId: 'org-b' }, { assignedAgentId: 'agent-b' }, { branchId: 'branch-b' }, { scopeLevel: 'organisation', includeAllOrganisationListings: true }]) {
    expect(buildRentalListingDraftStorageKey({ ...scope, ...change })).not.toBe(original)
  }
  expect(buildRentalWorkspaceKey(scope, 'listing-a')).not.toBe(buildRentalWorkspaceKey(scope, 'listing-b'))
  expect(buildRentalListingDraftStorageKey(scope, { leadId: 'lead-a' })).not.toBe(original)
})


it('opens previous rental listings by UUID with the same workspace scope', async () => {
  mocks.get.mockResolvedValue({ ...listing, listingStatus: 'withdrawn', listingVisibility: 'archived' })
  expect(await getRentalListingForAgent(id, 'agent-a', { organisationId: 'org-a' })).toMatchObject({ id, listingVisibility: 'archived' })
  expect(mocks.get).toHaveBeenCalledWith(id, expect.objectContaining({ includePreviousListings: true }))
  expect(await getRentalListingForAgent(id, 'agent-a', { organisationId: 'org-b' })).toBeNull()
})

it('includes historic imports when opening by reference', async () => {
  mocks.list.mockResolvedValue([{ ...listing, listingReference: 'HISTORIC-REF', listingVisibility: 'archived' }])
  expect(await getRentalListingForAgent('HISTORIC-REF', 'agent-a', { organisationId: 'org-a' })).toMatchObject({ id })
  expect(mocks.list).toHaveBeenCalledWith('agent-a', expect.objectContaining({ includeArchivedImports: true, includeArchivedListings: true, includeWithdrawnListings: true, organisationId: 'org-a' }))
})
