import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /function normalizeOptionalPurchaserType/,
  'buyer onboarding should keep purchaser type blank until selected',
)
assert.match(
  source,
  /function normalizeOptionalFinanceType/,
  'buyer onboarding should keep finance type blank until selected',
)
assert.doesNotMatch(
  source,
  /purchaserType:\s*formData\.purchaser_type\s*\|\|[^,\n]*'individual'/,
  'buyer onboarding flow facts must not seed individual before the buyer chooses',
)
assert.doesNotMatch(
  source,
  /financeType:\s*formData\.purchase_finance_type\s*\|\|[^,\n]*'cash'/,
  'buyer onboarding flow facts must not seed cash before the buyer chooses',
)
assert.doesNotMatch(
  source,
  /purchase_finance_type:\s*initialFinanceType,/,
  'initial form data must not write a blank finance choice as cash',
)
assert.match(
  source,
  /Not selected yet/,
  'the at-a-glance summary should show an unanswered state before choices are made',
)

console.log('buyer onboarding no default choice leak test passed')
