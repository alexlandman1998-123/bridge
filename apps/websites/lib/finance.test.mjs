import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repayment, loanFromBudget, savingsMonths } from './finance.ts'

test('standard amortising loan and zero-interest loan', () => {
  assert.ok(Math.abs(repayment(1_000_000, 10, 20) - 9650.21645) < 0.01)
  assert.equal(repayment(240_000, 0, 20), 1000)
  assert.equal(repayment(0, 10, 20), 0)
})
test('affordability reverses monthly repayments across rates and terms', () => {
  for (const rate of [0, 0.01, 10, 25]) for (const years of [5, 20, 30]) {
    assert.ok(Math.abs(loanFromBudget(repayment(1_500_000, rate, years), rate, years) - 1_500_000) < 0.01)
  }
  assert.equal(loanFromBudget(-100, 10, 20), 0)
})
test('invalid numbers cannot produce misleading amounts', () => {
  assert.equal(repayment(1_000_000, 10, 0), 0)
  assert.equal(repayment(NaN, 10, 20), 0)
  assert.equal(loanFromBudget(1000, Infinity, 20), 0)
})
test('savings handles completed targets, rounding and no contributions', () => {
  assert.equal(savingsMonths(100_000, 20_000, 3000), 27)
  assert.equal(savingsMonths(100_000, 100_000, 0), 0)
  assert.equal(savingsMonths(100_000, 20_000, 0), null)
})
