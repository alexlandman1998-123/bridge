import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_FIELD_POLICIES,
  OTP_FIELD_REGISTRY_PHASE3_VERSION,
  OTP_PHASE3_REFERENCE_FIELD_FAMILY_BINDINGS,
  buildOtpFieldRegistryPhase3Audit,
  getOtpFieldDefinition,
  listOtpFieldRegistry,
  listOtpPhase3ReferenceFieldFamilyBindings,
} from '../src/core/documents/otpFieldRegistry.js'
import {
  OTP_RESALE_REFERENCE_FIELD_FAMILIES,
  listOtpResaleReferenceFieldFamilies,
} from '../src/core/documents/otpReferenceExtraction.js'
import { validateTemplateTokensAgainstRegistry } from '../src/core/documents/mergeFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-field-registry-phase3'],
  'node scripts/otp-field-registry-phase3.test.mjs',
  'package.json should expose the OTP field registry Phase 3 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.startsWith('npm run test:otp-template-target-freeze-phase0 && npm run test:otp-reference-extraction-phase1 && npm run test:otp-template-shell-target-phase1 && npm run test:otp-template-route-split-phase2 && npm run test:otp-field-registry-phase3 && npm run test:otp-legal-wording-draft-phase3'),
  'OTP vNext verification should run the Phase 3 field registry before wording draft work.',
)

assert.equal(OTP_FIELD_REGISTRY_PHASE3_VERSION, 'otp_field_registry_phase3_v1')
assert.deepEqual(
  listOtpPhase3ReferenceFieldFamilyBindings(),
  OTP_PHASE3_REFERENCE_FIELD_FAMILY_BINDINGS.map((binding) => ({
    ...binding,
    fieldKeys: [...binding.fieldKeys],
  })),
)
assert.equal(OTP_PHASE3_REFERENCE_FIELD_FAMILY_BINDINGS.length, OTP_RESALE_REFERENCE_FIELD_FAMILIES.length)

const referenceFamilies = listOtpResaleReferenceFieldFamilies()
const bindingByFamily = new Map(OTP_PHASE3_REFERENCE_FIELD_FAMILY_BINDINGS.map((binding) => [binding.familyKey, binding]))
for (const family of referenceFamilies) {
  const binding = bindingByFamily.get(family.key)
  assert.ok(binding, `${family.key} should have a Phase 3 registry binding.`)
  assert.ok(binding.fieldKeys.length >= 2, `${family.key} should bind multiple canonical OTP fields.`)
  for (const fieldKey of binding.fieldKeys) {
    const definition = getOtpFieldDefinition(fieldKey)
    assert.ok(definition, `${fieldKey} should exist in the OTP registry.`)
    assert.equal(definition.owner, family.owner, `${fieldKey} should be owned by ${family.owner}.`)
    assert.ok(definition.variants.includes('resale_existing_property'), `${fieldKey} should be allowed on the resale OTP route.`)
    assert.ok(definition.sourcePaths.length > 0, `${fieldKey} should have at least one source path.`)
    assert.ok(Object.values(OTP_FIELD_POLICIES).includes(definition.policy), `${fieldKey} should have a known policy.`)
  }
}

for (const [fieldKey, owner] of new Map([
  ['buyer_domicilium_address', 'buyer_onboarding'],
  ['buyer_income_tax_number', 'buyer_onboarding'],
  ['buyer_vat_number', 'buyer_onboarding'],
  ['property_township', 'listing_property_record'],
  ['homeowners_association_name', 'listing_property_record'],
  ['seller_domicilium_address', 'seller_onboarding'],
  ['seller_vat_number', 'seller_onboarding'],
  ['seller_bond_institution', 'seller_onboarding'],
  ['seller_bond_account_number', 'seller_onboarding'],
  ['seller_outstanding_bond_amount', 'seller_onboarding'],
  ['seller_rates_taxes_up_to_date', 'seller_onboarding'],
  ['rates_and_taxes_account_number', 'seller_onboarding'],
  ['transfer_attorney_contact_person', 'conveyancer_transfer_assignment'],
  ['transfer_attorney_email', 'conveyancer_transfer_assignment'],
  ['transfer_attorney_phone', 'conveyancer_transfer_assignment'],
  ['buyer_employment_type', 'buyer_onboarding'],
  ['buyer_employer_name', 'buyer_onboarding'],
  ['buyer_occupation', 'buyer_onboarding'],
  ['buyer_gross_monthly_income', 'buyer_onboarding'],
  ['buyer_banking_institution', 'buyer_onboarding'],
  ['bond_documents_required', 'buyer_onboarding'],
  ['bond_originator_acknowledgement', 'buyer_onboarding'],
])) {
  assert.equal(getOtpFieldDefinition(fieldKey)?.owner, owner, `${fieldKey} should be owned by ${owner}.`)
}

const buyerOwnedKeys = new Set(listOtpFieldRegistry({ owner: 'buyer_onboarding' }).map((field) => field.key))
for (const key of [
  'seller_bond_institution',
  'seller_rates_taxes_up_to_date',
  'transfer_attorney_email',
  'agent_ffc_number',
  'homeowners_association_name',
]) {
  assert.equal(buyerOwnedKeys.has(key), false, `buyer onboarding must not own ${key}.`)
}

const registryValidation = validateTemplateTokensAgainstRegistry({
  packetType: 'otp',
  tokens: OTP_PHASE3_REFERENCE_FIELD_FAMILY_BINDINGS.flatMap((binding) => binding.fieldKeys),
})
assert.equal(registryValidation.isValid, true)
assert.deepEqual(registryValidation.unknown, [])

const audit = buildOtpFieldRegistryPhase3Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_FIELD_REGISTRY_PHASE3_VERSION)
assert.equal(audit.status, 'OTP_FIELD_REGISTRY_PHASE3_READY_FOR_DATA_LOCK')
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.referenceFamilyCount, 10)
assert.equal(audit.summary.boundFamilyCount, 10)
assert.equal(audit.summary.boundFieldCount, 55)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockerCodes, [])
assert.deepEqual(audit.missingFamilyBindings, [])
assert.deepEqual(audit.orphanBindings, [])
assert.deepEqual(audit.missingRegistryFields, [])
assert.deepEqual(audit.ownerMismatches, [])
assert.deepEqual(audit.routeGaps, [])
assert.deepEqual(audit.sourcePathGaps, [])
assert.deepEqual(audit.policyGaps, [])
assert.deepEqual(audit.mergeRegistryGaps, [])
assert.deepEqual(audit.buyerOwnedForbiddenKeys, [])

console.log('OTP field registry Phase 3 contract passed.')
