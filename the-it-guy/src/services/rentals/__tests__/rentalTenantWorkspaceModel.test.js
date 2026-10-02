import { describe, expect, it } from 'vitest'
import {
  TENANT_QUESTIONS,
  normalizeTenantQualification,
  tenantBudgetMatches,
  tenantEnquiryProperty,
  tenantJourneyStage,
  tenantQualificationProgress,
  tenantQualificationValues,
} from '../rentalTenantWorkspaceModel'
describe('tenant workspace model', () => {
  it('groups the saved pipeline into the seven tenant journey stages', () => {
    expect(
      [
        'new',
        'contacted',
        'qualified',
        'viewing_scheduled',
        'viewing_completed',
        'application_pending',
        'screening_pending',
        'fica_pending',
        'placement_ready',
      ].map((stage) => tenantJourneyStage({ stage })),
    ).toEqual([0, 1, 2, 3, 3, 4, 5, 5, 5])
    expect(
      tenantJourneyStage({ stage: 'placement_ready' }, [
        { id: 't', status: 'draft', rental_leases: [{ status: 'draft' }] },
      ]),
    ).toBe(6)
    expect(
      tenantJourneyStage({ stage: 'placement_ready' }, [
        { id: 't', status: 'active', rental_leases: [{ status: 'active' }] },
      ]),
    ).toBe(7)
    expect(tenantJourneyStage({ stage: 'new' })).toBe(0)
    expect(tenantJourneyStage({ stage: 'placement_ready' }, [{ status: 'draft', rental_leases: [{ status: 'signed' }] }])).toBe(6)
    expect(tenantJourneyStage({ relationships: { tenancyId: 'draft-tenancy' } })).toBe(6)
    expect(tenantJourneyStage({ stage: 'qualified' }, [], [{ status: 'submitted' }])).toBe(5)
  })
  it('has ten questions, counts explicit No answers and preserves zero bedrooms', () => {
    expect(TENANT_QUESTIONS).toHaveLength(10)
    const lead = {
      qualification: {
        monthlyBudget: 11000,
        desiredArea: 'Newlands',
        occupationDate: '2026-11-01',
        employmentStatus: 'Employed',
        depositAvailable: 'No',
        screeningConsent: 'No',
        propertyNeed: 'Apartment',
        occupants: 1,
        pets: 'No pets',
        additionalNotes: 'Call after 5',
        bedrooms: 0,
      },
    }
    expect(tenantQualificationProgress(lead)).toEqual({
      count: 10,
      total: 10,
      percent: 100,
    })
    expect(tenantQualificationValues(lead).bedrooms).toBe(0)
    expect(tenantQualificationProgress({ pets: 'Not captured' }).count).toBe(0)
  })
  it('shows only actual priced rentals within the captured rent budget', () => {
    const matches = [0, 8000, 11000, 12000].map((monthlyRent, index) => ({
      listing: { id: String(index), monthlyRent },
    }))
    expect(
      tenantBudgetMatches({ monthlyBudget: 11000 }, matches).map(
        (item) => item.listing.monthlyRent,
      ),
    ).toEqual([8000, 11000])
    expect(tenantBudgetMatches({}, matches)).toEqual([])
    expect(tenantBudgetMatches({ monthlyBudget: 11000 }, ['daily', 'weekly', 'annual', 'per_square_metre'].map((rentalPriceFrequency) => ({ listing: { monthlyRent: 500, rentalPriceFrequency } })))).toEqual([])
  })
  it('uses only the enquired property, never the first matching property', () => {
    const matches = [
      { listing: { id: 'a', listingTitle: 'Different property' } },
      { listing: { id: 'b', listingTitle: 'Enquired property' } },
    ]
    expect(
      tenantEnquiryProperty({ relationships: { listingId: 'b' } }, matches)
        .listingTitle,
    ).toBe('Enquired property')
    expect(tenantEnquiryProperty({}, matches)).toBeNull()
    expect(
      tenantEnquiryProperty({
        raw: { enquiredPropertyTitle: 'Original enquiry' },
      }).listingTitle,
    ).toBe('Original enquiry')
  })
  it('normalizes every captured answer and retains extra answers during legacy saves', () => {
    const result = normalizeTenantQualification(
      {
        desiredArea: ' Pretoria ',
        monthlyBudget: '0',
        bedrooms: '0',
        pets: 'No pets',
      },
      {
        employmentStatus: 'Employed',
        depositAvailable: 'No',
        screeningConsent: 'Yes',
        propertyNeed: 'Apartment',
        occupants: 2,
        additionalNotes: 'Call first',
        occupationDate: '2026-11-01',
      },
    )
    expect(result).toMatchObject({
      desiredArea: 'Pretoria',
      monthlyBudget: 0,
      bedrooms: 0,
      pets: 'No pets',
      employmentStatus: 'Employed',
      depositAvailable: 'No',
      screeningConsent: 'Yes',
      propertyNeed: 'Apartment',
      occupants: 2,
      additionalNotes: 'Call first',
    })
    expect(() =>
      normalizeTenantQualification({ desiredArea: 'A', occupants: 1.5 }),
    ).toThrow('whole numbers')
  })
})
