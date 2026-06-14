import assert from 'node:assert/strict'
import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../src/lib/sellerDocumentRequirementEngine.js'
import {
  getSellerOnboardingBranchSummary,
  getSellerOnboardingDocumentTriggers,
  getSellerOnboardingRequiredFields,
  getSellerOnboardingVisibleFields,
  resolveSellerOnboardingFlow,
} from '../src/lib/sellerOnboardingFlow.js'
import { resolveSellerOnboardingFlowContract } from '../src/lib/sellerOnboardingFlowContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function requirementKeys(requirements = []) {
  return requirements.map((row) => row.requirement_key)
}

const listing = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'onboarding_completed',
  assignedAgentId: 'agent-1',
  organisationId: 'org-1',
}

test('resolves the married sectional title branch contract', () => {
  const flow = resolveSellerOnboardingFlowContract(
    {
      ownershipType: 'married_cop',
      maritalRegime: 'in_community',
      sellerFirstName: 'Alex',
      sellerSurname: 'Manvandeland',
      email: 'alex@example.com',
      phone: '0820000000',
      idNumber: '9001015009083',
      residentialAddress: '54 Menlyn Avenue, Waterkloof Glen',
      propertyCategory: 'residential',
      propertyStructureType: 'sectional_title',
      sectionalTitle: true,
      schemeName: 'The Oaks',
      unitNumber: '12',
      sectionNumber: '12',
      bodyCorporate: true,
      gasInstallation: true,
      recentAlterations: true,
    },
    listing,
  )

  assert.equal(flow.seller_branch, 'married')
  assert.equal(flow.property_branch, 'sectional_title')
  assert.equal(flow.seller_branch_label, 'Married')
  assert.equal(flow.property_branch_label, 'Sectional Title')
  assert.ok(flow.required_fields.includes('seller.marital_regime'))
  assert.ok(flow.required_fields.includes('property.category'))
  assert.ok(flow.required_fields.includes('property.structure_type'))
  assert.ok(flow.document_triggers.includes('title_deed_copy'))
  assert.ok(flow.document_triggers.includes('body_corporate_details'))
  assert.ok(flow.document_triggers.includes('gas_compliance_certificate'))
})

test('shares visible and required fields through the flow helper', () => {
  const flow = resolveSellerOnboardingFlow(
    {
      ownershipType: 'trust',
      sellerFirstName: 'Taylor',
      sellerSurname: 'Trustee',
      email: 'taylor@example.com',
      phone: '0840000000',
      trustName: 'The Taylor Family Trust',
      trustRegistrationNumber: 'IT1234/2024',
      trustRegisteredAddress: '22 Main Road, Cape Town',
      trusteeName: 'Taylor Trustee',
      propertyCategory: 'residential',
      propertyStructureType: 'estate',
      estateOrHoa: true,
      estateName: 'Waterfall Heights',
      occupancyStatus: 'tenant_occupied',
      leaseExists: true,
      leaseExpiryDate: '2026-11-30',
      solarInstallation: true,
      propertyAddress: '22 Waterfall Road, Midrand',
      suburb: 'Midrand',
      province: 'Gauteng',
      municipality: 'City of Johannesburg',
    },
    listing,
  )

  assert.equal(flow.seller_branch, 'trust')
  assert.equal(flow.property_branch, 'estate_hoa')
  assert.ok(flow.visible_fields.includes('seller.ownership_type'))
  assert.ok(flow.visible_fields.includes('property.category'))
  assert.ok(flow.visible_fields.includes('property.address.line_1'))
  assert.ok(flow.visible_fields.includes('property.address.postal_code'))
  assert.ok(flow.visible_fields.includes('property.estate.name'))
  assert.ok(flow.visible_fields.includes('property.estate.hoa_contact.name'))
  assert.ok(flow.visible_fields.includes('property.estate.management_company'))
  assert.ok(flow.visible_fields.includes('seller.trust.authorised_trustee.email'))
  assert.ok(flow.visible_fields.includes('seller.trust.authorised_trustee.phone'))
  assert.ok(flow.required_fields.includes('seller.trust.name'))
  assert.ok(flow.required_fields.includes('seller.trust.registration_number'))
  assert.ok(flow.required_fields.includes('property.category'))
  assert.ok(flow.required_fields.includes('property.structure_type'))
  assert.ok(flow.document_triggers.includes('hoa_levy_statement'))
  assert.ok(flow.document_triggers.includes('solar_compliance_documents'))
  assert.equal(new Set(flow.visible_fields).size, flow.visible_fields.length)
  assert.deepEqual(getSellerOnboardingVisibleFields(flow), flow.visible_fields)
  assert.deepEqual(getSellerOnboardingRequiredFields(flow), flow.required_fields)
  assert.deepEqual(getSellerOnboardingDocumentTriggers(flow), flow.document_triggers)

  const branchSummary = getSellerOnboardingBranchSummary(flow)
  assert.equal(branchSummary.seller.key, 'trust')
  assert.equal(branchSummary.property.key, 'estate_hoa')
})

test('captures authority details and consent for estate, poa, and multiple owners', () => {
  const estateFlow = resolveSellerOnboardingFlow(
    {
      ownershipType: 'deceased_estate',
      sellerFirstName: 'Pat',
      sellerSurname: 'Executor',
      email: 'pat@example.com',
      phone: '0840000000',
      executorName: 'Pat Executor',
      estateReference: 'EST-2026-01',
      executorAuthorityDetails: 'Letters of executorship issued by the Master of the High Court.',
      propertyCategory: 'residential',
      propertyStructureType: 'freehold',
      propertyAddress: '1 Main Road',
      suburb: 'Cape Town',
      province: 'Western Cape',
    },
    listing,
  )
  assert.ok(estateFlow.required_fields.includes('seller.deceased_estate.authority_details'))
  assert.ok(estateFlow.visible_fields.includes('seller.deceased_estate.authority_details'))

  const poaFlow = resolveSellerOnboardingFlow(
    {
      ownershipType: 'power_of_attorney',
      sellerFirstName: 'Sam',
      sellerSurname: 'Agent',
      email: 'sam@example.com',
      phone: '0830000000',
      powerOfAttorneyName: 'Sam Agent',
      powerOfAttorneyPrincipalName: 'Pat Principal',
      powerOfAttorneyPrincipalIdNumber: '8001015009080',
      powerOfAttorneyAuthorityDetails: 'POA-2026-01 / authority note',
      propertyCategory: 'vacant_land',
      propertyStructureType: 'vacant_land',
      propertyAddress: 'Farm 12',
      suburb: 'Bela-Bela',
      province: 'Limpopo',
    },
    listing,
  )
  assert.ok(poaFlow.required_fields.includes('seller.power_of_attorney.authority_details'))
  assert.ok(poaFlow.visible_fields.includes('seller.power_of_attorney.authority_details'))

  const ownersFlow = resolveSellerOnboardingFlow(
    {
      ownershipType: 'multiple_owners',
      sellerFirstName: 'Alex',
      sellerSurname: 'Owner',
      email: 'alex@example.com',
      phone: '0820000000',
      multipleOwners: [
        { name: 'Alex', surname: 'Owner', idNumber: '9001015009083', consentToSell: true },
        { name: 'Kim', surname: 'Owner', idNumber: '9001015009084', consentToSell: true },
      ],
      propertyCategory: 'residential',
      propertyStructureType: 'freehold',
      propertyAddress: '1 Main Road',
      suburb: 'Cape Town',
      province: 'Western Cape',
    },
    listing,
  )
  assert.ok(ownersFlow.required_fields.includes('seller.owners[].consent_to_sell'))
  assert.ok(ownersFlow.visible_fields.includes('seller.owners[].ownership_share'))
})

test('generates company sectional title document requirements', () => {
  const profile = buildSellerRequirementProfile(
    {
      ownershipType: 'company',
      sellerFirstName: 'Alex',
      sellerSurname: 'Principal',
      email: 'alex@example.com',
      phone: '0820000000',
      companyName: 'Bridge Nine Properties (Pty) Ltd',
      companyRegistrationNumber: '2024/123456/07',
      companyRegisteredAddress: '54 Menlyn Avenue, Waterkloof Glen, Pretoria',
      companyDirectorName: 'Alex Principal',
      companyDirectorEmail: 'alex@example.com',
      companyDirectorPhone: '0820000000',
      propertyCategory: 'residential',
      propertyStructureType: 'sectional_title',
      sectionalTitle: true,
      schemeName: 'The Oaks',
      unitNumber: '12',
      sectionNumber: '12',
      bodyCorporate: true,
      existingBond: true,
      bondStatus: 'bonded',
      gasInstallation: true,
      askingPrice: 2450000,
      propertyAddress: '54 Menlyn Avenue, Waterkloof Glen',
      suburb: 'Waterkloof Glen',
      province: 'Gauteng',
      municipality: 'City of Tshwane',
    },
    listing,
  )
  const documents = getRequiredSellerDocuments(profile)
  const keys = requirementKeys(documents)

  assert.equal(profile.sellerBranch, 'company')
  assert.equal(profile.propertyBranch, 'sectional_title')
  assert.ok(keys.includes('signed_mandate'))
  assert.ok(keys.includes('title_deed_copy'))
  assert.ok(keys.includes('company_registration'))
  assert.ok(keys.includes('company_resolution_to_sell'))
  assert.ok(keys.includes('levy_statement'))
  assert.ok(keys.includes('body_corporate_details'))
  assert.ok(keys.includes('bond_statement'))
  assert.ok(keys.includes('gas_compliance_certificate'))
})

test('generates trust estate HOA and tenant documents', () => {
  const profile = buildSellerRequirementProfile(
    {
      ownershipType: 'trust',
      sellerFirstName: 'Taylor',
      sellerSurname: 'Trustee',
      email: 'taylor@example.com',
      phone: '0840000000',
      trustName: 'The Taylor Family Trust',
      trustRegistrationNumber: 'IT1234/2024',
      trustRegisteredAddress: '22 Main Road, Cape Town',
      trusteeName: 'Taylor Trustee',
      trusteeEmail: 'taylor@example.com',
      trusteePhone: '0840000000',
      propertyCategory: 'residential',
      propertyStructureType: 'estate',
      estateOrHoa: true,
      estateName: 'Waterfall Heights',
      hoaName: 'Waterfall Heights HOA',
      occupancyStatus: 'tenant_occupied',
      leaseExists: true,
      leaseExpiryDate: '2026-11-30',
      solarInstallation: true,
      propertyAddress: '22 Waterfall Road, Midrand',
      suburb: 'Midrand',
      province: 'Gauteng',
      municipality: 'City of Johannesburg',
    },
    listing,
  )
  const documents = getRequiredSellerDocuments(profile)
  const keys = requirementKeys(documents)

  assert.equal(profile.sellerBranch, 'trust')
  assert.equal(profile.propertyBranch, 'estate_hoa')
  assert.ok(keys.includes('seller_trust_deed'))
  assert.ok(keys.includes('seller_letters_of_authority'))
  assert.ok(keys.includes('trust_resolution_to_sell'))
  assert.ok(keys.includes('hoa_levy_statement'))
  assert.ok(keys.includes('hoa_contact_details'))
  assert.ok(keys.includes('lease_agreement'))
  assert.ok(keys.includes('tenant_details'))
  assert.ok(keys.includes('solar_compliance_documents'))
})

test('generates power of attorney and land branch documents', () => {
  const profile = buildSellerRequirementProfile(
    {
      ownershipType: 'power_of_attorney',
      sellerFirstName: 'Sam',
      sellerSurname: 'Agent',
      email: 'sam@example.com',
      phone: '0830000000',
      powerOfAttorneyName: 'Sam Agent',
      powerOfAttorneyPrincipalName: 'Pat Principal',
      powerOfAttorneyPrincipalIdNumber: '8001015009080',
      powerOfAttorneyReference: 'POA-2026-01',
      propertyCategory: 'vacant_land',
      propertyStructureType: 'vacant_land',
      propertyAddress: 'Farm 12, Bela-Bela',
      suburb: 'Bela-Bela',
      province: 'Limpopo',
      municipality: 'Waterberg',
      boreholeInstallation: true,
      recentAlterations: true,
    },
    listing,
  )
  const documents = getRequiredSellerDocuments(profile)
  const keys = requirementKeys(documents)

  assert.equal(profile.sellerBranch, 'power_of_attorney')
  assert.equal(profile.propertyBranch, 'vacant_land')
  assert.ok(profile.documentTriggers.includes('power_of_attorney_document'))
  assert.ok(profile.documentTriggers.includes('principal_identity'))
  assert.ok(keys.includes('power_of_attorney_document'))
  assert.ok(keys.includes('principal_identity'))
  assert.ok(keys.includes('zoning_certificate'))
  assert.ok(keys.includes('sg_diagram'))
  assert.ok(keys.includes('borehole_certificate'))
  assert.ok(keys.includes('alteration_approvals'))
})

console.log('seller onboarding flow contract tests passed')
