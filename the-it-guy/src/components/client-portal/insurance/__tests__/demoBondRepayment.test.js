import { describe, expect, it } from 'vitest'
import { calculateDemoBondRepayment, formatBondPeriod } from '../demoBondRepayment'
import { DEMO_BOND_REPAYMENT } from '../demoInsuranceData'

describe('demo bond repayment illustration', () => {
  it('leaves the original term and interest unchanged when no extra is paid', () => {
    const result = calculateDemoBondRepayment({ ...DEMO_BOND_REPAYMENT, extraContribution: 0 })
    expect(result.repaymentMonths).toBe(360)
    expect(result.timeSavedMonths).toBe(0)
    expect(result.interestSaved).toBe(0)
  })

  it('handles a zero-interest bond without dividing by zero', () => {
    const result = calculateDemoBondRepayment({ loanAmount: 1200, annualInterestRate: 0, termMonths: 12, extraContribution: 100 })
    expect(result.monthlyRepayment).toBe(100)
    expect(result.repaymentMonths).toBe(6)
    expect(result.timeSavedMonths).toBe(6)
    expect(result.totalInterest).toBe(0)
    expect(result.interestSaved).toBe(0)
  })

  it('counts a smaller final payment and only the interest accrued before payoff', () => {
    const result = calculateDemoBondRepayment({ loanAmount: 1000, annualInterestRate: 12, termMonths: 12, extraContribution: 100 })
    expect(result.monthlyRepayment).toBeCloseTo(88.84878868, 6)
    expect(result.repaymentMonths).toBe(6)
    expect(result.timeSavedMonths).toBe(6)
    expect(result.totalInterest).toBeCloseTo(32.81229064, 6)
    expect(result.interestSaved).toBeCloseTo(33.37317350, 6)
  })

  it('never increases payoff time or interest across the complete demo slider range', () => {
    let previous = calculateDemoBondRepayment({ ...DEMO_BOND_REPAYMENT, extraContribution: 0 })
    for (let extra = 100; extra <= 3000; extra += 100) {
      const current = calculateDemoBondRepayment({ ...DEMO_BOND_REPAYMENT, extraContribution: extra })
      expect(current.repaymentMonths).toBeLessThanOrEqual(previous.repaymentMonths)
      expect(current.totalInterest).toBeLessThan(previous.totalInterest)
      expect(current.interestSaved).toBeGreaterThan(previous.interestSaved)
      previous = current
    }
  })

  it.each([
    { loanAmount: 0 }, { annualInterestRate: -1 }, { termMonths: 0 }, { termMonths: 12.5 },
    { termMonths: 1201 }, { extraContribution: -100 }, { extraContribution: NaN }, { loanAmount: Infinity },
  ])('rejects unsupported inputs: %j', invalid => {
    expect(() => calculateDemoBondRepayment({ ...DEMO_BOND_REPAYMENT, ...invalid })).toThrow(RangeError)
  })

  it('formats zero, whole years and singular month periods clearly', () => {
    expect(formatBondPeriod(0)).toBe('0 months')
    expect(formatBondPeriod(12)).toBe('1 year')
    expect(formatBondPeriod(25)).toBe('2 years, 1 month')
  })
})
