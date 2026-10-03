import { linkRentalLandlordOnboardingProperty } from '../rentalLandlordOnboardingService.js'
vi.mock('../rentalLandlordOnboardingService.js', () => ({ linkRentalLandlordOnboardingProperty: vi.fn() }))
import { beforeEach, expect, it, vi } from 'vitest'
import { linkRentalLandlordLeadToListing } from '../rentalLandlordListingHandoffService'
import { getRentalLeadWorkspace, advanceRentalLead } from '../rentalLeadService'
import { getRentalListingForAgent } from '../rentalListingDraftService'
import { listRentalPropertyMandates } from '../rentalLandlordMandateRepository'
import { updateAgencyCrmLeadRecord } from '../../../lib/agencyCrmRepository'
import { createRentalCrmLeadMetadata } from '../rentalCrmLeadModel'
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
  })
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
  expect(updateAgencyCrmLeadRecord).toHaveBeenCalledTimes(1)
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
