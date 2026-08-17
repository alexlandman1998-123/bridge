import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /function isBondOrHybridFinanceType\(value\)/,
  'buyer onboarding should centralize the bond-or-hybrid finance decision',
)

assert.match(
  source,
  /key:\s*'employment_income'[\s\S]*?visibleWhen:\s*\(\{\s*financeType\s*\}\)\s*=>\s*isBondOrHybridFinanceType\(financeType\)/,
  'Employment & Income section must only render for bond or hybrid finance',
)

assert.match(
  source,
  /key:\s*'employment_type'[\s\S]*?visibleWhen:\s*\(\{\s*financeType\s*\}\)\s*=>\s*isBondOrHybridFinanceType\(financeType\)/,
  'Employment Type field must not remain visible for cash finance',
)

assert.match(
  source,
  /function getVisibleNaturalSectionsForPurchaser/,
  'natural purchaser rendering and validation should respect section-level visibility',
)

assert.match(
  source,
  /if\s*\(!isBondOrHybridFinanceType\(financeType\)\)\s*\{[\s\S]*?clearFlatEmploymentIncomeFields\(cleaned\)[\s\S]*?clearEmploymentIncomeFields\(purchaser\)/,
  'cash or non-bond submissions must clear stale employment and income answers',
)

console.log('buyer onboarding cash skips employment income test passed')
