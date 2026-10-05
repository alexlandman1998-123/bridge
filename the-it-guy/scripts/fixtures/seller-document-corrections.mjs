import { buildSellerOnboardingSigningPackSnapshot } from '../../src/core/documents/sellerOnboardingSigningPackSnapshot.js'
import { buildSellerComplianceDocumentModel } from '../../src/core/documents/sellerComplianceDocumentModel.js'
import { buildFicaDeclarationDocumentModel } from '../../src/core/documents/ficaDeclarationDocumentModel.js'
import { buildSellerSigningCorrectionEditData, validateSellerSigningDocumentCorrections } from '../../src/core/documents/sellerSigningDocumentCorrections.js'
import { PROPERTY_DISCLOSURE_QUESTIONS } from '../../src/lib/propertyDisclosure.js'

export function createSellerCorrectionFixture(branch = 'individual') {
  const primary = { firstName: 'Original', surname: 'Primary', idNumber: 'ORIGINAL-ID', email: 'primary@example.test', phone: '0820000000', residentialAddress: 'Original Home Address', signingAuthority: true, authorityDetails: 'Recorded authority' }
  const secondary = { firstName: 'Second', surname: 'Owner', idNumber: 'SECOND-OWNER-ID', email: 'second@example.test', phone: '0820000001', residentialAddress: 'Second Home Address', signingAuthority: true, authorityDetails: 'Separate recorded authority' }
  const form = {
    ownerStructureType: branch, ownershipType: branch, sellerFirstName: primary.firstName, sellerSurname: primary.surname,
    idNumber: primary.idNumber, email: primary.email, phone: primary.phone, residentialAddress: primary.residentialAddress,
    primaryContactName: 'Original Primary', maritalStatus: 'single', sellerTaxNumber: 'ORIGINAL-TAX', taxResident: 'sa_resident',
    propertyAddress: 'Original Property Address', propertyAddressDetails: { line1: 'Original Property Address', city: 'Original City', province: 'Gauteng' },
    propertyAddressLine1: 'Original Property Address', city: 'Original City', province: 'Gauteng',
    occupation: 'Original Occupation', sourceOfFunds: 'Original Funds', politicallyExposedPerson: 'no', popiConsentAccepted: true,
    propertyDisclosure: { decision: 'none', responses: Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map(question => [question.key, { answer: 'no', note: '' }])),
      comments: 'Original disclosure comment', otherDisclosure: 'Original disclosure comment',
      signature: 'HISTORIC-SOURCE-SIGNATURE', signedAt: '2026-09-01T10:00:00Z', signedPlace: 'Original Signing Place', declarationAccepted: true },
  }
  let roles = ['Seller']
  if (branch === 'multiple_owners') { form.multipleOwners = [primary, secondary]; roles = ['Owner 1', 'Owner 2'] }
  if (['company', 'close_corporation', 'foreign_company'].includes(branch)) {
    Object.assign(form, { companyName: 'Original Entity Holdings', companyRegistrationNumber: 'ENTITY-REG-2026', companyRegisteredAddress: 'Entity Registered Address',
      authorisedSignatoryName: 'Original Primary', authorisedSignatoryIdNumber: primary.idNumber, authorisedSignatoryCapacity: 'Director', companyAuthorityBasis: 'Board resolution', companyDirectors: [primary, secondary] })
    roles = ['Director', 'Director']
  }
  if (['trust', 'foreign_trust'].includes(branch)) {
    Object.assign(form, { trustName: 'Original Entity Trust', trustRegistrationNumber: 'TRUST-REG-2026', trustRegisteredAddress: 'Trust Registered Address',
      authorisedTrusteeName: 'Original Primary', authorisedTrusteeIdNumber: primary.idNumber, authorisedTrusteeCapacity: 'Trustee', trustAuthorityBasis: 'Trust resolution', trustees: [primary, secondary] })
    roles = ['Trustee', 'Trustee']
  }
  if (branch === 'deceased_estate') {
    Object.assign(form, { deceasedEstateName: 'Estate Late Legal Owner', estateReference: 'ESTATE-REF-2026', executorName: 'Original Primary', executorEmail: primary.email, executors: [primary, secondary] })
    roles = ['Executor', 'Executor']
  }
  if (branch === 'power_of_attorney') {
    Object.assign(form, { powerOfAttorneyPrincipalName: 'Unchanged Principal', powerOfAttorneyPrincipalIdNumber: 'PRINCIPAL-ID', powerOfAttorneyName: 'Original Primary', powerOfAttorneyEmail: primary.email, powerOfAttorneyRepresentatives: [primary, secondary] })
    roles = ['Representative', 'Representative']
  }
  if (branch === 'other') Object.assign(form, { otherEntityName: 'Original Legal Association', otherEntityRegistrationNumber: 'ASSOCIATION-REG', otherEntityAuthorityDetails: 'Recorded authority' })
  if (branch === 'foreign_individual') Object.assign(form, { foreignPassportNumber: primary.idNumber, nationality: 'Foreign nationality', foreignOwnerCountry: 'Foreign country' })
  if (branch === 'married') Object.assign(form, { maritalStatus: 'married', maritalRegime: 'in_community', spouseName: 'Second Owner', spouseIdNumber: secondary.idNumber, spouseEmail: secondary.email })
  const signers = [primary, ...(roles.length > 1 || branch === 'married' ? [secondary] : [])].map((person, index) => ({ name: `${person.firstName} ${person.surname}`, email: person.email, role: roles[index] || 'Spouse' }))
  const branding = { organisationName: 'Correction Test Agency', primaryColour: '#173d35', logoLightUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><rect width="200" height="50" fill="#ce147e"/><text x="8" y="33" fill="white" font-size="24">TEST AGENCY</text></svg>').toString('base64') }
  const snapshot = buildSellerOnboardingSigningPackSnapshot({ formData: form, listing: { id: 'SYNTHETIC-CORRECTIONS-ONLY' },
    recipients: signers, branding, generatedAt: '2026-10-04T10:00:00Z', mandate: { mandateType: 'sole', askingPrice: '2450000', startDate: '2026-10-04', endDate: '2027-01-04', protectionPeriodDays: 90, specialConditions: 'Original special conditions', mandateTerms: 'Original legacy conditions' } })
  const compliance = buildSellerComplianceDocumentModel({ formData: form, signing: { signers } })
  const ficaModel = buildFicaDeclarationDocumentModel({ partyType: 'seller', party: snapshot.seller, sections: compliance.ficaSections, property: snapshot.property,
    signing: { signers }, branding, declaration: { wording: 'Frozen agency declaration wording.', wordingVersion: 'frozen-wording-v1' }, transaction: { reference: snapshot.documentReference } })
  form.sellerPostOnboardingDrafts = { documents: [{ targetRequirementKey: 'signed_fica_declaration', metadata: { ficaDeclarationModel: ficaModel } }] }
  return { form, signers, document: { requiredSigners: signers, versionId: 'approved-source-v1', versionDigest: 'frozen-source-digest', generatedHtml: 'IMMUTABLE-APPROVED-HTML' },
    approval: { status: 'approved', commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } },
    pack: { signingPackSnapshot: snapshot, versionHistory: [{ documents: [{ generatedHtml: 'HISTORIC-SIGNED-HTML', signatureEvidenceId: 'preserved-evidence' }] }] },
  }
}

export function sellerCorrectionValues(copy, key, overrides = {}) {
  const edit = buildSellerSigningCorrectionEditData(copy, key)
  return validateSellerSigningDocumentCorrections({ ...edit, ...overrides,
    common: { ...edit.common, sellerName: 'Corrected Primary', idNumber: 'CORRECTED-ID', residentialAddress: 'Corrected Home Address', email: 'contact-correction@example.test', phone: '0830000000', propertyAddress: 'Corrected Property Address', ...overrides.common },
    ...(edit.fica ? { fica: { ...edit.fica, incomeTaxNumber: 'CORRECTED-TAX', occupation: 'Corrected Occupation', sourceOfIncome: 'Corrected Funds', ...overrides.fica } } : {}),
    ...(edit.mandate ? { mandate: { ...edit.mandate, ...overrides.mandate } } : {}),
    ...(edit.disclosure ? { disclosure: { ...edit.disclosure, ...overrides.disclosure } } : {}),
  }, key)
}
