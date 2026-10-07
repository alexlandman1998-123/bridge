// A fixed-rate monthly illustration. Premiums and fees are not bond payments.
export function calculateDemoBondRepayment({ loanAmount, annualInterestRate, termMonths, extraContribution = 0 }) {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0 || !Number.isFinite(annualInterestRate) || annualInterestRate < 0 ||
      !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 1200 || !Number.isFinite(extraContribution) || extraContribution < 0) {
    throw new RangeError('Use a positive bond amount and term, and non-negative interest and contribution.')
  }
  const monthlyRate = annualInterestRate / 1200
  const monthlyRepayment = monthlyRate === 0 ? loanAmount / termMonths : loanAmount * monthlyRate / -Math.expm1(-termMonths * Math.log1p(monthlyRate))
  if (!Number.isFinite(monthlyRepayment) || !Number.isFinite(monthlyRepayment + extraContribution)) {
    throw new RangeError('The bond payment is outside the supported range.')
  }

  function repay(extra) {
    let balance = loanAmount
    let totalInterest = 0
    let months = 0
    // Ignore fractions smaller than a cent, so rounding cannot add a final month.
    while (balance > 0.005 && months < termMonths) {
      const interest = balance * monthlyRate
      const payment = Math.min(monthlyRepayment + extra, balance + interest)
      balance = Math.max(0, balance + interest - payment)
      totalInterest += interest
      months += 1
    }
    return { months, totalInterest }
  }

  const baseline = repay(0)
  const accelerated = extraContribution === 0 ? baseline : repay(extraContribution)
  return {
    monthlyRepayment,
    repaymentMonths: accelerated.months,
    timeSavedMonths: baseline.months - accelerated.months,
    totalInterest: accelerated.totalInterest,
    interestSaved: Math.max(0, baseline.totalInterest - accelerated.totalInterest),
  }
}

export function formatBondPeriod(months) {
  const years = Math.floor(months / 12)
  const remaining = months % 12
  return [years ? `${years} year${years === 1 ? '' : 's'}` : '', remaining || !years ? `${remaining} month${remaining === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')
}
