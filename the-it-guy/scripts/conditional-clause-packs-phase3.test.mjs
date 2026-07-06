import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildCanonicalMergeSampleData,
  getCanonicalMergeFieldDefinition,
  listCanonicalMergeFields,
  normalizeMergeFieldPayload,
  resolveCanonicalMergeFieldKey,
} from '../src/core/documents/mergeFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetWorkflow = await readFile(new URL('../src/core/documents/packetWorkflow.js', import.meta.url), 'utf8')
const mandateDataMapper = await readFile(new URL('../src/core/documents/mandateDataMapper.js', import.meta.url), 'utf8')
const settingsPage = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase3'],
  'node scripts/conditional-clause-packs-phase3.test.mjs',
  'package.json should expose the conditional clause packs Phase 3 contract.',
)

const mandateFieldKeys = new Set(listCanonicalMergeFields({ packetType: 'mandate' }).map((field) => field.key))
const otpFieldKeys = new Set(listCanonicalMergeFields({ packetType: 'otp' }).map((field) => field.key))

for (const key of [
  'seller_company_registration_number',
  'seller_representative_name',
  'seller_representative_capacity',
  'seller_resolution_date',
  'seller_authority_basis',
  'seller_trust_registration_number',
  'seller_trustee_names',
  'seller_marital_status',
  'seller_spouse_full_name',
  'seller_spouse_id_number',
  'seller_spouse_email',
  'seller_spouse_consent_required',
]) {
  assert.ok(mandateFieldKeys.has(key), `Mandate registry should include ${key}.`)
  assert.ok(otpFieldKeys.has(key), `OTP registry should include seller-side ${key}.`)
}

for (const key of [
  'buyer_company_registration_number',
  'buyer_representative_name',
  'buyer_representative_capacity',
  'buyer_resolution_date',
  'buyer_authority_basis',
  'buyer_trust_registration_number',
  'buyer_trustee_names',
  'buyer_marital_status',
  'buyer_spouse_full_name',
  'buyer_spouse_id_number',
  'buyer_spouse_email',
  'buyer_spouse_consent_required',
  'finance_type',
  'bond_amount',
  'cash_amount',
]) {
  assert.ok(otpFieldKeys.has(key), `OTP registry should include ${key}.`)
}

assert.equal(resolveCanonicalMergeFieldKey('seller_spouse_name', { packetType: 'mandate' }), 'seller_spouse_full_name')
assert.equal(resolveCanonicalMergeFieldKey('buyer_spouse_name', { packetType: 'otp' }), 'buyer_spouse_full_name')
assert.equal(resolveCanonicalMergeFieldKey('seller.company_registration_number', { packetType: 'otp' }), 'seller_company_registration_number')
assert.equal(resolveCanonicalMergeFieldKey('buyerCompanyRegistrationNumber', { packetType: 'otp' }), 'buyer_company_registration_number')
assert.equal(resolveCanonicalMergeFieldKey('authority_basis', { packetType: 'mandate' }), 'seller_authority_basis')

assert.equal(
  getCanonicalMergeFieldDefinition('seller_representative_capacity', { packetType: 'otp' })?.key,
  'seller_representative_capacity',
  'Seller representative capacity should be available to OTP seller authority packs.',
)
assert.equal(
  getCanonicalMergeFieldDefinition('seller_trust_registration_number', { packetType: 'otp' })?.key,
  'seller_trust_registration_number',
  'Seller trust registration number should be available to OTP seller authority packs.',
)

const normalized = normalizeMergeFieldPayload({
  seller_spouse_name: 'Taylor Seller',
  'seller.company_registration_number': '2020/123456/07',
  sellerAuthorityBasis: 'Board resolution',
  buyer_spouse_name: 'Taylor Buyer',
  buyerCompanyRegistrationNumber: '2022/123456/07',
}, { packetType: 'otp' }).payload

assert.equal(normalized.seller_spouse_full_name, 'Taylor Seller')
assert.equal(normalized.seller_spouse_name, 'Taylor Seller')
assert.equal(normalized.seller_company_registration_number, '2020/123456/07')
assert.equal(normalized.seller_authority_basis, 'Board resolution')
assert.equal(normalized.buyer_spouse_full_name, 'Taylor Buyer')
assert.equal(normalized.buyer_spouse_name, 'Taylor Buyer')
assert.equal(normalized.buyer_company_registration_number, '2022/123456/07')

const mandateSample = buildCanonicalMergeSampleData({ packetType: 'mandate' })
const otpSample = buildCanonicalMergeSampleData({ packetType: 'otp' })
for (const key of ['seller_spouse_full_name', 'seller_company_registration_number', 'seller_trustee_names', 'seller_authority_basis']) {
  assert.ok(mandateSample[key], `Mandate sample data should include ${key}.`)
}
for (const key of ['buyer_spouse_full_name', 'buyer_company_registration_number', 'buyer_trustee_names', 'finance_type', 'bond_amount', 'cash_amount']) {
  assert.ok(otpSample[key], `OTP sample data should include ${key}.`)
}

for (const token of [
  'buyer_company_registration_number',
  'buyer_spouse_full_name',
  'buyer_spouse_consent_required',
  'seller_spouse_full_name',
  'seller_spouse_consent_required',
  'seller_resolution_date',
  'seller_authority_basis',
  'seller_trustee_names',
  'isMarriedInCommunityBuyer',
  'isMarriedInCommunitySeller',
]) {
  assert.ok(packetWorkflow.includes(token), `packetWorkflow should resolve conditional-pack field: ${token}`)
}

for (const token of [
  'seller_spouse_full_name',
  'seller_spouse_consent_required',
  'seller_trustee_names',
  'seller_resolution_date',
  'seller_authority_basis',
]) {
  assert.ok(mandateDataMapper.includes(token), `mandateDataMapper should expose seller pack placeholder: ${token}`)
}

for (const token of [
  'seller_spouse_full_name',
  'buyer_spouse_full_name',
  'buyer_company_registration_number',
  'seller_authority_basis',
  'buyer_authority_basis',
]) {
  assert.ok(settingsPage.includes(token), `Template settings page should surface/sample conditional-pack field: ${token}`)
}

console.log('Conditional clause packs Phase 3 contract passed.')
