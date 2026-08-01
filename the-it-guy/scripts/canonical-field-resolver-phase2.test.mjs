import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  getCanonicalSourceAliasesForMergeField,
  isNonMergeCanonicalSourcePath,
  listCanonicalFieldSourceDefinitions,
  resolveCanonicalFieldValue,
  resolveCanonicalMergeFieldFromSourcePath,
} from '../src/core/documents/canonicalFieldResolver.js'
import { CONDITIONAL_PACK_DATA_RULES } from '../src/core/documents/conditionalPackDataRules.js'
import {
  listCanonicalMergeFields,
  normalizeMergeFieldPayload,
  resolveCanonicalMergeFieldKey,
} from '../src/core/documents/mergeFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:canonical-field-resolver-phase2'],
  'node scripts/canonical-field-resolver-phase2.test.mjs',
  'package.json should expose the canonical field resolver Phase 2 contract.',
)

const expectedMappings = [
  ['buyer.person.marital_regime', 'buyer_marital_regime', 'otp'],
  ['finance.purchase_price', 'purchase_price', 'otp'],
  ['finance.bond_amount', 'bond_amount', 'otp'],
  ['finance.cash_amount', 'cash_amount', 'otp'],
  ['seller.legal_type', 'seller_entity_type', 'mandate'],
  ['seller.branch', 'seller_entity_type', 'mandate'],
  ['seller.company.name', 'seller_full_name', 'mandate'],
  ['seller.company.registration_number', 'seller_company_registration_number', 'mandate'],
  ['seller.company.authorised_signatory.name', 'seller_representative_name', 'mandate'],
  ['seller.company.authorised_signatory.capacity', 'seller_representative_capacity', 'mandate'],
  ['seller.company.resolution_date', 'seller_resolution_date', 'mandate'],
  ['seller.company.authority_basis', 'seller_authority_basis', 'mandate'],
  ['seller.trust.name', 'seller_full_name', 'mandate'],
  ['seller.trust.registration_number', 'seller_trust_registration_number', 'mandate'],
  ['seller.trust.trustees', 'seller_trustee_names', 'mandate'],
  ['seller.trust.authorised_trustee.name', 'seller_representative_name', 'mandate'],
  ['seller.trust.authorised_trustee.capacity', 'seller_representative_capacity', 'mandate'],
  ['seller.trust.authority_basis', 'seller_authority_basis', 'mandate'],
  ['seller.marital_regime', 'seller_marital_regime', 'mandate'],
  ['seller.spouse.name', 'seller_spouse_full_name', 'mandate'],
  ['seller.spouse.id_number', 'seller_spouse_id_number', 'mandate'],
  ['seller.spouse.email', 'seller_spouse_email', 'mandate'],
  ['property.address.line_1', 'property_address', 'mandate'],
  ['property.address.suburb', 'property_suburb', 'mandate'],
  ['property.address.city', 'property_city', 'mandate'],
  ['property.address.postal_code', 'property_postal_code', 'mandate'],
  ['property.structure_type', 'property_title_type', 'mandate'],
  ['property.category', 'property_type', 'mandate'],
  ['property.scheme.unit_number', 'property_unit_number', 'mandate'],
  ['property.scheme.section_number', 'property_section_number', 'mandate'],
  ['property.scheme.name', 'property_complex_name', 'mandate'],
]

for (const [sourcePath, mergeField, packetType] of expectedMappings) {
  assert.equal(
    resolveCanonicalMergeFieldFromSourcePath(sourcePath, { packetType }),
    mergeField,
    `${sourcePath} should resolve through the shared canonical field source map.`,
  )
  assert.equal(
    resolveCanonicalMergeFieldKey(sourcePath, { packetType }),
    mergeField,
    `${sourcePath} should resolve through the merge-field registry.`,
  )
}

for (const key of ['buyer_marital_regime', 'seller_marital_regime', 'property_postal_code']) {
  assert.ok(
    listCanonicalMergeFields().some((field) => field.key === key),
    `merge-field registry should include ${key}.`,
  )
}

assert.deepEqual(
  getCanonicalSourceAliasesForMergeField('property_title_type', { packetType: 'mandate' }),
  [
    'property.property_title_type',
    'property.title_type',
    'property.title_type_raw',
    'property.structure_type',
    'property.property_structure_type',
  ],
)

const sellerFacts = {
  seller: {
    first_name: 'Sam',
    surname: 'Seller',
    company: {
      authorised_signatory: {
        name: 'Casey Director',
      },
    },
  },
}

assert.equal(resolveCanonicalFieldValue(sellerFacts, 'seller_full_name', { packetType: 'mandate' }), 'Sam Seller')
assert.equal(resolveCanonicalFieldValue(sellerFacts, 'seller_representative_name', { packetType: 'mandate' }), 'Casey Director')

const normalizedMandate = normalizeMergeFieldPayload({
  'property.structure_type': 'sectional_title',
  'property.address.postal_code': '0081',
  'seller.company.authorised_signatory.name': 'Casey Director',
  'seller.trust.authorised_trustee.capacity': 'Trustee',
}, { packetType: 'mandate', includeAliasKeys: false }).payload

assert.equal(normalizedMandate.property_title_type, 'sectional_title')
assert.equal(normalizedMandate.property_postal_code, '0081')
assert.equal(normalizedMandate.seller_representative_name, 'Casey Director')
assert.equal(normalizedMandate.seller_representative_capacity, 'Trustee')

const normalizedOtp = normalizeMergeFieldPayload({
  'finance.purchase_price': '12000000',
  'finance.bond_amount': '9000000',
  'buyer.person.marital_regime': 'in_community',
}, { packetType: 'otp', includeAliasKeys: false }).payload

assert.equal(normalizedOtp.purchase_price, '12000000')
assert.equal(normalizedOtp.bond_amount, '9000000')
assert.equal(normalizedOtp.buyer_marital_regime, 'in_community')

const conditionalPackSourcePaths = [
  ...new Set(CONDITIONAL_PACK_DATA_RULES.flatMap((rule) => [
    ...(rule.requiredOnboardingFields || []),
    ...(rule.optionalOnboardingFields || []),
  ])),
].filter((field) => /^(buyer|seller|property|finance)\./.test(field))

const unmappedConditionalPaths = conditionalPackSourcePaths.filter((field) => {
  const packetType = field.startsWith('buyer.') || field.startsWith('finance.') ? 'otp' : 'mandate'
  return !resolveCanonicalMergeFieldFromSourcePath(field, { packetType }) && !isNonMergeCanonicalSourcePath(field)
})

assert.deepEqual(
  unmappedConditionalPaths,
  [],
  'Every conditional-pack onboarding field should either map to a canonical merge field or be classified as non-merge readiness/evidence data.',
)

const allSourceDefinitionsHaveRegistryTargets = listCanonicalFieldSourceDefinitions().filter((definition) => (
  !resolveCanonicalMergeFieldKey(definition.canonicalMergeField, { packetType: definition.packetTypes[0] })
))

assert.deepEqual(
  allSourceDefinitionsHaveRegistryTargets.map((definition) => definition.canonicalMergeField),
  [],
  'Every shared source definition should point at a registered canonical merge field.',
)

console.log('Canonical field resolver Phase 2 contract passed.')
