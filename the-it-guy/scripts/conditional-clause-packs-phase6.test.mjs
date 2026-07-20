import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  isMissingConditionalPackGenerationValue,
  resolveConditionalPackPreflight,
} from '../src/core/documents/conditionalPackPreflight.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')

function keys(rows = []) {
  return rows.map((row) => row.key)
}

function placeholderKeys(rows = []) {
  return rows.map((row) => row.placeholderKey)
}

function asSet(values = []) {
  return new Set(values)
}

function assertIncludes(actual, expected, label) {
  for (const value of expected) {
    assert.equal(actual.has(value), true, `${label}: expected ${value}`)
  }
}

function assertExcludes(actual, expected, label) {
  for (const value of expected) {
    assert.equal(actual.has(value), false, `${label}: did not expect ${value}`)
  }
}

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase6'],
  'node scripts/conditional-clause-packs-phase6.test.mjs',
  'package.json should expose the conditional clause packs Phase 6 contract.',
)

assert.equal(isMissingConditionalPackGenerationValue('TBC'), true)
assert.equal(isMissingConditionalPackGenerationValue('[MISSING: Authority Basis]'), true)
assert.equal(isMissingConditionalPackGenerationValue('Board resolution dated 2026-07-01'), false)
assert.equal(isMissingConditionalPackGenerationValue([]), true)
assert.equal(isMissingConditionalPackGenerationValue(['Director']), false)

const blankPreflight = resolveConditionalPackPreflight({
  packetType: 'otp',
  placeholders: {},
})
assert.deepEqual(blankPreflight.dataRequirements, [], 'Blank template/design context should not activate default packs.')
assert.deepEqual(blankPreflight.missingPlaceholders, [], 'Blank template/design context should not report missing conditional pack fields.')
assert.equal(blankPreflight.canProceed, true, 'Blank template/design context should be preflight-neutral.')

const buyerCompanyBondPreflight = resolveConditionalPackPreflight({
  packetType: 'otp',
  placeholders: {
    buyer_entity_type: 'company',
    finance_type: 'bond',
    buyer_company_registration_number: '2024/123456/07',
    buyer_representative_name: 'Alex Principal',
    buyer_representative_capacity: 'TBC',
    buyer_resolution_date: '',
    buyer_authority_basis: 'Board resolution approved',
    bond_amount: '',
  },
})
assertIncludes(
  asSet(keys(buyerCompanyBondPreflight.dataRequirements)),
  ['buyer_company_authority_pack', 'bond_finance_pack'],
  'Buyer company/bond active packs',
)
assertIncludes(
  asSet(placeholderKeys(buyerCompanyBondPreflight.missingPlaceholders)),
  ['buyer_representative_capacity', 'buyer_resolution_date', 'bond_amount'],
  'Buyer company/bond missing conditional merge fields',
)
assertExcludes(
  asSet(placeholderKeys(buyerCompanyBondPreflight.missingPlaceholders)),
  ['buyer_company_registration_number', 'buyer_representative_name', 'buyer_authority_basis'],
  'Buyer company/bond satisfied conditional merge fields',
)
assert.equal(buyerCompanyBondPreflight.canProceed, false, 'Active company/bond pack should block while pack data is missing.')
assert.ok(
  buyerCompanyBondPreflight.missingPlaceholders.every((issue) => issue.source === 'conditional_pack' && issue.required === true),
  'Missing conditional pack placeholders should be marked as required conditional-pack issues.',
)

const buyerAliasPreflight = resolveConditionalPackPreflight({
  packetType: 'otp',
  placeholders: {
    buyerEntityType: 'company',
    financeType: 'bond',
    buyerCompanyRegistrationNumber: '2024/123456/07',
    buyerRepresentativeName: 'Alex Principal',
    buyerRepresentativeCapacity: 'Director',
    buyerResolutionDate: '2026-07-01',
    buyerAuthorityBasis: 'Board resolution dated 2026-07-01',
    bond_amount: 'R 2 900 000',
  },
})
assertIncludes(
  asSet(keys(buyerAliasPreflight.dataRequirements)),
  ['buyer_company_authority_pack', 'bond_finance_pack'],
  'Buyer aliases should still activate company/bond packs',
)
assert.deepEqual(
  buyerAliasPreflight.missingPlaceholders,
  [],
  'Alias-normalized conditional pack data should satisfy live preflight.',
)
assert.equal(buyerAliasPreflight.canProceed, true)

const sellerTrustPreflight = resolveConditionalPackPreflight({
  packetType: 'mandate',
  placeholders: {
    seller_entity_type: 'trust',
    seller_trust_registration_number: 'IT9988/2019',
    seller_trustee_names: 'TBC',
    seller_representative_name: '',
    seller_representative_capacity: 'Trustee',
    seller_authority_basis: 'Trustee resolution approved',
  },
})
assertIncludes(
  asSet(keys(sellerTrustPreflight.dataRequirements)),
  ['seller_trust_authority_pack'],
  'Seller trust active pack',
)
assertIncludes(
  asSet(placeholderKeys(sellerTrustPreflight.missingPlaceholders)),
  ['seller_trustee_names', 'seller_representative_name'],
  'Seller trust missing conditional merge fields',
)
assert.equal(sellerTrustPreflight.canProceed, false)

for (const token of [
  'resolveConditionalPackAudit',
  'const conditionalPackPreflight = conditionalPackAudit.preflight || {}',
  'const conditionalPackDataRequirements = conditionalPackPreflight.dataRequirements || []',
  'const conditionalPackMissingPlaceholders = conditionalPackPreflight.missingPlaceholders || []',
  'const conditionalPackMissingKeys = conditionalPackPreflight.missingKeys || new Set()',
  '...conditionalPackMissingPlaceholders.map((issue) => ({',
  "source: 'conditional_pack'",
  'const conditionalPackCanProceed = Boolean(conditionalPackPreflight.canProceed)',
  'conditionalPackDataRequirements,',
  'conditionalPackMissingPlaceholders,',
  'conditionalPackCanProceed &&',
  'const hasConditionalPackBlockingIssues = (validation.critical || []).some(',
  "(issue) => issue?.source === 'conditional_pack',",
  'const hasConditionalEngineBlockingIssues = (validation.critical || []).some(',
  "(issue) => issue?.source === 'conditional_engine',",
  'isMandatePacket &&',
  '!hasConditionalPackBlockingIssues &&',
  '!hasLegalScenarioBlockingIssues &&',
  '!hasLegalScenarioRequirementBlockingIssues &&',
  'const allowGenerationBypass = !hasConditionalEngineBlockingIssues && !hasConditionalSigningBlockingIssues && !hasConditionalMasterCoverageBlockingIssues && (',
]) {
  assert.ok(packetService.includes(token), `packetService should enforce conditional pack preflight: ${token}`)
}

console.log('Conditional clause packs Phase 6 contract passed.')
