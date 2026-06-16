import assert from 'node:assert/strict'
import { buildSellerRequirementProfile, getRequiredSellerDocuments } from '../src/lib/sellerDocumentRequirementEngine.js'
import { resolveSellerOnboardingFlow } from '../src/lib/sellerOnboardingFlow.js'
import {
  buildCanonicalSellerOnboardingPayload,
  transformSellerOnboardingToFacts,
  validateSellerOnboardingFacts,
} from '../src/services/documents/sellerOnboardingFactTransformer.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function requirementKeys(rows = []) {
  return rows.map((row) => row.requirement_key || row.key)
}

function hasAll(values = [], expected = []) {
  const set = new Set(values)
  return expected.every((value) => set.has(value))
}

const listing = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'onboarding_completed',
  assignedAgentId: 'agent-1',
  organisationId: 'org-1',
}

const baseAddress = {
  propertyAddressDetails: {
    query: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, Gauteng, 0181',
    line1: '54 Menlyn Avenue',
    line2: '',
    suburb: 'Waterkloof Glen',
    city: 'Pretoria',
    province: 'Gauteng',
    postalCode: '0181',
    municipality: 'City of Tshwane',
    country: 'South Africa',
    source: 'manual',
  },
  propertyAddress: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, Gauteng, 0181',
  suburb: 'Waterkloof Glen',
  city: 'Pretoria',
  province: 'Gauteng',
  postalCode: '0181',
  municipality: 'City of Tshwane',
}

function buildBaseForm(overrides = {}) {
  return {
    sellerFirstName: 'Alex',
    sellerSurname: 'Manvandeland',
    email: 'alex@example.com',
    phone: '0821234567',
    maritalStatus: 'single',
    idNumber: '9001015009083',
    residentialAddress: '54 Menlyn Avenue, Waterkloof Glen, Pretoria',
    propertyCategory: 'residential',
    propertyType: 'house',
    propertyStructureType: 'freehold',
    mandateType: 'sole',
    askingPrice: '2450000',
    ...baseAddress,
    ...overrides,
  }
}

function assertScenario({ name, form, sellerBranch, propertyBranch, docKeys = [], factsChecks = [], flowChecks = [], profileChecks = [], validation = 'ok' }) {
  test(name, () => {
    const payload = buildCanonicalSellerOnboardingPayload(form, listing, {
      contextType: 'private_listing',
      contextId: listing.id,
      listingId: listing.id,
      draft: false,
    })
    const facts = payload.canonicalSellerFacts
    const flow = resolveSellerOnboardingFlow(form, listing, facts)
    const profile = buildSellerRequirementProfile(form, listing)
    const documents = getRequiredSellerDocuments(profile)
    const keys = requirementKeys(documents)
    const validationResult = validateSellerOnboardingFacts(facts, { draft: false })

    assert.equal(flow.seller_branch, sellerBranch)
    assert.equal(flow.property_branch, propertyBranch)
    assert.equal(profile.sellerBranch, sellerBranch)
    assert.equal(profile.propertyBranch, propertyBranch)
    assert.equal(facts.seller.branch, sellerBranch)
    assert.equal(facts.property.branch, propertyBranch)
    assert.equal(validationResult.ok, validation === 'ok')
    assert.equal(payload.canonicalSellerFactReadiness.validation.ok, validation === 'ok')
    assert.equal(profile.documentTriggers.length > 0, true)

    if (docKeys.length) {
      assert.equal(hasAll(keys, docKeys), true)
    }
    for (const check of factsChecks) {
      check({ facts, flow, profile, documents, keys })
    }
    for (const check of flowChecks) {
      check({ facts, flow, profile, documents, keys })
    }
    for (const check of profileChecks) {
      check({ facts, flow, profile, documents, keys })
    }
  })
}

assertScenario({
  name: 'married COP seller flow keeps spouse consent and community-of-property documents',
  sellerBranch: 'married',
  propertyBranch: 'residential',
  form: buildBaseForm({
    ownershipType: 'married_cop',
    maritalStatus: 'married',
    maritalRegime: 'in_community',
    spouseName: 'Maya Example',
    spouseIdNumber: '9001015009082',
    spouseEmail: 'maya@example.com',
    spousePhone: '0829991111',
    idNumber: '9001015009083',
  }),
  docKeys: ['marriage_certificate', 'spouse_consent', 'spouse_id_document'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.seller.marital_regime, 'in_community'),
    ({ facts }) => assert.equal(facts.seller.spouse.name, 'Maya Example'),
  ],
  flowChecks: [
    ({ flow }) => assert.ok(flow.document_triggers.includes('marriage_certificate')),
    ({ flow }) => assert.ok(flow.document_triggers.includes('spouse_consent')),
  ],
})

assertScenario({
  name: 'married ANC seller flow keeps antenuptial contract documents',
  sellerBranch: 'married',
  propertyBranch: 'residential',
  form: buildBaseForm({
    ownershipType: 'married_anc',
    maritalStatus: 'married',
    maritalRegime: 'anc',
    spouseName: 'Maya Example',
    spouseIdNumber: '9001015009082',
    idNumber: '9001015009083',
  }),
  docKeys: ['marriage_certificate', 'antenuptial_contract', 'spouse_id_document'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.seller.marital_regime, 'anc'),
    ({ facts }) => assert.equal(facts.seller.spouse.name, 'Maya Example'),
  ],
  flowChecks: [
    ({ flow }) => assert.ok(flow.document_triggers.includes('antenuptial_contract')),
    ({ flow }) => assert.ok(flow.document_triggers.includes('marriage_certificate')),
  ],
})

assertScenario({
  name: 'company seller with multiple directors keeps repeatable director records',
  sellerBranch: 'company',
  propertyBranch: 'residential',
  form: buildBaseForm({
    ownershipType: 'company',
    companyName: 'Bridge Nine Properties (Pty) Ltd',
    companyRegistrationNumber: '2024/123456/07',
    companyRegisteredAddress: '54 Menlyn Avenue, Waterkloof Glen, Pretoria',
    companyDirectors: [
      { name: 'Alex', surname: 'Principal', email: 'alex@example.com', phone: '0820000001', signingAuthority: true },
      { name: 'Sam', surname: 'Director', email: 'sam@example.com', phone: '0820000002' },
    ],
    authorisedSignatoryName: 'Alex Principal',
    authorisedSignatoryEmail: 'alex@example.com',
    authorisedSignatoryPhone: '0820000001',
  }),
  docKeys: ['company_registration', 'company_resolution_to_sell', 'director_member_ids', 'authorised_signatory_id', 'company_address_proof'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.seller.company.director_count, 2),
    ({ facts }) => assert.equal(facts.seller.company.authorised_signatory.name, 'Alex Principal'),
  ],
  profileChecks: [
    ({ profile }) => assert.equal(profile.companyDirectors.length, 2),
  ],
})

assertScenario({
  name: 'trust seller with multiple trustees keeps trustee authority intact',
  sellerBranch: 'trust',
  propertyBranch: 'residential',
  form: buildBaseForm({
    ownershipType: 'trust',
    trustName: 'Taylor Family Trust',
    trustRegistrationNumber: 'IT1234/2024',
    trustRegisteredAddress: '22 Main Road, Cape Town',
    trustees: [
      { name: 'Taylor', surname: 'Trustee', email: 'taylor@example.com', phone: '0840000001', signingAuthority: true },
      { name: 'Nadia', surname: 'Trustee', email: 'nadia@example.com', phone: '0840000002' },
    ],
    authorisedTrusteeName: 'Taylor Trustee',
    authorisedTrusteeEmail: 'taylor@example.com',
    authorisedTrusteePhone: '0840000001',
  }),
  docKeys: ['seller_trust_deed', 'seller_letters_of_authority', 'trustee_ids', 'trust_resolution_to_sell', 'authorised_trustee_signatory_id'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.seller.trust.trustee_count, 2),
    ({ facts }) => assert.equal(facts.seller.trust.authorised_trustee.name, 'Taylor Trustee'),
  ],
  profileChecks: [
    ({ profile }) => assert.equal(profile.trustTrustees.length, 2),
  ],
})

assertScenario({
  name: 'multiple owners with split shares require consent from everyone',
  sellerBranch: 'multiple_owners',
  propertyBranch: 'residential',
  form: buildBaseForm({
    ownershipType: 'multiple_owners',
    multipleOwners: [
      { name: 'Alex', surname: 'Owner', idNumber: '9001015009083', consentToSell: true, ownershipShare: '60' },
      { name: 'Kim', surname: 'Owner', idNumber: '9001015009084', consentToSell: true, ownershipShare: '40' },
    ],
  }),
  docKeys: ['ownership_split_confirmation', 'all_owner_authority_consent', 'owner_1_id_document', 'owner_2_id_document'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.seller.owners.length, 2),
    ({ facts }) => assert.equal(facts.seller.owners[0].ownership_share, 60),
    ({ facts }) => assert.equal(facts.seller.owners[1].ownership_share, 40),
  ],
  profileChecks: [
    ({ profile }) => assert.equal(profile.ownerCount, 2),
  ],
})

assertScenario({
  name: 'deceased estate flow keeps executor authority and estate documents',
  sellerBranch: 'deceased_estate',
  propertyBranch: 'residential',
  form: buildBaseForm({
    ownershipType: 'deceased_estate',
    executorName: 'Pat Executor',
    executorEmail: 'pat@example.com',
    executorPhone: '0850000001',
    estateReference: 'EST-2026-01',
    executorAuthorityDetails: 'Letters of executorship issued by the Master of the High Court.',
  }),
  docKeys: ['seller_executor_authority', 'deceased_death_certificate', 'executor_id_document', 'estate_owner_details'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.seller.deceased_estate.executor_name, 'Pat Executor'),
    ({ facts }) => assert.equal(facts.seller.deceased_estate.authority_details, 'Letters of executorship issued by the Master of the High Court.'),
  ],
})

assertScenario({
  name: 'power of attorney flow keeps principal and authority details',
  sellerBranch: 'power_of_attorney',
  propertyBranch: 'residential',
  form: buildBaseForm({
    ownershipType: 'power_of_attorney',
    powerOfAttorneyName: 'Sam Agent',
    powerOfAttorneyEmail: 'sam@example.com',
    powerOfAttorneyPhone: '0830000001',
    powerOfAttorneyPrincipalName: 'Pat Principal',
    powerOfAttorneyPrincipalIdNumber: '8001015009080',
    powerOfAttorneyAuthorityDetails: 'POA-2026-01 / authority note',
  }),
  docKeys: ['power_of_attorney_document', 'principal_identity'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.seller.power_of_attorney.principal.name, 'Pat Principal'),
    ({ facts }) => assert.equal(facts.seller.power_of_attorney.reference, 'POA-2026-01 / authority note'),
  ],
})

assertScenario({
  name: 'sectional title in an estate keeps both sectional and estate documents',
  sellerBranch: 'individual',
  propertyBranch: 'sectional_title',
  form: buildBaseForm({
    propertyType: 'apartment',
    propertyStructureType: 'sectional_title',
    sectionalTitle: true,
    estateOrHoa: true,
    estateName: 'The Oaks Estate',
    estateComplexName: 'The Oaks Estate',
    schemeName: 'The Oaks',
    unitNumber: '12',
    sectionNumber: '12',
    schemeBodyCorporateName: 'The Oaks Body Corporate',
    schemeManagingAgentName: 'Gemini Managing Agents',
    schemeManagingAgentEmail: 'agent@example.com',
    hoaContactName: 'Estate Manager',
    hoaContactEmail: 'hoa@example.com',
  }),
  docKeys: ['levy_statement', 'body_corporate_details', 'hoa_levy_statement', 'hoa_contact_details'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.property.sectional_title, true),
    ({ facts }) => assert.equal(facts.property.estate_or_hoa, true),
    ({ facts }) => assert.equal(facts.property.scheme.name, 'The Oaks'),
    ({ facts }) => assert.equal(facts.property.estate.name, 'The Oaks Estate'),
  ],
  flowChecks: [
    ({ flow }) => assert.ok(flow.document_triggers.includes('body_corporate_details')),
  ],
})

assertScenario({
  name: 'tenant occupied property keeps lease and tenant follow-ups',
  sellerBranch: 'individual',
  propertyBranch: 'residential',
  form: buildBaseForm({
    occupancyStatus: 'tenant_occupied',
    leaseExists: true,
    leaseExpiryDate: '2026-11-30',
    tenantName: 'Tenant Name',
    tenantContactDetails: 'tenant@example.com / 0823334444',
  }),
  docKeys: ['lease_agreement', 'tenant_details'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.occupancy.status, 'tenant_occupied'),
    ({ facts }) => assert.equal(facts.occupancy.lease_expiry_date, '2026-11-30'),
  ],
})

assertScenario({
  name: 'existing bond flow keeps cancellation and settlement tasks',
  sellerBranch: 'individual',
  propertyBranch: 'residential',
  form: buildBaseForm({
    existingBond: true,
    bondBank: 'FNB',
    bondAccountReference: 'BOND-123',
    estimatedSettlementAmount: '1685000',
    cancellationRequired: true,
    cancellationAttorneyKnown: true,
    cancellationAttorneyDetails: 'Meyer & Co Attorneys',
  }),
  docKeys: ['bond_statement', 'bond_bank_details', 'bond_cancellation_attorney_details', 'settlement_figure'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.finance.existing_bond, true),
    ({ facts }) => assert.equal(facts.finance.bond_bank, 'FNB'),
  ],
  flowChecks: [
    ({ flow }) => assert.ok(flow.document_triggers.includes('bond_statement')),
    ({ flow }) => assert.ok(flow.document_triggers.includes('settlement_figure')),
  ],
})

assertScenario({
  name: 'commercial property keeps operating context and commercial compliance',
  sellerBranch: 'individual',
  propertyBranch: 'commercial',
  form: buildBaseForm({
    propertyCategory: 'commercial',
    propertyType: 'office_building',
    propertyStructureType: 'freehold',
    commercialUseDescription: 'Ground floor office and retail foyer',
    floorSize: '420',
    monthlyWaterSpend: '1500',
    monthlyElectricitySpend: '6000',
  }),
  docKeys: ['zoning_certificate', 'occupation_certificate'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.property.commercial_property, true),
    ({ facts }) => assert.equal(facts.property.use.description, 'Ground floor office and retail foyer'),
    ({ facts }) => assert.equal(facts.property.floor_size, 420),
  ],
  profileChecks: [
    ({ profile }) => assert.equal(profile.propertyBranch, 'commercial'),
  ],
  flowChecks: [
    ({ flow }) => assert.ok(flow.document_triggers.includes('commercial_use_summary')),
  ],
})

assertScenario({
  name: 'mixed use property keeps mixed-use classification and publication tasks',
  sellerBranch: 'individual',
  propertyBranch: 'mixed_use',
  form: buildBaseForm({
    propertyCategory: 'mixed_use',
    propertyType: 'mixed_use_building',
    propertyStructureType: 'freehold',
    commercialUseDescription: 'Residential units above street-level retail',
    mixedUseSplit: 'Residential 60% / retail 40%',
    floorSize: '510',
  }),
  docKeys: ['zoning_certificate', 'occupation_certificate'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.property.branch, 'mixed_use'),
    ({ facts }) => assert.equal(facts.property.use.mixed_use_split, 'Residential 60% / retail 40%'),
  ],
  flowChecks: [
    ({ flow }) => assert.ok(flow.document_triggers.includes('mixed_use_summary')),
  ],
})

assertScenario({
  name: 'vacant land keeps zoning and SG diagram requirements',
  sellerBranch: 'individual',
  propertyBranch: 'vacant_land',
  form: buildBaseForm({
    propertyCategory: 'vacant_land',
    propertyType: 'vacant_land',
    propertyStructureType: 'vacant_land',
    erfSize: '850',
    landZoning: 'Residential',
    landServicesAvailable: 'Water, electricity, access road',
    sgDiagramAvailable: true,
  }),
  docKeys: ['zoning_certificate', 'sg_diagram'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.property.branch, 'vacant_land'),
    ({ facts }) => assert.equal(facts.property.erf_size, 850),
  ],
})

assertScenario({
  name: 'agricultural property keeps water source and land-size checks',
  sellerBranch: 'individual',
  propertyBranch: 'agricultural',
  form: buildBaseForm({
    propertyCategory: 'agricultural',
    propertyType: 'farm',
    propertyStructureType: 'agricultural_holding',
    erfSize: '120000',
    landZoning: 'Agricultural',
    landWaterSource: 'Borehole',
    landServicesAvailable: 'Borehole water, electricity, gravel access road',
    boreholeInstallation: true,
  }),
  docKeys: ['zoning_certificate', 'water_source_details', 'borehole_certificate'],
  factsChecks: [
    ({ facts }) => assert.equal(facts.property.branch, 'agricultural'),
    ({ facts }) => assert.equal(facts.property.land.water_source, 'Borehole'),
  ],
})

console.log('seller onboarding South African scenario tests passed')
