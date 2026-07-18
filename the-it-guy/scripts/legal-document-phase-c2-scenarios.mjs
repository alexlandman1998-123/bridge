import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'

const common = {
  privateListing: { propertyAddress: '1 Example Road', suburb: 'Example Park', city: 'Johannesburg', province: 'Gauteng', propertyType: 'house', askingPrice: 2500000 },
  organisation: { legalName: 'Example Estate Agency (Pty) Ltd', tradingName: 'Example Estates', registrationNumber: '2020/000001/07', fspNumber: 'FSP 00000', address: '2 Example Avenue, Johannesburg' },
  agent: { fullName: 'Alex Agent', email: 'agent@example.invalid', phone: '+27 10 000 0000', ffcNumber: 'FFC-EXAMPLE' },
  mandateDraft: { mandateType: 'sole', mandateStartDate: '2026-08-01', mandateEndDate: '2026-11-01', askingPrice: 2500000, commissionStructure: 'percentage', commissionPercent: 5, vatHandling: 'inclusive', propertyAddress: '1 Example Road, Example Park, Johannesburg', propertySuburb: 'Example Park', propertyCity: 'Johannesburg', propertyType: 'house' },
}

const definitions = [
  { key: 'individual_single', seller: { sellerFullName: 'Sam Seller', sellerIdNumber: '9001010000000', sellerEmail: 'seller@example.invalid', sellerPhone: '+27 82 000 0000', sellerEntityType: 'individual', sellerMaritalStatus: 'single' } },
  { key: 'individual_married', seller: { sellerFullName: 'Morgan Seller', sellerIdNumber: '9001010000001', sellerEmail: 'married@example.invalid', sellerPhone: '+27 82 000 0001', sellerEntityType: 'individual', sellerMaritalStatus: 'married in community of property', sellerSpouseFullName: 'Taylor Seller', sellerSpouseIdNumber: '9001010000002', sellerSpouseConsentRequired: true } },
  { key: 'company', seller: { sellerFullName: 'Example Property Company (Pty) Ltd', sellerIdNumber: '2020/000002/07', sellerEmail: 'company@example.invalid', sellerPhone: '+27 10 000 0002', sellerEntityType: 'company', sellerCompanyRegistrationNumber: '2020/000002/07', sellerRepresentativeName: 'Casey Director', sellerRepresentativeIdNumber: '9001010000003', sellerRepresentativeCapacity: 'Director' } },
  { key: 'trust', seller: { sellerFullName: 'Example Property Trust', sellerIdNumber: 'IT000001/2020', sellerEmail: 'trust@example.invalid', sellerPhone: '+27 10 000 0003', sellerEntityType: 'trust', sellerTrustRegistrationNumber: 'IT000001/2020', sellerRepresentativeName: 'Jordan Trustee', sellerRepresentativeIdNumber: '9001010000004', sellerRepresentativeCapacity: 'Trustee', sellerTrusteeNames: 'Jordan Trustee; Riley Trustee', sellerResolutionDate: '2026-07-31' } },
]

export function buildC2Scenarios() {
  return definitions.map(({ key, seller }) => {
    const mapped = mapSellerOnboardingToMandateData({ ...common, onboardingSubmission: { status: 'completed' }, mandateDraft: { ...common.mandateDraft, ...seller } })
    return { key, placeholders: mapped.placeholders, warningCount: mapped.warnings.length }
  })
}
