import { expect, it } from 'vitest'
import { buildDevelopmentPartnerOptions } from '../developmentPartnerSetupModel'

it('keeps partners eligible for a new development, combines their actual logos and avoids duplicate organisations', () => {
  const options = buildDevelopmentPartnerOptions([
    { id: 'stbb', partnerOrganisationId: 'stbb-org', partnerType: 'transfer_attorney', companyName: 'STBB', isActive: true, isPreferredDefault: true },
    { id: 'other-development', partnerType: 'transfer_attorney', companyName: 'Scoped Firm', scopeType: 'specific_developments', isActive: true },
    { id: 'inactive', partnerType: 'transfer_attorney', companyName: 'Inactive Firm', isActive: false },
    { id: 'bond', partnerType: 'bond_originator', companyName: 'Bond Partner', isActive: true },
  ], [
    { id: 'relationship', partnerOrganisationId: 'stbb-org', partnerType: 'transfer_attorney', partnerName: 'STBB', status: 'active', partnerOrganisation: { logoUrl: '/stbb.svg' } },
    { id: 'pending', partnerType: 'transfer_attorney', partnerName: 'Pending Firm', status: 'invited' },
    { id: 'active', partnerType: 'transfer_attorney', partnerName: 'Active Firm', status: 'active', scopeType: 'all_developments' },
  ], 'transfer_attorney')
  expect(options.map((option) => option.name)).toEqual(['STBB', 'Active Firm'])
  expect(options[0]).toMatchObject({ preferredPartnerId: 'stbb', relationshipId: 'relationship', organisationId: 'stbb-org', logoUrl: '/stbb.svg' })
})
