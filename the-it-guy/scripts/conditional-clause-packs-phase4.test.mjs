import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const settingsPage = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const packetWorkflow = await readFile(new URL('../src/core/documents/packetWorkflow.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase4'],
  'node scripts/conditional-clause-packs-phase4.test.mjs',
  'package.json should expose the conditional clause packs Phase 4 contract.',
)

for (const token of [
  'function createConditionalPackCondition',
  "key: 'seller_company_authority_pack'",
  "key: 'seller_trust_authority_pack'",
  "key: 'seller_spouse_consent_pack'",
  "key: 'seller_individual_capacity_pack'",
  "key: 'buyer_company_authority_pack'",
  "key: 'buyer_trust_authority_pack'",
  "key: 'buyer_spouse_consent_pack'",
  "key: 'buyer_individual_capacity_pack'",
  "key: 'cash_sale_pack'",
  "sectionKey: 'seller_company_authority_pack'",
  "sectionKey: 'seller_trust_authority_pack'",
  "sectionKey: 'seller_spouse_consent_pack'",
  "sectionKey: 'seller_individual_capacity_pack'",
  "sectionKey: 'buyer_company_authority_pack'",
  "sectionKey: 'buyer_trust_authority_pack'",
  "sectionKey: 'buyer_spouse_consent_pack'",
  "sectionKey: 'buyer_individual_capacity_pack'",
  "sectionKey: 'cash_sale_pack'",
]) {
  assert.ok(settingsPage.includes(token), `Template settings should define starter/library conditional pack: ${token}`)
}

for (const token of [
  "field: 'seller_entity_type'",
  "field: 'buyer_entity_type'",
  "field: 'seller_spouse_consent_required'",
  "field: 'buyer_spouse_consent_required'",
  "field: 'finance_type'",
  "operator: 'in'",
  "value: 'company, close_corporation'",
  "value: 'bond, combination'",
  "value: 'cash'",
  "value: 'trust'",
  "value: 'individual'",
]) {
  assert.ok(settingsPage.includes(token), `Starter/library packs should save canonical visibility rule fragment: ${token}`)
}

for (const token of [
  'SELLER COMPANY AUTHORITY',
  'SELLER TRUST AUTHORITY',
  'SELLER SPOUSE CONSENT',
  'SELLER INDIVIDUAL CAPACITY',
  'PURCHASER COMPANY AUTHORITY',
  'PURCHASER TRUST AUTHORITY',
  'PURCHASER SPOUSE CONSENT',
  'PURCHASER INDIVIDUAL CAPACITY',
  'CASH SALE PAYMENT REQUIREMENTS',
]) {
  assert.ok(settingsPage.includes(token), `Default legal text should include pack heading: ${token}`)
}

for (const token of [
  'isCashSale',
  'isIndividualBuyer',
  'isIndividualSeller',
  'isMarriedInCommunityBuyer',
  'isMarriedInCommunitySeller',
  "key: 'finance_clause_cash'",
  "key: 'buyer_spouse_consent'",
  "key: 'seller_spouse_consent'",
  "key: 'entity_clause_individual'",
  "key: 'seller_entity_clause_individual'",
]) {
  assert.ok(packetWorkflow.includes(token), `Fallback packet manifest should include conditional pack support: ${token}`)
}

assert.ok(
  !/Representative Name: \{\{seller_representative_name\}\}\nRepresentative Capacity: \{\{seller_representative_capacity\}\}\nTrust Registration Number: \{\{seller_trust_registration_number\}\}/.test(settingsPage),
  'Base Sales Mandate party section should not keep seller entity authority fields inline.',
)

assert.ok(
  !/\| Representative \| \{\{buyer_representative_name\}\} \|\n\| Representative Capacity \| \{\{buyer_representative_capacity\}\} \|\n\| Trust Registration Number \| \{\{buyer_trust_registration_number\}\} \|/.test(settingsPage),
  'Base OTP Schedule 1 buyer section should not keep buyer entity authority fields inline.',
)

console.log('Conditional clause packs Phase 4 contract passed.')
