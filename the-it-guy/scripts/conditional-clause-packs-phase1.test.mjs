import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildVisibilityConditionJson,
  evaluateVisibilityRules,
  normalizeVisibilityConditionInput,
  normalizeVisibilityOperator,
  resolveVisibilityPlaceholderValue,
} from '../src/core/documents/sectionVisibilityRules.js'

const page = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase1'],
  'node scripts/conditional-clause-packs-phase1.test.mjs',
  'package.json should expose the conditional clause packs Phase 1 contract.',
)

assert.equal(normalizeVisibilityOperator('does not equal'), 'not_equals')
assert.equal(normalizeVisibilityOperator('is not empty'), 'exists')
assert.equal(normalizeVisibilityOperator('is required'), 'exists')
assert.equal(normalizeVisibilityOperator('is one of'), 'in')

const placeholders = {
  'seller.entity_type_raw': 'company',
  buyer_entity_type: 'trust',
  finance_type: 'bond',
  buyer_marital_status: 'married_in_community_of_property',
  special_conditions: 'Subject to inspection and finance approval.',
}

assert.equal(
  resolveVisibilityPlaceholderValue(placeholders, 'seller_entity_type'),
  'company',
  'seller_entity_type should resolve seller.entity_type_raw when the underscore key is absent.',
)

assert.equal(
  evaluateVisibilityRules({ enabled: true, rule: { field: 'seller_entity_type', operator: 'equals', value: 'company' } }, placeholders),
  true,
  'Wrapped editor conditions should evaluate the inner rule.',
)
assert.equal(
  evaluateVisibilityRules({ field: 'seller_entity_type', operator: 'does not equal', value: 'trust' }, placeholders),
  true,
  'Friendly not-equals aliases should evaluate correctly.',
)
assert.equal(
  evaluateVisibilityRules({ field: 'finance_type', operator: 'in', value: 'cash, bond' }, placeholders),
  true,
  'Comma-list in rules should evaluate correctly.',
)
assert.equal(
  evaluateVisibilityRules({ field: 'special_conditions', operator: 'contains', value: 'inspection' }, placeholders),
  true,
  'Contains rules should evaluate against text fields.',
)
assert.equal(
  evaluateVisibilityRules({ field: 'buyer_marital_status', operator: 'exists' }, placeholders),
  true,
  'Exists rules should evaluate populated fields.',
)
assert.equal(
  evaluateVisibilityRules({
    all: [
      { field: 'seller_entity_type', operator: 'equals', value: 'company' },
      { field: 'finance_type', operator: 'equals', value: 'bond' },
    ],
  }, placeholders),
  true,
  'All groups should require every child rule.',
)
assert.equal(
  evaluateVisibilityRules({
    any: [
      { field: 'buyer_entity_type', operator: 'equals', value: 'company' },
      { field: 'buyer_entity_type', operator: 'equals', value: 'trust' },
    ],
  }, placeholders),
  true,
  'Any groups should pass when one child rule matches.',
)
assert.equal(
  evaluateVisibilityRules({ not: { field: 'finance_type', operator: 'equals', value: 'cash' } }, placeholders),
  true,
  'Not groups should invert child rule output.',
)

const builtRule = buildVisibilityConditionJson({
  enabled: true,
  field: 'seller_entity_type',
  operator: 'does not equal',
  value: 'individual',
  label: 'Use for legal entities',
})
assert.deepEqual(
  builtRule,
  {
    enabled: true,
    rule: {
      field: 'seller_entity_type',
      operator: 'not_equals',
      value: 'individual',
    },
    label: 'Use for legal entities',
  },
  'Editor save helper should canonicalize condition JSON.',
)
assert.deepEqual(
  normalizeVisibilityConditionInput({ enabled: true, field: 'witness_signature', operator: 'is required', value: 'ignored' }),
  {
    enabled: true,
    field: 'witness_signature',
    operator: 'exists',
    value: '',
    label: '',
  },
  'Valueless operator aliases should normalize to exists with no saved value.',
)

for (const token of [
  "import { evaluateVisibilityRulesDetailed } from './sectionVisibilityRules'",
  "import { evaluateConditionalMasterSections } from './conditionalMasterEngine'",
  'visibilityEvaluation.visible',
]) {
  assert.ok(packetService.includes(token), `packetService should use the shared condition evaluator: ${token}`)
}

for (const token of [
  'buildVisibilityConditionJson',
  'normalizeVisibilityConditionInput',
  'VISIBILITY_VALUELESS_OPERATORS',
  "'seller_marital_status'",
  "'buyer_marital_status'",
  "'seller_company_registration_number'",
]) {
  assert.ok(page.includes(token), `Template editor should be wired to canonical condition helpers and party fields: ${token}`)
}

console.log('Conditional clause packs Phase 1 contract passed.')
