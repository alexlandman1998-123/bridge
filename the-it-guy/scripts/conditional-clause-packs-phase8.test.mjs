import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveConditionalPackAudit } from '../src/core/documents/conditionalPackAudit.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const auditSource = await readFile(new URL('../src/core/documents/conditionalPackAudit.js', import.meta.url), 'utf8')
const preflightSource = await readFile(new URL('../src/core/documents/conditionalPackPreflight.js', import.meta.url), 'utf8')

function keys(rows = []) {
  return rows.map((row) => row.key)
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

function findPack(audit, key) {
  return audit.packs.find((pack) => pack.key === key)
}

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase8'],
  'node scripts/conditional-clause-packs-phase8.test.mjs',
  'package.json should expose the conditional clause packs Phase 8 contract.',
)

const blankAudit = resolveConditionalPackAudit({
  packetType: 'otp',
  placeholders: {},
})
assert.equal(blankAudit.canProceed, true, 'Blank template/design context should remain preflight-neutral.')
assert.equal(blankAudit.summary.activePackCount, 0, 'Blank template/design context should not activate packs.')
assert.equal(blankAudit.summary.inactivePackCount, blankAudit.summary.packCount, 'Blank context should only contain inactive trace rows.')
assert.deepEqual(blankAudit.missingPlaceholders, [], 'Blank context should not produce missing conditional pack fields.')

const mixedAudit = resolveConditionalPackAudit({
  packetType: 'otp',
  placeholders: {
    seller_entity_type: 'company',
    seller_company_registration_number: '2024/123456/07',
    seller_representative_name: '',
    seller_representative_capacity: 'Director',
    seller_resolution_date: 'TBC',
    seller_authority_basis: 'Board resolution approved',
    buyer_entity_type: 'individual',
    buyer_marital_status: 'Married in community of property',
    buyer_spouse_consent_required: 'Yes',
    buyer_spouse_full_name: 'Jamie Buyer',
    buyer_spouse_id_number: '',
    buyer_spouse_email: 'missing',
    finance_type: 'bond',
    bond_amount: '',
  },
})
assert.equal(mixedAudit.canProceed, false, 'Missing active pack fields should block generation readiness.')
assertIncludes(
  asSet(keys(mixedAudit.activePacks)),
  [
    'seller_company_authority_pack',
    'buyer_individual_capacity_pack',
    'buyer_spouse_consent_pack',
    'bond_finance_pack',
  ],
  'Mixed seller/buyer/finance scenario active packs',
)
assertExcludes(
  asSet(keys(mixedAudit.activePacks)),
  ['seller_trust_authority_pack', 'cash_sale_pack'],
  'Mixed scenario inactive packs should not be marked active',
)
assertIncludes(
  asSet(mixedAudit.missingPlaceholders.map((issue) => issue.placeholderKey)),
  [
    'seller_representative_name',
    'seller_resolution_date',
    'buyer_spouse_id_number',
    'buyer_spouse_email',
    'bond_amount',
  ],
  'Mixed scenario missing merge fields',
)
assert.equal(mixedAudit.summary.activePackCount, 4)
assert.equal(mixedAudit.summary.blockedPackCount, 3)
assert.equal(mixedAudit.summary.readyPackCount, 1)
assert.equal(mixedAudit.summary.missingPlaceholderCount, mixedAudit.missingPlaceholders.length)
assert.equal(mixedAudit.activationSignals.sellerEntityType, 'company')
assert.equal(mixedAudit.activationSignals.buyerSpouseConsentRequired, 'Yes')
assert.equal(mixedAudit.activationSignals.financeType, 'bond')

const sellerCompanyPack = findPack(mixedAudit, 'seller_company_authority_pack')
assert.equal(sellerCompanyPack.status, 'missing_data')
assert.equal(sellerCompanyPack.reason, 'Seller is a company or close corporation.')
assert.equal(
  sellerCompanyPack.requiredMergeFields.find((field) => field.key === 'seller_representative_name')?.missing,
  true,
  'Pack audit should mark missing fields inside the active pack.',
)
assert.equal(
  sellerCompanyPack.requiredMergeFields.find((field) => field.key === 'seller_company_registration_number')?.present,
  true,
  'Pack audit should mark present fields inside the active pack.',
)

const sellerTrustPack = findPack(mixedAudit, 'seller_trust_authority_pack')
assert.equal(sellerTrustPack.status, 'inactive')
assert.match(sellerTrustPack.reason, /Requires seller entity type/, 'Inactive packs should explain why they did not fire.')

const trustFlowAudit = resolveConditionalPackAudit({
  packetType: 'mandate',
  flow: {
    ownershipType: 'trust',
  },
  form: {
    seller_trust_registration_number: 'IT2222/2026',
    seller_trustee_names: 'Casey Trustee',
    seller_representative_name: 'Casey Trustee',
    seller_representative_capacity: 'Trustee',
    seller_authority_basis: 'Letters of authority',
  },
})
assertIncludes(
  asSet(keys(trustFlowAudit.activePacks)),
  ['seller_trust_authority_pack'],
  'Audit should activate packs from onboarding-flow shaped input.',
)
assert.equal(trustFlowAudit.canProceed, true, 'Flow/form shaped trust data should satisfy active pack fields.')

for (const token of [
  'resolveConditionalPackAudit',
  'activationSignals',
  'activePacks',
  'inactivePacks',
  'requiredOnboardingFields',
  'documentTriggers',
  'preflight',
]) {
  assert.ok(auditSource.includes(token), `Conditional pack audit should expose trace token: ${token}`)
}

for (const token of [
  'const conditionalPackAudit = resolveConditionalPackAudit',
  'const conditionalPackPreflight = conditionalPackAudit.preflight || {}',
  'conditionalPackAudit,',
  'conditionalPackAudit: validation?.conditionalPackAudit || null',
]) {
  assert.ok(packetService.includes(token), `packetService should publish conditional pack audit metadata: ${token}`)
}

assert.ok(
  preflightSource.includes('...options') &&
    preflightSource.includes('resolveConditionalPackDataRequirements({') &&
    preflightSource.includes('placeholders: normalizedPayload'),
  'Conditional pack preflight should preserve full classifier options while normalizing merge fields.',
)

console.log('Conditional clause packs Phase 8 contract passed.')
