export const splitCalculatorDefaults = Object.freeze({ sales: '10', averagePrice: '1500000', rate: '6', model: '70/30', cap: '200000', capDesk: '1350', capAdmin: '2000', desk: '1350', pct: '10', admin: '2000', fee: '9000', perDeal: '1500' })
export const splitCalculatorModels = [['50/50', '50/50 split'], ['60/40', '60/40 split'], ['70/30', '70/30 split'], ['80/20', '80/20 split'], ['cap', 'Cap model'], ['deskPlusPct', 'Desk fee plus a percentage'], ['fixedFee', 'Another fixed fee']]
const officeShares = { '50/50': 0.5, '60/40': 0.4, '70/30': 0.3, '80/20': 0.2 }
export function splitCalculatorErrors(input) {
  const fields = { sales: [0, 9999, true], averagePrice: [500000, 15000000], rate: [3, 10] }
  if (input.model === 'cap') Object.assign(fields, { cap: [0, 1e10], capDesk: [0, 1e8], capAdmin: [0, 1e8] })
  if (input.model === 'deskPlusPct') Object.assign(fields, { desk: [0, 1e8], pct: [0, 100], admin: [0, 1e8] })
  if (input.model === 'fixedFee') Object.assign(fields, { fee: [0, 1e8], perDeal: [0, 1e8] })
  const errors = {}
  for (const [key, [min, max, whole]] of Object.entries(fields)) {
    const raw = String(input[key] ?? '').trim(), value = Number(raw)
    if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(value) || value < min || value > max || (whole && !Number.isInteger(value))) errors[key] = whole ? 'Enter a whole number from 0 to 9 999.' : `Enter a value from ${min.toLocaleString('en-US').replace(/,/g, ' ')} to ${max.toLocaleString('en-US').replace(/,/g, ' ')}.`
  }
  if (!splitCalculatorModels.some(([key]) => key === input.model)) errors.model = 'Choose a brokerage model.'
  return errors
}
export function calculateSplitCosts(input) {
  if (Object.keys(splitCalculatorErrors(input)).length) return null
  const n = key => Number(input[key])
  const gross = n('sales') * n('averagePrice') * n('rate') / 100
  const currentCost = Object.hasOwn(officeShares, input.model) ? gross * officeShares[input.model]
    : input.model === 'cap' ? Math.min(gross * 0.3, n('cap')) + n('capDesk') * 12 + n('capAdmin') * n('sales')
      : input.model === 'deskPlusPct' ? n('desk') * 12 + gross * n('pct') / 100 + n('admin') * n('sales')
        : n('fee') * 12 + n('perDeal') * n('sales')
  const homeSeekersCost = 108000 + 1500 * n('sales'), difference = currentCost - homeSeekersCost
  const contribution = n('averagePrice') * n('rate') / 100 * 0.3 - 1500
  return { gross, currentCost, homeSeekersCost, difference, perMonth: difference / 12, hsPercentOfGross: gross > 0 ? homeSeekersCost / gross * 100 : null, breakEven7030: contribution > 0 ? 108000 / contribution : null }
}
export function calculatorRand(amount) {
  const rounded = Math.round(Math.abs(amount))
  return `${amount < 0 && rounded > 0 ? '−' : ''}R${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}
export function calculatorNegativeExplanation(input, result) {
  const threshold = result.breakEven7030
  if (input.model === '70/30' && threshold !== null && Number(input.sales) < threshold) return `Our break-even against a 70/30 split is about ${threshold.toFixed(1)} sales a year on your average price and commission rate, and you’re under it. We’re not going to tell you otherwise. Come back when you’re writing more, or come to an information session and ask whatever you want in the meantime.`
  const model = splitCalculatorModels.find(([key]) => key === input.model)?.[1].toLowerCase()
  return `Your ${model} costs ${calculatorRand(-result.difference)} less over the year than our Prepaid option. We’re not going to tell you otherwise. Come to an information session and ask whatever you want in the meantime.`
}
