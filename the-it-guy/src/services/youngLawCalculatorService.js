import {
  calculateConveyancingQuote,
  calculateDeedsOfficeEstimate,
  calculateTransferProfessionalFee,
  formatZar,
  roundMoney,
  SARS_TRANSFER_DUTY_SOURCE_URL,
  TRANSFER_DUTY_TABLE_EFFECTIVE,
  toMoneyNumber,
  VAT_RATE,
} from './conveyancingCostCalculator.js'

export const YOUNG_LAW_ACCENT = '#edc446'
export const YOUNG_LAW_WEBSITE_URL = 'https://www.younglaw.co.za/'
export const SARS_ESTATE_DUTY_SOURCE_URL = 'https://www.sars.gov.za/types-of-tax/estate-duty/'
export const SARS_CGT_SOURCE_URL = 'https://www.sars.gov.za/types-of-tax/capital-gains-tax/'

export const DEFAULT_YOUNG_LAW_TRANSFER_INPUT = Object.freeze({
  purchasePrice: 1850000,
  bondAmount: 1450000,
  transactionBasis: 'resale',
  propertyTitle: 'sectional',
  buyerType: 'individual',
  financeType: 'bond',
  feeProfile: 'standard',
})

export const DEFAULT_SELLER_PROCEEDS_INPUT = Object.freeze({
  salePrice: 2450000,
  bondSettlement: 1250000,
  agentCommissionRate: 5,
  ratesClearance: 18500,
  levyClearance: 7200,
  complianceCertificates: 6500,
  bondCancellationFee: 4550,
  repairsAndMoving: 15000,
  occupationalRentCredit: 0,
  estimateCgt: false,
  baseCost: 1650000,
  improvementCost: 145000,
  marginalTaxRate: 36,
  primaryResidence: true,
})

export const DEFAULT_DECEASED_ESTATE_INPUT = Object.freeze({
  grossEstate: 7800000,
  liabilities: 650000,
  spouseDeduction: 1800000,
  pboBequests: 0,
  cashAvailable: 950000,
  incomeAfterDeath: 120000,
  propertyTransferValue: 2400000,
  executorVatRegistered: true,
})

function sumLineItems(items = []) {
  return roundMoney(items.reduce((sum, item) => sum + Number(item.amount || 0), 0))
}

function makeLineItem(key, label, amount, tone = 'neutral', note = '') {
  return {
    key,
    label,
    amount: roundMoney(amount),
    tone,
    note,
  }
}

export function calculateYoungLawTransfer(input = {}) {
  const quote = calculateConveyancingQuote({
    ...DEFAULT_YOUNG_LAW_TRANSFER_INPUT,
    ...input,
  })
  const transferDuty = quote.summary.transferDuty
  const professional = quote.summary.professionalFees
  const government = quote.summary.governmentCharges
  const disbursements = quote.summary.thirdParty
  const vat = quote.summary.vatTotal
  const cashNeeded = quote.summary.buyerTotal
  const depositHint = Math.max(0, toMoneyNumber(quote.input.purchasePrice) - toMoneyNumber(quote.input.bondAmount))

  const headlineItems = [
    makeLineItem('transfer-duty', 'SARS transfer duty', transferDuty, 'government', `Current SARS table effective ${TRANSFER_DUTY_TABLE_EFFECTIVE}.`),
    makeLineItem('professional', 'Attorney and bond fees', professional, 'firm', 'Includes transfer and selected bond registration estimates.'),
    makeLineItem('disbursements', 'Deeds, rates and admin', government + disbursements, 'thirdParty', 'Municipal figures remain final-statement dependent.'),
    makeLineItem('vat', 'VAT on taxable fees', vat, 'tax', 'Calculated at 15% on taxable fees.'),
  ].filter((item) => item.amount > 0)

  return {
    ...quote,
    headlineItems,
    sources: [SARS_TRANSFER_DUTY_SOURCE_URL],
    primaryMetric: {
      label: 'Cash needed before lodgement',
      value: cashNeeded,
      display: formatZar(cashNeeded),
    },
    secondaryMetrics: [
      { label: 'Transfer duty', value: transferDuty, display: formatZar(transferDuty) },
      { label: 'Estimated deposit gap', value: depositHint, display: formatZar(depositHint) },
      { label: 'VAT', value: vat, display: formatZar(vat) },
    ],
  }
}

export function calculateSellerCgtSignal(input = {}) {
  if (!input.estimateCgt) {
    return {
      capitalGain: 0,
      taxableGain: 0,
      estimatedTax: 0,
      active: false,
    }
  }

  const salePrice = toMoneyNumber(input.salePrice)
  const baseCost = toMoneyNumber(input.baseCost)
  const improvementCost = toMoneyNumber(input.improvementCost)
  const sellingCosts = salePrice * (toMoneyNumber(input.agentCommissionRate) / 100)
  const grossGain = Math.max(0, salePrice - baseCost - improvementCost - sellingCosts)
  const primaryResidenceExclusion = input.primaryResidence ? Math.min(grossGain, 2000000) : 0
  const annualExclusion = input.primaryResidence ? 40000 : 0
  const taxableGain = Math.max(0, grossGain - primaryResidenceExclusion - annualExclusion) * 0.4
  const estimatedTax = taxableGain * (toMoneyNumber(input.marginalTaxRate) / 100)

  return {
    capitalGain: roundMoney(grossGain),
    taxableGain: roundMoney(taxableGain),
    estimatedTax: roundMoney(estimatedTax),
    active: true,
  }
}

export function calculateSellerNetProceeds(rawInput = {}) {
  const input = {
    ...DEFAULT_SELLER_PROCEEDS_INPUT,
    ...rawInput,
  }
  const salePrice = toMoneyNumber(input.salePrice)
  const commission = salePrice * (toMoneyNumber(input.agentCommissionRate) / 100)
  const cgtSignal = calculateSellerCgtSignal({ ...input, salePrice })
  const costs = [
    makeLineItem('bond-settlement', 'Bond settlement', input.bondSettlement, 'settlement'),
    makeLineItem('agent-commission', 'Agent commission', commission, 'selling', `${toMoneyNumber(input.agentCommissionRate).toFixed(1)}% of sale price.`),
    makeLineItem('rates-clearance', 'Rates clearance estimate', input.ratesClearance, 'clearance'),
    makeLineItem('levy-clearance', 'Levy clearance estimate', input.levyClearance, 'clearance'),
    makeLineItem('compliance', 'Compliance certificates', input.complianceCertificates, 'clearance'),
    makeLineItem('bond-cancellation', 'Bond cancellation attorney fee', input.bondCancellationFee, 'legal'),
    makeLineItem('repairs-moving', 'Repairs, moving and handover buffer', input.repairsAndMoving, 'selling'),
  ].filter((item) => item.amount > 0)

  if (cgtSignal.estimatedTax > 0) {
    costs.push(makeLineItem('cgt-signal', 'Estimated CGT signal', cgtSignal.estimatedTax, 'tax', 'High-level planning signal only; final CGT belongs in tax advice.'))
  }

  const totalCosts = sumLineItems(costs)
  const netProceeds = roundMoney(salePrice + toMoneyNumber(input.occupationalRentCredit) - totalCosts)
  const costRatio = salePrice > 0 ? Math.min(100, Math.max(0, (totalCosts / salePrice) * 100)) : 0

  return {
    input: {
      ...input,
      salePrice,
    },
    costs,
    cgtSignal,
    sources: [SARS_CGT_SOURCE_URL],
    summary: {
      salePrice: roundMoney(salePrice),
      totalCosts,
      netProceeds,
      commission: roundMoney(commission),
      settlement: roundMoney(toMoneyNumber(input.bondSettlement)),
      clearanceTotal: sumLineItems(costs.filter((item) => item.tone === 'clearance')),
      costRatio: roundMoney(costRatio),
    },
  }
}

export function calculateEstateDuty(dutiableValue) {
  const value = Math.max(0, toMoneyNumber(dutiableValue))
  const firstBand = Math.min(value, 30000000)
  const secondBand = Math.max(0, value - 30000000)
  return roundMoney(firstBand * 0.2 + secondBand * 0.25)
}

export function calculateMasterFeeEstimate(grossEstate) {
  const value = toMoneyNumber(grossEstate)
  if (value <= 250000) return 0
  if (value <= 400000) return 600
  if (value <= 600000) return 1200
  if (value <= 800000) return 2000
  if (value <= 1000000) return 4000
  return 7000
}

export function calculateDeceasedEstateCosts(rawInput = {}) {
  const input = {
    ...DEFAULT_DECEASED_ESTATE_INPUT,
    ...rawInput,
  }
  const grossEstate = toMoneyNumber(input.grossEstate)
  const liabilities = toMoneyNumber(input.liabilities)
  const spouseDeduction = toMoneyNumber(input.spouseDeduction)
  const pboBequests = toMoneyNumber(input.pboBequests)
  const sectionFourDeductions = liabilities + spouseDeduction + pboBequests
  const netValue = Math.max(0, grossEstate - sectionFourDeductions)
  const dutiableEstate = Math.max(0, netValue - 3500000)
  const estateDuty = calculateEstateDuty(dutiableEstate)
  const executorFee = grossEstate * 0.035 + toMoneyNumber(input.incomeAfterDeath) * 0.06
  const executorVat = input.executorVatRegistered ? executorFee * VAT_RATE : 0
  const masterFee = calculateMasterFeeEstimate(grossEstate)
  const adminReserve = Math.min(Math.max(grossEstate * 0.003, 12500), 45000)

  const propertyTransferValue = toMoneyNumber(input.propertyTransferValue)
  const estatePropertyTransfer = propertyTransferValue > 0
    ? calculateTransferProfessionalFee(propertyTransferValue) + calculateDeedsOfficeEstimate(propertyTransferValue)
    : 0
  const estatePropertyTransferVat = propertyTransferValue > 0
    ? calculateTransferProfessionalFee(propertyTransferValue) * VAT_RATE
    : 0

  const costs = [
    makeLineItem('estate-duty', 'SARS estate duty', estateDuty, 'tax', '20% up to R30m dutiable value and 25% above R30m.'),
    makeLineItem('executor-fee', 'Executor remuneration estimate', executorFee, 'legal', 'Mockup estimate: 3.5% of gross assets plus 6% of post-death income.'),
    makeLineItem('executor-vat', 'VAT on executor fee', executorVat, 'tax'),
    makeLineItem('master-fee', "Master's fee estimate", masterFee, 'government', 'Placeholder bracket for mockup validation.'),
    makeLineItem('admin-reserve', 'Admin and advert reserve', adminReserve, 'admin', 'Covers notices, copies, certificates and estate administration buffer.'),
    makeLineItem('property-transfer', 'Estate property transfer estimate', estatePropertyTransfer, 'property', 'Transfer-duty exempt estimate for inherited property registration work.'),
    makeLineItem('property-transfer-vat', 'VAT on property transfer fee', estatePropertyTransferVat, 'tax'),
  ].filter((item) => item.amount > 0)

  const totalAdministrationCosts = sumLineItems(costs)
  const cashAvailable = toMoneyNumber(input.cashAvailable)
  const liquidityPosition = roundMoney(cashAvailable - totalAdministrationCosts)
  const residueAfterCosts = roundMoney(Math.max(0, netValue - totalAdministrationCosts))

  return {
    input,
    costs,
    sources: [SARS_ESTATE_DUTY_SOURCE_URL],
    summary: {
      grossEstate: roundMoney(grossEstate),
      sectionFourDeductions: roundMoney(sectionFourDeductions),
      netValue: roundMoney(netValue),
      dutiableEstate: roundMoney(dutiableEstate),
      estateDuty,
      executorFee: roundMoney(executorFee),
      totalAdministrationCosts,
      liquidityPosition,
      cashAvailable: roundMoney(cashAvailable),
      residueAfterCosts: roundMoney(residueAfterCosts),
    },
  }
}

export function getQuoteLeadMessage(type, result) {
  if (type === 'seller') {
    return `Young Law seller proceeds estimate: net proceeds ${formatZar(result.summary.netProceeds)} on a ${formatZar(result.summary.salePrice)} sale.`
  }
  if (type === 'estate') {
    return `Young Law deceased estate estimate: estate duty ${formatZar(result.summary.estateDuty)} and liquidity position ${formatZar(result.summary.liquidityPosition)}.`
  }
  return `Young Law transfer estimate: buyer cash needed ${formatZar(result.primaryMetric.value)}.`
}
