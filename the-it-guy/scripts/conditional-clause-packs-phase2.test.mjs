import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  classifyBuyerParty,
  classifyDealFinance,
  classifySellerParty,
  isBondSale,
  isCashSale,
  isCompanyBuyer,
  isCompanySeller,
  isIndividualSeller,
  isMarriedInCommunityBuyer,
  isMarriedInCommunitySeller,
  isTrustBuyer,
  isTrustSeller,
  normalizeDealFinanceType,
  normalizeDocumentMaritalRegime,
  normalizeDocumentPartyEntityType,
} from '../src/core/documents/documentPartyClassification.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetWorkflow = await readFile(new URL('../src/core/documents/packetWorkflow.js', import.meta.url), 'utf8')
const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase2'],
  'node scripts/conditional-clause-packs-phase2.test.mjs',
  'package.json should expose the conditional clause packs Phase 2 contract.',
)

assert.equal(normalizeDocumentPartyEntityType('Pty Ltd'), 'company')
assert.equal(normalizeDocumentPartyEntityType('Close Corporation'), 'close_corporation')
assert.equal(normalizeDocumentPartyEntityType('Trust'), 'trust')
assert.equal(normalizeDocumentPartyEntityType('Natural person'), 'individual')
assert.equal(normalizeDocumentMaritalRegime('Married in community of property'), 'in_community')
assert.equal(normalizeDocumentMaritalRegime('Married ANC'), 'out_of_community')
assert.equal(normalizeDealFinanceType('cash and bond'), 'combination')

assert.equal(isCompanySeller({ 'seller.entity_type_raw': 'Pty Ltd' }), true)
assert.equal(isCompanySeller({ seller_entity_type: 'CC' }), true)
assert.equal(isTrustSeller({ seller_entity_type: 'Trust' }), true)
assert.equal(isIndividualSeller({ seller_entity_type: 'Individual' }), true)
assert.equal(isCompanyBuyer({ buyer_entity_type: 'Company' }), true)
assert.equal(isTrustBuyer({ 'buyer.entity_type_raw': 'Trust' }), true)
assert.equal(isMarriedInCommunitySeller({ seller_marital_status: 'Married COP' }), true)
assert.equal(isMarriedInCommunitySeller({ seller_spouse_consent_required: 'yes' }), true)
assert.equal(isMarriedInCommunityBuyer({ buyer_marital_status: 'married in community of property' }), true)
assert.equal(isBondSale({ finance_type: 'hybrid' }), true)
assert.equal(isBondSale({ 'transaction.finance_type_raw': 'bond' }), true)
assert.equal(isCashSale({ finance_type: 'cash' }), true)
assert.equal(isCashSale({ finance_type: 'combination' }), false)

assert.deepEqual(
  classifySellerParty({
    placeholders: { seller_entity_type: 'Company' },
    context: { seller: { marital_regime: 'in community of property' } },
  }),
  {
    role: 'seller',
    entityType: 'company',
    maritalRegime: 'in_community',
    isCompany: true,
    isTrust: false,
    isIndividual: false,
    isLegalEntity: true,
    isMarriedInCommunity: true,
  },
  'Seller classification should combine placeholders and context.',
)

assert.equal(classifyBuyerParty({ buyer_entity_type: 'Trust' }).isLegalEntity, true)
assert.deepEqual(
  classifyDealFinance({ financeType: 'bond and cash' }),
  {
    financeType: 'combination',
    isBond: true,
    isCash: false,
    isHybrid: true,
    hasCashComponent: true,
  },
  'Finance classification should expose bond/cash/hybrid flags.',
)

for (const token of [
  'classifySellerParty',
  'isBondSale',
  'isCompanyBuyer',
  'isCompanySeller',
  'isTrustBuyer',
  'isTrustSeller',
]) {
  assert.ok(packetWorkflow.includes(token), `packetWorkflow should use shared party/deal classifier: ${token}`)
}

for (const token of [
  'condition: ({ placeholders }) => isBondSale(placeholders)',
  'condition: ({ placeholders }) => isCompanyBuyer(placeholders)',
  'condition: ({ placeholders }) => isTrustBuyer(placeholders)',
  'condition: ({ placeholders }) => isCompanySeller(placeholders)',
  'condition: ({ placeholders }) => isTrustSeller(placeholders)',
  'const sellerClassification = classifySellerParty(normalizedPayload)',
  'const sellerIsTrust = sellerClassification.isTrust',
  'const sellerIsLegalEntity = sellerClassification.isLegalEntity',
]) {
  assert.ok(packetWorkflow.includes(token), `packetWorkflow should wire fallback conditions/readiness to classifier: ${token}`)
}

assert.ok(
  packetService.includes("import { classifySellerParty } from './documentPartyClassification'"),
  'packetService should use shared seller classification for signer seed resolution.',
)

console.log('Conditional clause packs Phase 2 contract passed.')
