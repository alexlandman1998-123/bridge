import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  getConditionalPackRequiredMergeFields,
  getConditionalPackRequiredOnboardingFields,
  listConditionalPackDataRules,
  resolveConditionalPackDataRequirements,
} from '../src/core/documents/conditionalPackDataRules.js'
import {
  getBuyerConditionalPackDataRequirements,
  getBuyerConditionalPackRequiredFields,
  getBuyerConditionalPackRequiredMergeFields,
  resolveBuyerOnboardingFlow,
} from '../src/lib/buyerOnboardingFlow.js'
import {
  getSellerConditionalPackDataRequirements,
  getSellerConditionalPackRequiredFields,
  getSellerConditionalPackRequiredMergeFields,
  resolveSellerOnboardingFlow,
} from '../src/lib/sellerOnboardingFlow.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const buyerContract = await readFile(new URL('../src/lib/buyerOnboardingFlowContract.js', import.meta.url), 'utf8')
const sellerContract = await readFile(new URL('../src/lib/sellerOnboardingFlowContract.js', import.meta.url), 'utf8')

function keys(requirements = []) {
  return requirements.map((rule) => rule.key)
}

function asSet(values = []) {
  return new Set(values)
}

function assertIncludes(actual, expected, label) {
  for (const value of expected) {
    assert.equal(actual.has(value), true, `${label}: expected ${value}`)
  }
}

function assertNoDuplicates(values = [], label) {
  assert.equal(new Set(values).size, values.length, `${label}: duplicate values found`)
}

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase5'],
  'node scripts/conditional-clause-packs-phase5.test.mjs',
  'package.json should expose the conditional clause packs Phase 5 contract.',
)

assert.deepEqual(
  resolveConditionalPackDataRequirements({ packetType: 'otp', placeholders: {} }),
  [],
  'Blank template/design context should not activate default individual or cash packs.',
)

const ruleKeys = keys(listConditionalPackDataRules({ packetType: 'otp' }))
assertIncludes(
  asSet(ruleKeys),
  [
    'seller_company_authority_pack',
    'seller_trust_authority_pack',
    'seller_spouse_consent_pack',
    'seller_individual_capacity_pack',
    'buyer_company_authority_pack',
    'buyer_trust_authority_pack',
    'buyer_spouse_consent_pack',
    'buyer_individual_capacity_pack',
    'bond_finance_pack',
    'cash_sale_pack',
  ],
  'registered conditional pack data rules',
)

const sellerCompanyRules = resolveConditionalPackDataRequirements({
  packetType: 'mandate',
  placeholders: { seller_entity_type: 'company' },
})
assertIncludes(asSet(keys(sellerCompanyRules)), ['seller_company_authority_pack'], 'seller company active packs')
assertIncludes(
  asSet(getConditionalPackRequiredOnboardingFields({ packetType: 'mandate', placeholders: { seller_entity_type: 'company' } })),
  [
    'seller.company.registration_number',
    'seller.company.authorised_signatory.capacity',
    'seller.company.resolution_date',
    'seller.company.authority_basis',
  ],
  'seller company onboarding fields',
)
assertIncludes(
  asSet(getConditionalPackRequiredMergeFields({ packetType: 'mandate', placeholders: { seller_entity_type: 'company' } })),
  [
    'seller_company_registration_number',
    'seller_representative_capacity',
    'seller_resolution_date',
    'seller_authority_basis',
  ],
  'seller company merge fields',
)

const sellerTrustRules = resolveConditionalPackDataRequirements({
  packetType: 'mandate',
  placeholders: { seller_entity_type: 'trust' },
})
assertIncludes(asSet(keys(sellerTrustRules)), ['seller_trust_authority_pack'], 'seller trust active packs')
assertIncludes(
  asSet(getConditionalPackRequiredOnboardingFields({ packetType: 'mandate', placeholders: { seller_entity_type: 'trust' } })),
  ['seller.trust.trustees', 'seller.trust.authorised_trustee.capacity', 'seller.trust.authority_basis'],
  'seller trust onboarding fields',
)

const sellerSpouseRules = resolveConditionalPackDataRequirements({
  packetType: 'mandate',
  placeholders: {
    seller_entity_type: 'individual',
    seller_marital_status: 'married in community of property',
    seller_spouse_consent_required: 'Yes',
  },
})
assertIncludes(asSet(keys(sellerSpouseRules)), ['seller_individual_capacity_pack', 'seller_spouse_consent_pack'], 'seller spouse active packs')
assertIncludes(
  asSet(getConditionalPackRequiredMergeFields({
    packetType: 'mandate',
    placeholders: {
      seller_entity_type: 'individual',
      seller_marital_status: 'married in community of property',
      seller_spouse_consent_required: 'Yes',
    },
  })),
  ['seller_spouse_full_name', 'seller_spouse_id_number', 'seller_spouse_email'],
  'seller spouse merge fields',
)

const buyerCompanyBondRules = resolveConditionalPackDataRequirements({
  packetType: 'otp',
  placeholders: { buyer_entity_type: 'company', finance_type: 'bond' },
})
assertIncludes(asSet(keys(buyerCompanyBondRules)), ['buyer_company_authority_pack', 'bond_finance_pack'], 'buyer company bond active packs')
assertIncludes(
  asSet(getConditionalPackRequiredOnboardingFields({ packetType: 'otp', placeholders: { buyer_entity_type: 'company', finance_type: 'bond' } })),
  [
    'buyer.company.authorised_signatory.capacity',
    'buyer.company.resolution_date',
    'buyer.company.authority_basis',
    'finance.bond_amount',
    'finance.bond_readiness_consent',
  ],
  'buyer company bond onboarding fields',
)
assertIncludes(
  asSet(getConditionalPackRequiredMergeFields({ packetType: 'otp', placeholders: { buyer_entity_type: 'company', finance_type: 'bond' } })),
  ['buyer_company_registration_number', 'buyer_representative_capacity', 'buyer_resolution_date', 'buyer_authority_basis', 'bond_amount'],
  'buyer company bond merge fields',
)

const buyerTrustRules = resolveConditionalPackDataRequirements({
  packetType: 'otp',
  placeholders: { buyer_entity_type: 'trust', finance_type: 'cash' },
})
assertIncludes(asSet(keys(buyerTrustRules)), ['buyer_trust_authority_pack', 'cash_sale_pack'], 'buyer trust cash active packs')
assertIncludes(
  asSet(getConditionalPackRequiredOnboardingFields({ packetType: 'otp', placeholders: { buyer_entity_type: 'trust', finance_type: 'cash' } })),
  ['buyer.trust.trustees', 'buyer.trust.authorised_trustee.capacity', 'buyer.trust.authority_basis', 'finance.cash_amount'],
  'buyer trust cash onboarding fields',
)

const buyerSpouseRules = resolveConditionalPackDataRequirements({
  packetType: 'otp',
  placeholders: {
    buyer_entity_type: 'individual',
    buyer_marital_status: 'married in community of property',
    buyer_spouse_consent_required: 'Yes',
  },
})
assertIncludes(asSet(keys(buyerSpouseRules)), ['buyer_individual_capacity_pack', 'buyer_spouse_consent_pack'], 'buyer spouse active packs')
assertIncludes(
  asSet(getConditionalPackRequiredMergeFields({
    packetType: 'otp',
    placeholders: {
      buyer_entity_type: 'individual',
      buyer_marital_status: 'married in community of property',
      buyer_spouse_consent_required: 'Yes',
    },
  })),
  ['buyer_spouse_full_name', 'buyer_spouse_id_number', 'buyer_spouse_email'],
  'buyer spouse merge fields',
)

const sellerCompanyFlow = resolveSellerOnboardingFlow({
  ownershipType: 'company',
  sellerFirstName: 'Alex',
  sellerSurname: 'Principal',
  email: 'alex@example.com',
  phone: '0820000000',
  propertyCategory: 'residential',
  propertyStructureType: 'freehold',
  propertyAddress: '1 Main Road',
  suburb: 'Cape Town',
  province: 'Western Cape',
})
assertIncludes(asSet(keys(sellerCompanyFlow.conditional_pack_data_requirements)), ['seller_company_authority_pack'], 'seller wrapper flow pack metadata')
assertIncludes(
  asSet(getSellerConditionalPackRequiredFields(sellerCompanyFlow)),
  ['seller.company.authorised_signatory.capacity', 'seller.company.resolution_date', 'seller.company.authority_basis'],
  'seller wrapper required fields',
)
assertIncludes(
  asSet(getSellerConditionalPackRequiredMergeFields(sellerCompanyFlow)),
  ['seller_company_registration_number', 'seller_representative_capacity', 'seller_resolution_date', 'seller_authority_basis'],
  'seller wrapper merge fields',
)
assert.deepEqual(
  getSellerConditionalPackDataRequirements(sellerCompanyFlow).map((rule) => rule.key),
  sellerCompanyFlow.conditional_pack_data_requirements.map((rule) => rule.key),
  'seller wrapper should expose the same pack metadata as the normalized flow.',
)

const buyerCompanyFlow = resolveBuyerOnboardingFlow({
  purchaser_type: 'company',
  purchaser_entity_type: 'company',
  purchase_finance_type: 'bond',
})
assertIncludes(asSet(keys(buyerCompanyFlow.conditional_pack_data_requirements)), ['buyer_company_authority_pack', 'bond_finance_pack'], 'buyer wrapper flow pack metadata')
assertIncludes(
  asSet(getBuyerConditionalPackRequiredFields(buyerCompanyFlow)),
  ['buyer.company.authorised_signatory.capacity', 'buyer.company.resolution_date', 'buyer.company.authority_basis', 'finance.bond_amount'],
  'buyer wrapper required fields',
)
assertIncludes(
  asSet(getBuyerConditionalPackRequiredMergeFields(buyerCompanyFlow)),
  ['buyer_company_registration_number', 'buyer_representative_capacity', 'buyer_resolution_date', 'buyer_authority_basis', 'bond_amount'],
  'buyer wrapper merge fields',
)
assert.deepEqual(
  getBuyerConditionalPackDataRequirements(buyerCompanyFlow).map((rule) => rule.key),
  buyerCompanyFlow.conditional_pack_data_requirements.map((rule) => rule.key),
  'buyer wrapper should expose the same pack metadata as the normalized flow.',
)

for (const values of [
  sellerCompanyFlow.conditional_pack_required_fields,
  sellerCompanyFlow.conditional_pack_required_merge_fields,
  buyerCompanyFlow.conditional_pack_required_fields,
  buyerCompanyFlow.conditional_pack_required_merge_fields,
]) {
  assertNoDuplicates(values, 'conditional pack metadata')
}

for (const token of [
  'seller.company.authorised_signatory.capacity',
  'seller.company.resolution_date',
  'seller.company.authority_basis',
  'seller.trust.authorised_trustee.capacity',
  'seller.trust.authority_basis',
  'seller.spouse.consent_required',
]) {
  assert.ok(sellerContract.includes(token), `Seller onboarding contract should collect ${token}`)
}

for (const token of [
  'buyer.company.resolution_date',
  'buyer.company.authority_basis',
  'buyer.trust.authorised_trustee.capacity',
  'buyer.trust.authority_basis',
  'buyer.person.spouse_consent_required',
]) {
  assert.ok(buyerContract.includes(token), `Buyer onboarding contract should collect ${token}`)
}

console.log('Conditional clause packs Phase 5 contract passed.')
