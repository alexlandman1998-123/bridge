// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { calculateSplitCosts, calculatorNegativeExplanation, calculatorRand, splitCalculatorDefaults as defaults } from '../homeSeekersSplitCalculatorModel'
import { readNextStepsReview, saveNextStepsReview } from '../homeSeekersNextStepsModel'
beforeEach(() => localStorage.clear())
it('calculates the supplied 6% default with R147 000 annual and R12 250 monthly savings', () => {
  expect(calculateSplitCosts(defaults)).toMatchObject({ gross: 900000, currentCost: 270000, homeSeekersCost: 123000, difference: 147000, perMonth: 12250 })
  expect(calculateSplitCosts(defaults).hsPercentOfGross).toBeCloseTo(13.6666667)
  expect(calculateSplitCosts(defaults).breakEven7030).toBeCloseTo(4.235294)
})
it.each([['50/50', 450000], ['60/40', 360000], ['70/30', 270000], ['80/20', 180000], ['cap', 236200], ['deskPlusPct', 126200], ['fixedFee', 123000]])('uses the correct cost formula for %s', (model, expected) => {
  expect(calculateSplitCosts({ ...defaults, model }).currentCost).toBeCloseTo(expected)
})
it('applies the cap only to the office share, then adds desk and per-transaction fees', () => {
  const result = calculateSplitCosts({ ...defaults, model: 'cap', cap: '10000', capDesk: '1000', capAdmin: '2500' })
  expect(result.currentCost).toBe(47000)
  expect(result.difference).toBe(-76000)
})
it('handles zero sales, expensive low-volume fees and exact equality honestly', () => {
  expect(calculateSplitCosts({ ...defaults, sales: '0' })).toMatchObject({ gross: 0, currentCost: 0, homeSeekersCost: 108000, difference: -108000, hsPercentOfGross: null })
  expect(calculateSplitCosts({ ...defaults, sales: '1' }).difference).toBeLessThan(0)
  expect(calculateSplitCosts({ ...defaults, model: 'fixedFee' }).difference).toBe(0)
})
it('uses a dynamic 70/30 break-even and does not misstate a fixed-fee comparison', () => {
  const low = { ...defaults, sales: '2', rate: '5' }
  expect(calculatorNegativeExplanation(low, calculateSplitCosts(low))).toContain('5.1 sales')
  const fixed = { ...defaults, model: 'fixedFee', fee: '8000' }
  const explanation = calculatorNegativeExplanation(fixed, calculateSplitCosts(fixed))
  expect(explanation).toContain('R12 000 less')
  expect(explanation).not.toContain('under it')
})
it('rejects missing, negative, fractional sale counts and out-of-range inputs', () => {
  for (const patch of [{ sales: '' }, { sales: '1.5' }, { sales: '-1' }, { rate: '11' }, { averagePrice: '499999' }, { averagePrice: '15000001' }, { model: 'made-up' }, { model: 'cap', cap: '-1' }]) expect(calculateSplitCosts({ ...defaults, ...patch })).toBeNull()
  expect(calculateSplitCosts({ ...defaults, cap: '', model: '70/30' })).not.toBeNull()
})
it('formats rand with spaces and an unambiguous negative sign, never commas', () => {
  expect(calculatorRand(147000)).toBe('R147 000')
  expect(calculatorRand(-12250)).toBe('−R12 250')
  expect(calculatorRand(0)).toBe('R0')
})
it('saves email, all inputs and recomputed output locally with the calculator source/event', () => {
  const record = saveNextStepsReview('calculator', { email: 'REVIEW@example.test', inputs: { ...defaults }, result: { difference: 99999999 } }, { id: 'calculator-review' })
  saveNextStepsReview('calculator', { email: 'REVIEW@example.test', inputs: defaults }, { id: 'calculator-review' })
  expect(record).toMatchObject({ source: 'homeseeker_join_split_calculator', outcome: 'email_preview_saved', details: { email: 'review@example.test', inputs: defaults, result: { difference: 147000 } } })
  expect(readNextStepsReview().records).toHaveLength(1)
  expect(readNextStepsReview().events[0].event).toBe('calculator_email_submitted')
  expect(JSON.stringify(readNextStepsReview().events)).not.toContain('review@example.test')
})
