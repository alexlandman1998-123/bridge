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
