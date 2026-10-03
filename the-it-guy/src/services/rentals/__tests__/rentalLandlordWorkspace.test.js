import { saveRentalLandlordDiscovery, linkRentalLandlordOnboardingProperty } from '../rentalLandlordOnboardingService.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRentalCrmLeadMetadata } from '../rentalCrmLeadModel'
import { getRentalLeadWorkspace, advanceRentalLead } from '../rentalLeadService'
import { updateAgencyCrmLeadRecord } from '../../../lib/agencyCrmRepository'
import { getRentalProperty } from '../rentalPropertyRepository'
import {
  createRentalPropertyMandate,
  listRentalPropertyMandates,
} from '../rentalLandlordMandateRepository'
import {
  saveRentalLandlordProfile,
  saveRentalLandlordProperty,
  saveRentalLandlordDocument,
  recordRentalLandlordPortfolioMandate,
} from '../rentalLandlordWorkspaceService'
import {
  landlordWorkspace,
  landlordListingPrefill,
  landlordMandateReadiness,
  normalizeLandlordProperty,
  normalizeLandlordProfile,
} from '../rentalLandlordWorkspaceModel'
vi.mock('../rentalLeadService', () => ({
  getRentalLeadWorkspace: vi.fn(),
  advanceRentalLead: vi.fn(),
}))
vi.mock('../../../lib/agencyCrmRepository', () => ({
  updateAgencyCrmLeadRecord: vi.fn(),
}))
vi.mock('../rentalPropertyRepository', () => ({ getRentalProperty: vi.fn() }))
vi.mock('../rentalLandlordMandateRepository', () => ({
  createRentalPropertyMandate: vi.fn(),
  listRentalPropertyMandates: vi.fn(),
}))
vi.mock('../rentalLandlordOnboardingService.js', () => ({ saveRentalLandlordDiscovery: vi.fn(), linkRentalLandlordOnboardingProperty: vi.fn() }))
const context = {
  organisationId: 'org',
  actor: { id: 'agent' },
  scope: { scopeLevel: 'branch', branchId: 'branch' },
}
let lead
beforeEach(() => {
  vi.clearAllMocks()
  lead = {
    id: 'lead',
    role: 'landlord',
    stage: 'mandate_pending',
    name: 'Landlord Contact',
    phone: '0123456789',
    propertyAddress: 'Original Road',
    relationships: {},
    raw: {
      rawEnquiryPayload: createRentalCrmLeadMetadata({
        organisationId: 'org',
        role: 'landlord',
        stage: 'mandate_pending',
        legacy: { unrelated: 'preserved' },
      }),
    },
  }
  linkRentalLandlordOnboardingProperty.mockImplementation(async (_lead,id,links) => {const m=lead.raw.rawEnquiryPayload;m.landlordPortfolio=m.landlordPortfolio.map((row) => row.id===id ? {...row,...links} : row)})
  saveRentalLandlordDiscovery.mockImplementation(async (current,patch) => { const raw=lead.raw.rawEnquiryPayload;const m=raw.rentalCrm || raw.rental_crm || raw;m.landlordProfile=patch.profile;m.landlordPortfolio=patch.portfolio;return {onboarding:{version:1}} })
  getRentalLeadWorkspace.mockImplementation(async () => ({ lead }))
  updateAgencyCrmLeadRecord.mockImplementation(async (_org, _id, patch) => {
    lead.raw = { ...lead.raw, ...patch }
  })
  getRentalProperty.mockResolvedValue({
    id: 'managed',
    organisationId: 'org',
    branchId: 'branch',
  })
  listRentalPropertyMandates.mockResolvedValue([])
  createRentalPropertyMandate.mockResolvedValue({ id: 'mandate' })
  advanceRentalLead.mockResolvedValue({})
})
describe('landlord workspace persistence', () => {
  it('retains an existing lead property, linked mandate and signed evidence', () => {
    lead.relationships = {
      listingId: 'listing',
      propertyId: 'managed',
      mandateId: 'mandate',
    }
    lead.raw.rawEnquiryPayload.workflow = {
      events: [
        { mandateReference: 'signed/reference', signedAt: '2026-10-02' },
      ],
    }
    expect(landlordWorkspace(lead).portfolio[0]).toMatchObject({
      listingId: 'listing',
      canonicalPropertyId: 'managed',
      mandateId: 'mandate',
      mandateReference: 'signed/reference',
      mandateSignedAt: '2026-10-02',
    })
  })

  it('round trips trust details, people, two properties and documents without losing original CRM metadata', async () => {
    const profile = {
      type: 'trust',
      name: 'Example Trust',
      email: 'owner@example.com',
      registrationNumber: 'IT123',
      residentialAddress: 'Registered Road',
      authorisedSignatoryName: 'Ann',
      authorityBasis: 'Trust resolution',
      people: [
        {
          id: 'person',
          name: 'Ann',
          role: 'Trustee',
          email: 'ann@example.com',
          idNumber: '123',
          signingAuthority: true,
        },
      ],
    }
    await saveRentalLandlordProfile('lead', profile, context)
    await saveRentalLandlordProperty(
      'lead',
      {
        id: 'p2',
        address: 'Second Road',
        city: 'Pretoria',
        category: 'commercial',
        expectedMonthlyRent: '12000',
        bedrooms: '0',
        marketingApproved: 'No',
      },
      context,
    )
    expect(landlordWorkspace(lead).profile).toMatchObject(profile)
    expect(landlordWorkspace(lead).portfolio).toHaveLength(2)
    expect(landlordWorkspace(lead).portfolio[1]).toMatchObject({
      expectedMonthlyRent: 12000,
      bedrooms: 0,
      marketingApproved: 'No',
    })
    await saveRentalLandlordDocument(
      'lead',
      {
        id: 'doc',
        name: 'Trust deed',
        reference: 'private/reference',
        propertyId: 'p2',
      },
      context,
    )
    expect(landlordWorkspace(lead).documents[0]).toMatchObject({
      name: 'Trust deed',
      propertyId: 'p2',
    })
    expect(lead.raw.rawEnquiryPayload.unrelated).toBe('preserved')
    expect(getRentalLeadWorkspace).toHaveBeenCalledWith(
      'org',
      'lead',
      expect.objectContaining({ scopeLevel: 'branch', includeClosed: true }),
    )
  })
  it('retains saved fields and other portfolio properties when editing one property', async () => {
    await saveRentalLandlordProperty(
      'lead',
      {
        id: 'p2',
        address: 'Second Road',
        features: 'Solar',
        ownershipType: 'sectional_title',
        unitNumber: '4',
      },
      context,
    )
    await saveRentalLandlordProperty(
      'lead',
      { ...landlordWorkspace(lead).portfolio[1], expectedMonthlyRent: 15000 },
      context,
    )
    expect(landlordWorkspace(lead).portfolio.map((p) => p.address)).toEqual([
      'Original Road',
      'Second Road',
    ])
    expect(landlordWorkspace(lead).portfolio[1]).toMatchObject({
      features: 'Solar',
      unitNumber: '4',
      expectedMonthlyRent: 15000,
    })
  })
  it('does not allow forged listing links, out-of-scope managed properties or failed saves', async () => {
    await expect(
      saveRentalLandlordProperty(
        'lead',
        { id: 'p2', address: 'Road', listingId: 'forged' },
        context,
      ),
    ).rejects.toThrow('Listing links')
    getRentalProperty.mockResolvedValue({
      organisationId: 'other',
      branchId: 'branch',
    })
    await expect(
      saveRentalLandlordProperty(
        'lead',
        { id: 'p2', address: 'Road', canonicalPropertyId: 'outside' },
        context,
      ),
    ).rejects.toThrow('workspace')
    expect(updateAgencyCrmLeadRecord).not.toHaveBeenCalled()
    saveRentalLandlordDiscovery.mockRejectedValue(new Error('statement timeout'))
    await expect(
      saveRentalLandlordProfile(
        'lead',
        { type: 'individual', name: 'Ann', phone: '123' },
        context,
      ),
    ).rejects.toThrow('statement timeout')
  })
  it('records a signed mandate against the exact property and advances only the first mandate', async () => {
    await saveRentalLandlordProperty(
      'lead',
      {
        id: 'p2',
        address: 'Road',
        canonicalPropertyId: 'managed',
        mandateReference: 'signed/ref',
        mandateSignedAt: '2026-10-02',
      },
      context,
    )
    await recordRentalLandlordPortfolioMandate('lead', 'p2', true, context)
    expect(createRentalPropertyMandate).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: 'managed',
        metadata: expect.objectContaining({
          leadId: 'lead',
          signedEvidenceReference: 'signed/ref',
        }),
      }),
    )
    expect(landlordWorkspace(lead).portfolio[1].mandateId).toBe('mandate')
    expect(advanceRentalLead).toHaveBeenCalledWith(
      lead,
      expect.objectContaining({
        toStage: 'mandate_signed',
        relationships: { propertyId: 'managed', mandateId: 'mandate' },
      }),
    )
    lead.stage = 'listing_created'
    advanceRentalLead.mockClear()
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
    await recordRentalLandlordPortfolioMandate('lead', 'p2', true, context)
    expect(createRentalPropertyMandate).toHaveBeenCalledTimes(1)
    expect(advanceRentalLead).not.toHaveBeenCalled()
  })
  it('rejects incomplete people, invalid measurements and missing signature confirmation', async () => {
    expect(() =>
      normalizeLandlordProfile({
        type: 'trust',
        name: 'Trust',
        phone: '1',
        people: [{ id: 'p', email: 'person@example.com' }],
      }),
    ).toThrow('name for each person')
    expect(() =>
      normalizeLandlordProperty({ id: 'p', address: 'Road', bedrooms: 1.5 }),
    ).toThrow('whole numbers')
    await expect(
      recordRentalLandlordPortfolioMandate(
        'lead',
        'primary-property',
        false,
        context,
      ),
    ).rejects.toThrow('managed rental property')
  })
  it('prefills the exact property and landlord into the listing form with correct rental keys', async () => {
    await saveRentalLandlordProfile(
      'lead',
      { type: 'company', name: 'Company', phone: '1' },
      context,
    )
    await saveRentalLandlordProperty(
      'lead',
      {
        id: 'p2',
        address: 'Second Road',
        expectedMonthlyRent: 11000,
        parking: 2,
        furnished: 'Yes',
        petsAllowed: 'No',
        category: 'commercial',
      },
      context,
    )
    expect(landlordListingPrefill(lead, 'p2')).toMatchObject({
      landlordType: 'company',
      landlordName: 'Company',
      propertyAddress: 'Second Road',
      monthlyRent: 11000,
      parkingBays: 2,
      furnishedStatus: 'furnished',
      petsPolicy: 'not_allowed',
      propertyCategory: 'commercial',
    })
    expect(() => landlordListingPrefill(lead, 'missing')).toThrow(
      'not available',
    )
    expect(
      landlordMandateReadiness({ name: 'Owner', phone: '1' }, []).percent,
    ).toBe(25)
  })
})
