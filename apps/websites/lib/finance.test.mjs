import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repayment, loanFromBudget, savingsMonths, propertyAffordability } from './finance.ts'

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

const household = { price: 1_850_000, deposit: 185_000, rate: 10, years: 20, income: 45_000, expenses: 18_000, debt: 3000, reserve: 8000 }
test('property affordability compares the listing loan with all monthly commitments', () => {
  const result = propertyAffordability(household)
  assert.equal(result.principal, 1_665_000)
  assert.equal(result.budget, 16_000)
  assert.ok(Math.abs(result.payment - 16_067.61039) < 0.01)
  assert.ok(result.remaining < 0)
  assert.ok(propertyAffordability({ ...household, deposit: 400_000 }).remaining > 0)
})
test('property affordability handles zero interest, cash purchases and overspent budgets', () => {
  assert.equal(propertyAffordability({ ...household, rate: 0 }).payment, 6937.5)
  assert.equal(propertyAffordability({ ...household, deposit: household.price }).payment, 0)
  assert.ok(propertyAffordability({ ...household, deposit: household.price, income: 1000 }).remaining < 0)
})
test('property affordability rejects invalid estimates instead of suggesting a zero repayment', () => {
  for (const overrides of [{price: 0}, {deposit: 2_000_000}, {income: NaN}, {expenses: -1}, {rate: 31}, {years: 0}, {years: 20.5}, {price: Infinity}]) {
    assert.equal(propertyAffordability({ ...household, ...overrides }), null)
  }
})
