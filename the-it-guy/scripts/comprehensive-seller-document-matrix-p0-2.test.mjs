import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../src/lib/sellerDocumentRequirementEngine.js'
import { transformSellerOnboardingToFacts } from '../src/services/documents/sellerOnboardingFactTransformer.js'
import { buildSellerDocumentRequestPlan } from '../src/services/sellerDocumentRequestOrchestrationService.js'

const listing = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'onboarding_completed',
  assignedAgentId: 'agent-1',
  organisationId: 'org-1',
}

function requirementsFor(overrides = {}) {
  const form = {
    sellerFirstName: 'Seller',
    sellerSurname: 'Example',
    email: 'seller@example.com',
    phone: '0821234567',
    idNumber: '9001015009083',
    residentialAddress: '1 Example Road',
    ownershipType: 'individual',
    maritalStatus: 'single',
    propertyCategory: 'residential',
    propertyType: 'house',
    propertyStructureType: 'freehold',
    propertyAddress: '1 Example Road, Cape Town',
    suburb: 'Gardens',
    city: 'Cape Town',
    province: 'Western Cape',
    postalCode: '8001',
    municipality: 'City of Cape Town',
    mandateType: 'sole',
    askingPrice: 3000000,
    ...overrides,
  }
  const profile = buildSellerRequirementProfile(form, listing)
  return {
    form,
    profile,
    facts: transformSellerOnboardingToFacts(form, listing),
    requirements: getRequiredSellerDocuments(profile),
  }
}

function byKey(rows, key) {
  return rows.find((row) => row.requirement_key === key)
}

{
  const { requirements } = requirementsFor()
  for (const key of [
    'seller_bank_account_confirmation',
    'seller_tax_number',
    'property_acquisition_record',
    'capital_improvement_records',
    'water_installation_certificate',
  ]) {
    assert.ok(byKey(requirements, key), `base Cape Town matrix must include ${key}`)
  }
  assert.equal(byKey(requirements, 'seller_bank_account_confirmation').is_required, false)
  assert.equal(byKey(requirements, 'water_installation_certificate').is_required, true)
  assert.equal(byKey(requirements, 'beetle_certificate'), undefined)

  const plan = buildSellerDocumentRequestPlan({
    listing: { ...listing, seller: { email: 'seller@example.com' } },
    requirements: requirements.map((requirement, index) => ({ ...requirement, id: `base-${index + 1}` })),
  })
  assert.ok(plan.issued.some((item) => item.requirementKey === 'water_installation_certificate'))
  assert.ok(plan.suppressed.some((item) => item.requirement?.requirement_key === 'seller_bank_account_confirmation'))
}

{
  const { profile, requirements, facts } = requirementsFor({
    beetleCertificateRegion: true,
    plumbingCertificateRequired: true,
    recentAlterations: true,
    approvedBuildingPlansAvailable: false,
  })
  for (const key of ['beetle_certificate', 'plumbing_certificate', 'approved_building_plans', 'occupation_certificate', 'alteration_approvals']) {
    assert.ok(byKey(requirements, key), `alteration/compliance matrix must include ${key}`)
  }
  assert.ok(profile.documentTriggers.includes('beetle_certificate'))
  assert.ok(profile.documentTriggers.includes('approved_building_plans'))
  assert.equal(facts.property.alterations.recent, true)
}

{
  const { requirements } = requirementsFor({
    propertyType: 'apartment',
    propertyStructureType: 'sectional_title',
    sectionalTitle: true,
    schemeName: 'Example Scheme',
  })
  for (const key of ['levy_statement', 'body_corporate_details', 'body_corporate_rules', 'body_corporate_insurance_schedule']) {
    assert.ok(byKey(requirements, key), `sectional-title matrix must include ${key}`)
  }
  assert.equal(byKey(requirements, 'body_corporate_rules').is_required, false)
}

{
  const { requirements } = requirementsFor({
    occupancyStatus: 'tenant_occupied',
    leaseExists: true,
    tenantName: 'Tenant Example',
    rentalDeposit: 20000,
    noticePeriodDetails: 'Two calendar months',
  })
  for (const key of ['lease_agreement', 'tenant_details', 'rental_schedule', 'deposit_details', 'notice_period_details']) {
    assert.ok(byKey(requirements, key), `tenant matrix must include ${key}`)
  }
  assert.equal(byKey(requirements, 'deposit_details').is_required, false)
}

{
  const { profile, requirements, facts } = requirementsFor({
    ownershipType: 'married_anc',
    maritalStatus: 'married',
    maritalRegime: 'foreign_marriage',
    spouseName: 'Spouse Example',
    spouseIdNumber: 'P12345678',
    foreignOwner: true,
    foreignOwnerCountry: 'United Kingdom',
    foreignResidencyStatus: 'non_resident',
  })
  for (const key of [
    'foreign_marriage_certificate',
    'foreign_marital_regime_documents',
    'spouse_passport_document',
    'seller_tax_residency_declaration',
    'non_resident_tax_documents',
  ]) {
    assert.ok(byKey(requirements, key), `foreign/non-resident matrix must include ${key}`)
    assert.equal(byKey(requirements, key).is_required, true)
  }
  assert.ok(profile.documentTriggers.includes('non_resident_tax_documents'))
  assert.equal(facts.seller.foreign.residency_status, 'non_resident')
  assert.equal(facts.seller.residency_status, 'non_resident')

  const plan = buildSellerDocumentRequestPlan({
    listing: { ...listing, seller: { email: 'seller@example.com' } },
    requirements: requirements.map((requirement, index) => ({ ...requirement, id: `foreign-${index + 1}` })),
  })
  assert.ok(plan.issued.some((item) => item.requirementKey === 'seller_tax_residency_declaration'))
  assert.ok(plan.issued.some((item) => item.requirementKey === 'non_resident_tax_documents'))
}

{
  const { profile, requirements, facts } = requirementsFor({
    ownershipType: 'company',
    companyName: 'Example Property (Pty) Ltd',
    companyRegistrationNumber: '2020/123456/07',
    companyRegisteredAddress: '1 Example Road',
    companyDirectors: [{ name: 'Seller Example', signingAuthority: true }],
    authorisedSignatoryName: 'Seller Example',
    vatRegistered: true,
    vatNumber: '4123456789',
    goingConcernSale: true,
  })
  for (const key of ['vat_registration_certificate', 'going_concern_supporting_documents']) {
    assert.ok(byKey(requirements, key), `VAT matrix must include ${key}`)
    assert.equal(byKey(requirements, key).is_required, true)
  }
  assert.ok(profile.documentTriggers.includes('vat_registration_certificate'))
  assert.equal(facts.seller.vat_registered, true)
  assert.equal(facts.transaction.going_concern, true)
}

const migration = await readFile(
  new URL('../../supabase/migrations/202607170005_comprehensive_seller_document_matrix_p0_2.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'seller_bank_account_confirmation',
  'property_acquisition_record',
  'capital_improvement_records',
  'water_installation_certificate',
  'body_corporate_insurance_schedule',
  'rental_schedule',
  'non_resident_tax_documents',
  'vat_registration_certificate',
  'going_concern_supporting_documents',
  'foreign_marital_regime_documents',
  'seller_document_matrix_p0_2',
]) {
  assert.ok(migration.includes(marker), `canonical migration must include ${marker}`)
}

console.log('comprehensive seller document matrix P0-2 tests passed')
