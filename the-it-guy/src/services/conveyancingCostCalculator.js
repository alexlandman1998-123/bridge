export const SARS_TRANSFER_DUTY_SOURCE_URL = 'https://www.sars.gov.za/tax-rates/transfer-duty/'
export const VAT_RATE = 0.15

export const TRANSFER_DUTY_TABLE_EFFECTIVE = '1 April 2025'

export const TRANSFER_DUTY_BRACKETS = Object.freeze([
  { min: 0, max: 1210000, base: 0, rate: 0, threshold: 0 },
  { min: 1210000, max: 1663800, base: 0, rate: 0.03, threshold: 1210000 },
  { min: 1663800, max: 2329300, base: 13614, rate: 0.06, threshold: 1663800 },
  { min: 2329300, max: 2994800, base: 53544, rate: 0.08, threshold: 2329300 },
  { min: 2994800, max: 13310000, base: 106784, rate: 0.11, threshold: 2994800 },
  { min: 13310000, max: Infinity, base: 1241456, rate: 0.13, threshold: 13310000 },
])

const TRANSFER_FEE_TIERS = Object.freeze([
  { upTo: 500000, fee: 8300 },
  { upTo: 750000, fee: 10200 },
  { upTo: 1000000, fee: 12200 },
  { upTo: 1250000, fee: 14200 },
  { upTo: 1500000, fee: 16200 },
  { upTo: 1750000, fee: 18350 },
  { upTo: 2000000, fee: 20500 },
  { upTo: 2500000, fee: 24600 },
  { upTo: 3000000, fee: 28600 },
  { upTo: 3500000, fee: 32500 },
  { upTo: 4000000, fee: 36500 },
  { upTo: 4500000, fee: 40500 },
  { upTo: 5000000, fee: 44500 },
])

const BOND_FEE_TIERS = Object.freeze([
  { upTo: 500000, fee: 6700 },
  { upTo: 750000, fee: 8100 },
  { upTo: 1000000, fee: 9500 },
  { upTo: 1250000, fee: 11000 },
  { upTo: 1500000, fee: 12600 },
  { upTo: 1750000, fee: 14200 },
  { upTo: 2000000, fee: 15800 },
  { upTo: 2500000, fee: 18800 },
  { upTo: 3000000, fee: 21800 },
  { upTo: 3500000, fee: 24800 },
  { upTo: 4000000, fee: 27800 },
  { upTo: 4500000, fee: 30800 },
  { upTo: 5000000, fee: 33800 },
])

export const FEE_PROFILES = Object.freeze({
  standard: {
    key: 'standard',
    label: 'Standard Firm Tariff',
    professionalMultiplier: 1,
    adminFee: 1850,
    ratesClearanceFee: 1450,
    levyClearanceFee: 1250,
    deedsSearchFee: 390,
    electronicLodgementFee: 640,
    postageFee: 780,
    bankInstructionFee: 1100,
    cancellationFee: 3900,
  },
  partner: {
    key: 'partner',
    label: 'Partner / Bulk Tariff',
    professionalMultiplier: 0.88,
    adminFee: 1550,
    ratesClearanceFee: 1250,
    levyClearanceFee: 1050,
    deedsSearchFee: 350,
    electronicLodgementFee: 580,
    postageFee: 650,
    bankInstructionFee: 950,
    cancellationFee: 3400,
  },
  priority: {
    key: 'priority',
    label: 'Complex / Priority Tariff',
    professionalMultiplier: 1.16,
    adminFee: 2450,
    ratesClearanceFee: 1900,
    levyClearanceFee: 1650,
    deedsSearchFee: 520,
    electronicLodgementFee: 760,
    postageFee: 950,
    bankInstructionFee: 1350,
    cancellationFee: 4700,
  },
})

export const DEFAULT_QUOTE_INPUT = Object.freeze({
  purchasePrice: 1850000,
  bondAmount: 1500000,
  transactionBasis: 'resale',
  propertyTitle: 'sectional',
  buyerType: 'individual',
  financeType: 'bond',
  feeProfile: 'standard',
  includeCancellation: false,
})

export function toMoneyNumber(value) {
  const normalized = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(normalized) ? Math.max(0, normalized) : 0
}

export function roundMoney(value) {
  return Math.round(Number(value || 0))
}

export function formatZar(value, { compact = false } = {}) {
  const amount = roundMoney(value)
  if (compact && Math.abs(amount) >= 1000000) {
    return `R${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}m`
  }
  if (compact && Math.abs(amount) >= 1000) {
    return `R${Math.round(amount / 1000)}k`
  }
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function isVatTransaction(input = {}) {
  return ['vat', 'plot_plan'].includes(String(input.transactionBasis || '').trim())
}

export function calculateTransferDuty(propertyValue, options = {}) {
  const value = toMoneyNumber(propertyValue)
  if (!value || options.vatTransaction) return 0
  const bracket = TRANSFER_DUTY_BRACKETS.find((item) => value > item.min && value <= item.max) || TRANSFER_DUTY_BRACKETS[0]
  return roundMoney(bracket.base + Math.max(value - bracket.threshold, 0) * bracket.rate)
}

function calculateTieredProfessionalFee(amount, tiers, options = {}) {
  const value = toMoneyNumber(amount)
  const multiplier = Number.isFinite(Number(options.multiplier)) ? Number(options.multiplier) : 1
  const lastTier = tiers[tiers.length - 1]
  const matched = tiers.find((tier) => value <= tier.upTo)
  if (matched) return roundMoney(matched.fee * multiplier)

  const incrementSize = options.incrementSize || 500000
  const incrementFee = options.incrementFee || 3900
  const increments = Math.ceil((value - lastTier.upTo) / incrementSize)
  return roundMoney((lastTier.fee + increments * incrementFee) * multiplier)
}

export function calculateTransferProfessionalFee(propertyValue, feeProfile = 'standard') {
  const profile = FEE_PROFILES[feeProfile] || FEE_PROFILES.standard
  return calculateTieredProfessionalFee(propertyValue, TRANSFER_FEE_TIERS, {
    multiplier: profile.professionalMultiplier,
    incrementFee: 4100,
  })
}

export function calculateBondProfessionalFee(bondAmount, feeProfile = 'standard') {
  const profile = FEE_PROFILES[feeProfile] || FEE_PROFILES.standard
  return calculateTieredProfessionalFee(bondAmount, BOND_FEE_TIERS, {
    multiplier: profile.professionalMultiplier,
    incrementFee: 3000,
  })
}

export function calculateDeedsOfficeEstimate(amount) {
  const value = toMoneyNumber(amount)
  if (value <= 300000) return 780
  if (value <= 600000) return 1100
  if (value <= 800000) return 1250
  if (value <= 1000000) return 1400
  if (value <= 1500000) return 1600
  if (value <= 2000000) return 1800
  if (value <= 3000000) return 2100
  if (value <= 5000000) return 2600
  if (value <= 10000000) return 3400
  return 4800
}

function createLineItem({
  key,
  label,
  amount,
  category,
  payer = 'buyer',
  taxable = false,
  source = 'firm',
  note = '',
}) {
  return {
    key,
    label,
    amount: roundMoney(amount),
    category,
    payer,
    taxable,
    source,
    note,
  }
}

function getBuyerFicaFee(buyerType, profile) {
  if (buyerType === 'trust') return 2200
  if (buyerType === 'company') return 1650
  return 850
}

function getBuyerTypeLabel(buyerType) {
  if (buyerType === 'company') return 'Company purchaser'
  if (buyerType === 'trust') return 'Trust purchaser'
  return 'Individual purchaser'
}

function getTitleLabel(propertyTitle) {
  if (propertyTitle === 'freehold') return 'Freehold'
  if (propertyTitle === 'share_block') return 'Share block'
  return 'Sectional title'
}

function getTransactionBasisLabel(transactionBasis) {
  if (transactionBasis === 'vat') return 'VAT sale'
  if (transactionBasis === 'plot_plan') return 'Plot-and-plan'
  return 'Resale transfer'
}

function getFinanceLabel(financeType) {
  if (financeType === 'cash') return 'Cash'
  if (financeType === 'hybrid') return 'Hybrid finance'
  return 'Bond finance'
}

function sumItems(items, predicate) {
  return items.reduce((sum, item) => (predicate(item) ? sum + Number(item.amount || 0) : sum), 0)
}

function buildVatItems(items) {
  const buyerVatBase = sumItems(items, (item) => item.taxable && item.payer === 'buyer')
  const sellerVatBase = sumItems(items, (item) => item.taxable && item.payer === 'seller')
  const vatItems = []
  if (buyerVatBase > 0) {
    vatItems.push(createLineItem({
      key: 'vat-buyer',
      label: 'VAT on taxable buyer fees',
      amount: buyerVatBase * VAT_RATE,
      category: 'tax',
      payer: 'buyer',
      source: 'tax',
      note: 'Calculated at 15% on taxable fees and admin charges.',
    }))
  }
  if (sellerVatBase > 0) {
    vatItems.push(createLineItem({
      key: 'vat-seller',
      label: 'VAT on taxable seller fees',
      amount: sellerVatBase * VAT_RATE,
      category: 'tax',
      payer: 'seller',
      source: 'tax',
      note: 'Seller-side VAT shown separately from buyer collection.',
    }))
  }
  return vatItems
}

export function calculateConveyancingQuote(rawInput = {}) {
  const input = {
    ...DEFAULT_QUOTE_INPUT,
    ...rawInput,
    purchasePrice: toMoneyNumber(rawInput.purchasePrice ?? DEFAULT_QUOTE_INPUT.purchasePrice),
    bondAmount: toMoneyNumber(rawInput.bondAmount ?? DEFAULT_QUOTE_INPUT.bondAmount),
  }
  const profile = FEE_PROFILES[input.feeProfile] || FEE_PROFILES.standard
  const vatTransaction = isVatTransaction(input)
  const items = []

  const transferDuty = calculateTransferDuty(input.purchasePrice, { vatTransaction })
  if (transferDuty > 0) {
    items.push(createLineItem({
      key: 'transfer-duty',
      label: 'SARS transfer duty',
      amount: transferDuty,
      category: 'government',
      source: 'sars',
      note: `SARS table effective ${TRANSFER_DUTY_TABLE_EFFECTIVE}.`,
    }))
  }

  items.push(
    createLineItem({
      key: 'transfer-professional-fee',
      label: 'Transfer professional fee',
      amount: calculateTransferProfessionalFee(input.purchasePrice, profile.key),
      category: 'professional',
      taxable: true,
      source: 'firm',
      note: 'Mock firm tariff based on purchase price.',
    }),
    createLineItem({
      key: 'deeds-office-transfer',
      label: 'Deeds Office registration estimate',
      amount: calculateDeedsOfficeEstimate(input.purchasePrice),
      category: 'government',
      source: 'deeds',
      note: 'Placeholder bracket for mockup; replace with official firm table.',
    }),
    createLineItem({
      key: 'admin-bundle',
      label: 'File admin and electronic workflow',
      amount: profile.adminFee,
      category: 'professional',
      taxable: true,
      source: 'firm',
    }),
    createLineItem({
      key: 'fica-onboarding',
      label: `${getBuyerTypeLabel(input.buyerType)} FICA pack`,
      amount: getBuyerFicaFee(input.buyerType, profile),
      category: 'professional',
      taxable: true,
      source: 'firm',
    }),
    createLineItem({
      key: 'rates-clearance',
      label: 'Rates clearance facilitation',
      amount: profile.ratesClearanceFee,
      category: 'disbursement',
      taxable: true,
      source: 'third_party',
      note: 'Municipal rates figures and advance collections are excluded.',
    }),
    createLineItem({
      key: 'deeds-search',
      label: 'Deeds search and verification',
      amount: profile.deedsSearchFee,
      category: 'disbursement',
      taxable: true,
      source: 'third_party',
    }),
    createLineItem({
      key: 'electronic-lodgement',
      label: 'Electronic lodgement and document generation',
      amount: profile.electronicLodgementFee,
      category: 'disbursement',
      taxable: true,
      source: 'third_party',
    }),
    createLineItem({
      key: 'postage-petties',
      label: 'Postage and petties',
      amount: profile.postageFee,
      category: 'disbursement',
      taxable: true,
      source: 'third_party',
    }),
  )

  if (input.propertyTitle === 'sectional' || input.propertyTitle === 'share_block') {
    items.push(createLineItem({
      key: 'levy-clearance',
      label: `${getTitleLabel(input.propertyTitle)} levy clearance facilitation`,
      amount: profile.levyClearanceFee,
      category: 'disbursement',
      taxable: true,
      source: 'third_party',
      note: 'Body corporate levy figures are excluded.',
    }))
  }

  if (input.buyerType === 'company' || input.buyerType === 'trust') {
    items.push(createLineItem({
      key: 'entity-authority',
      label: `${getBuyerTypeLabel(input.buyerType)} authority review`,
      amount: input.buyerType === 'trust' ? 2100 : 1450,
      category: 'professional',
      taxable: true,
      source: 'firm',
    }))
  }

  if (input.financeType !== 'cash') {
    const bondAmount = input.financeType === 'hybrid'
      ? Math.min(input.bondAmount, input.purchasePrice)
      : input.bondAmount
    items.push(
      createLineItem({
        key: 'bond-professional-fee',
        label: 'Bond registration professional fee',
        amount: calculateBondProfessionalFee(bondAmount, profile.key),
        category: 'professional',
        taxable: true,
        source: 'firm',
        note: 'Shown as a separate bond registration estimate.',
      }),
      createLineItem({
        key: 'deeds-office-bond',
        label: 'Deeds Office bond registration estimate',
        amount: calculateDeedsOfficeEstimate(bondAmount),
        category: 'government',
        source: 'deeds',
        note: 'Placeholder bracket for mockup; replace with official firm table.',
      }),
      createLineItem({
        key: 'bank-instruction-admin',
        label: 'Bank instruction and guarantees admin',
        amount: profile.bankInstructionFee,
        category: 'professional',
        taxable: true,
        source: 'firm',
      }),
    )
  }

  if (input.includeCancellation) {
    items.push(
      createLineItem({
        key: 'seller-cancellation-fee',
        label: 'Seller bond cancellation fee',
        amount: profile.cancellationFee,
        category: 'professional',
        payer: 'seller',
        taxable: true,
        source: 'firm',
        note: 'Seller-side estimate; usually not part of the buyer transfer collection.',
      }),
      createLineItem({
        key: 'seller-bank-cancellation',
        label: 'Bank cancellation instruction admin',
        amount: 650,
        category: 'disbursement',
        payer: 'seller',
        taxable: true,
        source: 'third_party',
      }),
      createLineItem({
        key: 'deeds-office-cancellation',
        label: 'Deeds Office cancellation estimate',
        amount: 900,
        category: 'government',
        payer: 'seller',
        source: 'deeds',
      }),
    )
  }

  const lineItems = [...items, ...buildVatItems(items)]
  const buyerTotal = sumItems(lineItems, (item) => item.payer === 'buyer')
  const sellerTotal = sumItems(lineItems, (item) => item.payer === 'seller')
  const taxableBase = sumItems(lineItems, (item) => item.taxable)
  const professionalFees = sumItems(lineItems, (item) => item.category === 'professional')
  const governmentCharges = sumItems(lineItems, (item) => item.category === 'government')
  const thirdParty = sumItems(lineItems, (item) => item.category === 'disbursement')
  const vatTotal = sumItems(lineItems, (item) => item.category === 'tax')

  return {
    input,
    profile,
    vatTransaction,
    lineItems,
    assumptions: buildQuoteAssumptions(input, profile, vatTransaction),
    summary: {
      buyerTotal: roundMoney(buyerTotal),
      sellerTotal: roundMoney(sellerTotal),
      grandTotal: roundMoney(buyerTotal + sellerTotal),
      professionalFees: roundMoney(professionalFees),
      governmentCharges: roundMoney(governmentCharges),
      thirdParty: roundMoney(thirdParty),
      taxableBase: roundMoney(taxableBase),
      vatTotal: roundMoney(vatTotal),
      firmRevenueExVat: roundMoney(sumItems(lineItems, (item) => item.source === 'firm' && item.category !== 'tax')),
      transferDuty,
      cashNeededBeforeLodgement: roundMoney(buyerTotal),
    },
  }
}

export function buildQuoteAssumptions(input = {}, profile = FEE_PROFILES.standard, vatTransaction = false) {
  const assumptions = [
    `Purchase basis: ${getTransactionBasisLabel(input.transactionBasis)}.`,
    `Title and buyer: ${getTitleLabel(input.propertyTitle)} / ${getBuyerTypeLabel(input.buyerType)}.`,
    `Finance route: ${getFinanceLabel(input.financeType)}.`,
    `Professional fee profile: ${profile.label}.`,
    'Municipal rates figures, levy advance collections, bank initiation fees and insurance are excluded.',
    'Draft estimate only; final pro forma invoice depends on the signed mandate, bank instruction and firm tariff.',
  ]

  if (vatTransaction) {
    assumptions.splice(1, 0, 'VAT transaction selected: transfer duty is not charged in this estimate.')
  } else {
    assumptions.splice(1, 0, `Transfer duty uses the SARS table effective ${TRANSFER_DUTY_TABLE_EFFECTIVE}.`)
  }

  if (input.includeCancellation) {
    assumptions.push('Seller cancellation is shown separately and is not added to the buyer collection total.')
  }

  return assumptions
}

export function groupQuoteLineItems(lineItems = []) {
  return lineItems.reduce((groups, item) => {
    const key = item.category || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
    return groups
  }, {})
}
