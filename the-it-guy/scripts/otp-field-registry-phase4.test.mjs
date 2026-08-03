import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_FIELD_REGISTRY_VERSION,
  buildOtpFieldRegistryAudit,
  getOtpClauseDefinitionRequirement,
  listOtpDefinitionTerms,
  listOtpFieldRegistry,
} from '../src/core/documents/otpFieldRegistry.js'
import { validateTemplateTokensAgainstRegistry } from '../src/core/documents/mergeFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-field-registry-phase4'],
  'node scripts/otp-field-registry-phase4.test.mjs',
  'package.json should expose the OTP field registry Phase 4 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-field-registry-phase4'),
  'OTP vNext verification should include Phase 4 field registry checks.',
)

assert.equal(OTP_FIELD_REGISTRY_VERSION, 'otp_field_registry_phase4_v1')

const audit = buildOtpFieldRegistryAudit({ checkedAt: '2026-08-02T00:00:00.000Z' })
assert.equal(audit.status, 'OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES')
assert.equal(audit.mutatedData, false)
assert.deepEqual(audit.blockerCodes, [])
assert.deepEqual(audit.ownerGaps, [])
assert.deepEqual(audit.duplicateFieldKeys, [])
assert.deepEqual(audit.mergeRegistryGaps, [])
assert.deepEqual(audit.definitionGaps, [])
assert.deepEqual(audit.clauseDefinitionGaps, [])
assert.deepEqual(audit.missingPhase3Fields, [])

const resaleFieldKeys = new Set(listOtpFieldRegistry({ variant: 'resale_existing_property' }).map((field) => field.key))
for (const key of [
  'mandatory_disclosure_annexure',
  'fixtures_included',
  'occupational_rent_amount',
  'subject_sale_minimum_price',
  'transfer_attorney_company_name',
  'trust_account_recipient',
]) {
  assert.equal(resaleFieldKeys.has(key), true, `resale OTP registry should include ${key}.`)
}

const developmentFieldKeys = new Set(listOtpFieldRegistry({ variant: 'new_development' }).map((field) => field.key))
for (const key of [
  'development_name',
  'vat_inclusive_purchase_price',
  'property_nhbrc_certificate_number',
  'body_corporate_rules_annexure',
  'snagging_period_days',
  'utility_connection_charges',
  'transfer_attorney_company_name',
  'trust_account_recipient',
]) {
  assert.equal(developmentFieldKeys.has(key), true, `new development OTP registry should include ${key}.`)
}

const buyerOwnedKeys = new Set(listOtpFieldRegistry({ owner: 'buyer_onboarding' }).map((field) => field.key))
for (const key of ['transfer_attorney_company_name', 'developer_name', 'agent_ffc_number']) {
  assert.equal(
    buyerOwnedKeys.has(key),
    false,
    `buyer onboarding must not own ${key}; Phase 4 keeps OTP source ownership separated.`,
  )
}

const transactionOwnedKeys = new Set(listOtpFieldRegistry({ owner: 'transaction_offer_terms' }).map((field) => field.key))
for (const key of ['structured_suspensive_conditions', 'guarantee_delivery_deadline', 'irrevocable_offer_expiry']) {
  assert.equal(transactionOwnedKeys.has(key), true, `transaction terms should own ${key}.`)
}

const resaleDefinitionKeys = new Set(listOtpDefinitionTerms({ variant: 'resale_existing_property' }).map((term) => term.key))
assert.equal(resaleDefinitionKeys.has('fixtures'), true)
assert.equal(resaleDefinitionKeys.has('mandatory_disclosure_form'), true)
assert.equal(resaleDefinitionKeys.has('occupational_rental'), true)
assert.equal(resaleDefinitionKeys.has('nhbrc'), false)

const developmentDefinitionKeys = new Set(listOtpDefinitionTerms({ variant: 'new_development' }).map((term) => term.key))
assert.equal(developmentDefinitionKeys.has('nhbrc'), true)
assert.equal(developmentDefinitionKeys.has('body_corporate'), true)
assert.equal(developmentDefinitionKeys.has('sectional_plan'), true)
assert.equal(developmentDefinitionKeys.has('compliance_certificates'), true)
assert.equal(developmentDefinitionKeys.has('mandatory_disclosure_form'), false)

assert.deepEqual(
  getOtpClauseDefinitionRequirement('development_unit', 'new_development')?.requiredDefinitionTerms,
  ['act', 'development', 'section_unit', 'sectional_plan', 'common_property'],
)
assert.deepEqual(
  getOtpClauseDefinitionRequirement('fixtures_defects_disclosure', 'resale_existing_property')?.requiredDefinitionTerms,
  ['fixtures', 'mandatory_disclosure_form', 'voetstoots'],
)

const registryValidation = validateTemplateTokensAgainstRegistry({
  packetType: 'otp',
  tokens: [
    'otp_document_variant',
    'guarantee_delivery_deadline',
    'subject_sale_minimum_price',
    'property_nhbrc_certificate_number',
    'body_corporate_name',
    'transfer_attorney_company_name',
    'trust_account_recipient',
  ],
})
assert.deepEqual(registryValidation.unknown, [])
assert.equal(registryValidation.isValid, true)

console.log('OTP field registry Phase 4 contract passed.')
