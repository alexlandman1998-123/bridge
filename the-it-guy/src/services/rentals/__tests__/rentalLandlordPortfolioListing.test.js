import { linkRentalLandlordOnboardingProperty } from '../rentalLandlordOnboardingService.js'
vi.mock('../rentalLandlordOnboardingService.js', () => ({ linkRentalLandlordOnboardingProperty: vi.fn() }))
import { beforeEach, expect, it, vi } from 'vitest'
import { linkRentalLandlordLeadToListing } from '../rentalLandlordListingHandoffService'
import { getRentalLeadWorkspace, advanceRentalLead } from '../rentalLeadService'
import { getRentalListingForAgent } from '../rentalListingDraftService'
import { listRentalPropertyMandates } from '../rentalLandlordMandateRepository'
import { updateAgencyCrmLeadRecord } from '../../../lib/agencyCrmRepository'
import { createRentalCrmLeadMetadata } from '../rentalCrmLeadModel'
import { ensureRentalListingVacancy } from '../rentalListingInventoryRepository.js'
vi.mock('../rentalListingInventoryRepository.js', () => ({ ensureRentalListingVacancy: vi.fn() }))
vi.mock('../rentalLeadService', () => ({
  getRentalLeadWorkspace: vi.fn(),
  advanceRentalLead: vi.fn(),
}))
vi.mock('../rentalListingDraftService', () => ({
  getRentalListingForAgent: vi.fn(),
}))
vi.mock('../rentalLandlordMandateRepository', () => ({
  listRentalPropertyMandates: vi.fn(),
}))
vi.mock('../../../lib/agencyCrmRepository', () => ({
  updateAgencyCrmLeadRecord: vi.fn(),
  createAgencyCrmLeadActivity: vi.fn(),
}))
let lead
const context = {
  organisationId: 'org',
  actor: { id: 'agent' },
  scope: { scopeLevel: 'agent' },
  portfolioPropertyId: 'second',
}
beforeEach(() => {
  vi.clearAllMocks()
  lead = {
    id: 'lead',
    role: 'landlord',
    stage: 'listing_created',
    updatedAt: 'revision-1',
    relationships: { listingId: 'first-listing' },
    raw: {
      rawEnquiryPayload: createRentalCrmLeadMetadata({
        organisationId: 'org',
        role: 'landlord',
        stage: 'listing_created',
        relationships: { listingId: 'first-listing' },
        legacy: {
          landlordPortfolio: [
            { id: 'first', address: 'First', listingId: 'first-listing' },
            { id: 'second', address: 'Second', canonicalPropertyId: 'managed' },
          ],
        },
      }),
    },
  }
  linkRentalLandlordOnboardingProperty.mockImplementation(async (_lead,id,links) => {lead.raw.rawEnquiryPayload.landlordPortfolio=lead.raw.rawEnquiryPayload.landlordPortfolio.map((row) => row.id===id ? {...row,...links} : row)})
  getRentalLeadWorkspace.mockResolvedValue({ lead })
  getRentalListingForAgent.mockResolvedValue({
    id: 'second-listing',
    organisationId: 'org',
    rentalPropertyId: 'managed',
    rentalUnitId: 'unit',
  })
  ensureRentalListingVacancy.mockResolvedValue({ listingId: 'second-listing', applicable: true, propertyId: 'managed', unitId: 'unit', vacancyId: 'vacancy' })
  listRentalPropertyMandates.mockResolvedValue([
    {
      id: 'mandate',
      propertyId: 'managed',
      organisationId: 'org',
      mandateStatus: 'active',
      authorityStatus: 'confirmed',
      raw: {
        metadata_json: {
          leadId: 'lead',
          signedEvidenceReference: 'signed/ref',
          signedAt: '2026-10-02',
        },
      },
    },
  ])
  updateAgencyCrmLeadRecord.mockImplementation(async (_org, _id, patch) => {
    lead.raw = { ...lead.raw, ...patch }
    lead.relationships = patch.rawEnquiryPayload.relationships
    lead.updatedAt = 'revision-3'
  })
})
it('links a second property without replacing the primary listing or advancing the completed lead', async () => {
  await linkRentalLandlordLeadToListing(lead, 'second-listing', context)
  expect(lead.raw.rawEnquiryPayload.relationships.listingId).toBe(
    'first-listing',
  )
  expect(
    lead.raw.rawEnquiryPayload.landlordPortfolio.map((p) => p.listingId),
  ).toEqual(['first-listing', 'second-listing'])
  expect(advanceRentalLead).not.toHaveBeenCalled()
  await linkRentalLandlordLeadToListing(lead, 'second-listing', context)
  expect(updateAgencyCrmLeadRecord).not.toHaveBeenCalled()
})
it('requires a mandate on the exact property and blocks replacement of another listing', async () => {
  listRentalPropertyMandates.mockResolvedValue([])
  await expect(
    linkRentalLandlordLeadToListing(lead, 'second-listing', context),
  ).rejects.toThrow('signed mandate')
  expect(updateAgencyCrmLeadRecord).not.toHaveBeenCalled()
  lead.raw.rawEnquiryPayload.landlordPortfolio[1].listingId = 'already-linked'
  await expect(
    linkRentalLandlordLeadToListing(lead, 'second-listing', context),
  ).rejects.toThrow('already has')
  expect(updateAgencyCrmLeadRecord).not.toHaveBeenCalled()
})
it('uses the refreshed lead revision after the portfolio handoff and preserves a retryable listing when advancement fails', async () => {
  lead.stage = 'listing_ready'
  lead.relationships = { propertyId: 'managed', mandateId: 'mandate' }
  const originalLink = linkRentalLandlordOnboardingProperty.getMockImplementation()
  linkRentalLandlordOnboardingProperty.mockImplementation(async (...args) => { await originalLink(...args); lead.updatedAt = 'revision-2' })
  advanceRentalLead.mockRejectedValueOnce(new Error('Lead changed elsewhere.')).mockResolvedValueOnce({ ...lead, stage: 'listing_created' })
  await expect(linkRentalLandlordLeadToListing(lead, 'second-listing', context)).rejects.toThrow('was linked')
  expect(updateAgencyCrmLeadRecord).toHaveBeenCalledWith('org', 'lead', expect.objectContaining({ rawEnquiryPayload: expect.objectContaining({ relationships: expect.objectContaining({ propertyId: 'managed', unitId: 'unit', vacancyId: 'vacancy', listingId: 'second-listing' }) }) }), { expectedUpdatedAt: 'revision-2' })
  expect(advanceRentalLead.mock.calls[0][0].updatedAt).toBe('revision-3')
  await linkRentalLandlordLeadToListing(lead, 'second-listing', context)
  expect(updateAgencyCrmLeadRecord).toHaveBeenCalledTimes(1)
})
it('rejects a listing from another property before creating or connecting its vacancy', async () => {
  getRentalListingForAgent.mockResolvedValue({ id: 'second-listing', organisationId: 'org', rentalPropertyId: 'foreign-property' })
  await expect(linkRentalLandlordLeadToListing(lead, 'second-listing', context)).rejects.toThrow('another managed property')
  expect(ensureRentalListingVacancy).not.toHaveBeenCalled()
  expect(linkRentalLandlordOnboardingProperty).not.toHaveBeenCalled()
})
