import { beforeEach, expect, it, vi } from 'vitest'
import {
  buildRentalLeadView,
  updateRentalLeadQualification,
} from '../rentalLeadService'
import { createRentalCrmLeadMetadata } from '../rentalCrmLeadModel'
import {
  createAgencyCrmLeadActivity,
  fetchAgencyCrmLeadWorkspace,
  listAgencyCrmLeadContacts,
  updateAgencyCrmLeadRecord,
} from '../../../lib/agencyCrmRepository'
vi.mock('../../../lib/agencyCrmRepository', () => ({
  createAgencyCrmLeadActivity: vi.fn().mockResolvedValue({}),
  createAgencyCrmLeadRecord: vi.fn(),
  fetchAgencyCrmLeadWorkspace: vi.fn(),
  listAgencyCrmLeadContacts: vi.fn(),
  updateAgencyCrmLeadRecord: vi.fn(),
}))
const context = {
  organisationId: 'org',
  actor: { id: 'agent' },
  scope: { assignedAgentId: 'agent', scopeLevel: 'agent' },
}
let raw
it('uses saved tenant qualification for matching even when legacy budget fields are missing or stale', () => {
  const view = buildRentalLeadView({ leadId: 'tenant', budget: 0, rawEnquiryPayload: createRentalCrmLeadMetadata({
    organisationId: 'org', role: 'tenant', qualification: { monthlyBudget: 15000, desiredArea: 'Newlands', bedrooms: 2 },
    legacy: { monthlyBudget: 8000, desiredArea: 'Old area' },
  }) })
  expect(view).toMatchObject({ monthlyBudget: 15000, desiredArea: 'Newlands', bedrooms: 2 })
})
beforeEach(() => {
  vi.clearAllMocks()
  raw = {
    leadId: 'lead',
    contactId: 'contact',
    assignedAgentId: 'agent',
    budget: 11000,
    areaInterest: 'Pretoria',
    rawEnquiryPayload: createRentalCrmLeadMetadata({
      organisationId: 'org',
      role: 'tenant',
      stage: 'contacted',
      qualification: { employmentStatus: 'Employed', depositAvailable: 'No' },
      legacy: { desiredArea: 'Pretoria', monthlyBudget: 11000 },
    }),
  }
  const contacts = [
    { contactId: 'contact', firstName: 'Alex', lastName: 'Tenant' },
  ]
  listAgencyCrmLeadContacts.mockImplementation(async () => ({
    leads: [raw],
    contacts,
  }))
  fetchAgencyCrmLeadWorkspace.mockImplementation(async () => ({
    leads: [raw],
    contacts,
  }))
  updateAgencyCrmLeadRecord.mockImplementation(async (_org, _id, patch) => {
    raw = { ...raw, ...patch }
    return raw
  })
})
it('saves and rehydrates all tenant answers through the CRM metadata and screening consent', async () => {
  const answers = {
    monthlyBudget: 10000,
    desiredArea: 'Newlands',
    occupationDate: '2026-11-01',
    employmentStatus: 'Self-employed',
    depositAvailable: 'No',
    screeningConsent: 'Yes',
    propertyNeed: 'Garden apartment',
    occupants: 2,
    pets: 'Pet friendly required',
    additionalNotes: 'Call first',
    bedrooms: 0,
  }
  await updateRentalLeadQualification('lead', answers, context)
  const hydrated = buildRentalLeadView(raw, {
    firstName: 'Alex',
    lastName: 'Tenant',
  })
  expect(hydrated.qualification).toMatchObject(answers)
  expect(hydrated).toMatchObject({
    monthlyBudget: 10000,
    desiredArea: 'Newlands',
    bedrooms: 0,
    pets: 'Pet friendly required',
  })
  expect(hydrated.consents.screening).toBe('granted')
  expect(updateAgencyCrmLeadRecord).toHaveBeenCalledWith(
    'org',
    'lead',
    expect.objectContaining({ budget: 10000, areaInterest: 'Newlands' }),
  )
  expect(createAgencyCrmLeadActivity).toHaveBeenCalledTimes(1)
})
it('does not discard new answers when the older five-field qualification editor saves', async () => {
  await updateRentalLeadQualification(
    'lead',
    {
      desiredArea: 'Brooklyn',
      monthlyBudget: 12000,
      bedrooms: 2,
      occupationDate: '2026-12-01',
      pets: 'No pets',
    },
    context,
  )
  expect(buildRentalLeadView(raw).qualification).toMatchObject({
    employmentStatus: 'Employed',
    depositAvailable: 'No',
    desiredArea: 'Brooklyn',
    monthlyBudget: 12000,
  })
})
it('propagates save failures rather than claiming qualification saved', async () => {
  updateAgencyCrmLeadRecord.mockRejectedValueOnce(
    new Error('Statement timeout'),
  )
  await expect(
    updateRentalLeadQualification(
      'lead',
      { desiredArea: 'Newlands', monthlyBudget: 11000 },
      context,
    ),
  ).rejects.toThrow('Statement timeout')
  expect(createAgencyCrmLeadActivity).not.toHaveBeenCalled()
})
