/** Planning estimates: fixed nominal annual rate, monthly instalments, no fees. */
export function repayment(principal: number, annualRate: number, years: number): number {
  if (![principal, annualRate, years].every(Number.isFinite) || principal < 0 || annualRate < 0 || years <= 0) return 0
  const months = years * 12
  const rate = annualRate / 1200
  return rate === 0 ? principal / months : principal * rate / -Math.expm1(-months * Math.log1p(rate))
}

export function loanFromBudget(monthlyBudget: number, annualRate: number, years: number): number {
  if (![monthlyBudget, annualRate, years].every(Number.isFinite) || monthlyBudget <= 0 || annualRate < 0 || years <= 0) return 0
  return monthlyBudget / repayment(1, annualRate, years)
}

export function savingsMonths(target: number, saved: number, monthly: number): number | null {
  if (![target, saved, monthly].every(Number.isFinite) || target < 0 || saved < 0 || monthly < 0) return null
  if (saved >= target) return 0
  return monthly === 0 ? null : Math.ceil((target - saved) / monthly)
}

/** Compare this property's repayment with the visitor's actual monthly budget. */
export function propertyAffordability(values: { price: number; deposit: number; rate: number; years: number; income: number; expenses: number; debt: number; reserve: number }) {
  if (!Object.values(values).every(value => Number.isFinite(value) && value >= 0 && value <= 1_000_000_000)
    || values.price <= 0 || values.deposit > values.price || values.rate > 30
    || !Number.isInteger(values.years) || values.years < 1 || values.years > 30) return null
  const principal = values.price - values.deposit
  const payment = repayment(principal, values.rate, values.years)
  // Keep a negative budget: a cash purchase does not erase overspent living costs.
  const budget = values.income - values.expenses - values.debt - values.reserve
  return { principal, payment, budget, remaining: budget - payment }
}
