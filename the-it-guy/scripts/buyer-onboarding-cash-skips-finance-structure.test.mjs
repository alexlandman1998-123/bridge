import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8')

const financeTotalsMatch = source.match(
  /key:\s*'finance_totals'[\s\S]*?fields:\s*\[([\s\S]*?)\n\s*\],\n\s*\}/,
)

assert.ok(financeTotalsMatch, 'buyer onboarding should still define a finance totals section for bond and hybrid buyers')

assert.match(
  financeTotalsMatch[0],
  /visibleWhen:\s*\(\{\s*financeType\s*\}\)\s*=>\s*isBondOrHybridFinanceType\(financeType\)/,
  'Finance Structure must not render for cash buyers',
)

assert.doesNotMatch(
  financeTotalsMatch[1],
  /key:\s*'purchase_price'/,
  'Purchase price must not be a buyer-entered onboarding finance field',
)

assert.match(
  financeTotalsMatch[1],
  /key:\s*'cash_amount'[\s\S]*?visibleWhen:\s*\(\{\s*financeType\s*\}\)\s*=>\s*normalizeFinanceType\(financeType\s*\|\|\s*''\)\s*===\s*'combination'/,
  'Cash amount should only be requested as a hybrid cash contribution, not for pure cash buyers',
)

assert.match(
  source,
  /cleaned\.finance\s*=\s*\{[\s\S]*?purchase_price:\s*''[\s\S]*?\}/,
  'Sanitized buyer onboarding submissions must not write a buyer-supplied purchase price',
)

assert.match(
  source,
  /if\s*\(financeType\s*===\s*'cash'\)\s*\{[\s\S]*?cleaned\.cash_amount\s*=\s*''[\s\S]*?cleaned\.finance\.cash_amount\s*=\s*''/,
  'Cash buyer submissions must clear stale cash amount values',
)

assert.doesNotMatch(
  source,
  /label:\s*'Purchase price'/,
  'Buyer onboarding review must not display purchase price as a buyer-provided value',
)

console.log('buyer onboarding cash skips finance structure test passed')
