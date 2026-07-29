import { getBondApplicationPathValue, isBondApplicationValuePresent } from './bondApplicationRuleEvaluator.js'

export function parseBondApplicationAmount(value) {
  if (!isBondApplicationValuePresent(value)) return null
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

export function sumBondApplicationAmounts(values = []) {
  return values.reduce((total, value) => {
    const parsed = parseBondApplicationAmount(value)
    return parsed === null ? total : total + parsed
  }, 0)
}

export function calculateMonthlyCommitmentTotal(applicationState = {}) {
  const expenses = applicationState?.participants?.primaryApplicant?.expenses || {}
  const commitments = Array.isArray(applicationState?.participants?.primaryApplicant?.monthlyCommitments)
    ? applicationState.participants.primaryApplicant.monthlyCommitments
    : []
  return sumBondApplicationAmounts([
    expenses.maintenance_amount,
    expenses.rental_expense,
    expenses.groceries,
    expenses.transport,
    expenses.medical_aid,
    expenses.education,
    ...commitments.map((item) => item?.monthlyAmount),
  ])
}

export function calculateAdditionalIncomeTotal(applicationState = {}) {
  const sources = Array.isArray(applicationState?.participants?.primaryApplicant?.incomeSources)
    ? applicationState.participants.primaryApplicant.incomeSources
    : []
  return sumBondApplicationAmounts(sources.map((source) => source?.monthlyAmount))
}

export function calculateAssetTotal(applicationState = {}) {
  const assets = Array.isArray(applicationState?.participants?.primaryApplicant?.assets)
    ? applicationState.participants.primaryApplicant.assets
    : []
  return sumBondApplicationAmounts(assets.map((asset) => asset?.value))
}

export function calculateLiabilityTotal(applicationState = {}) {
  const liabilities = Array.isArray(applicationState?.participants?.primaryApplicant?.liabilities)
    ? applicationState.participants.primaryApplicant.liabilities
    : []
  const debts = Array.isArray(applicationState?.participants?.primaryApplicant?.debts)
    ? applicationState.participants.primaryApplicant.debts
    : []
  return sumBondApplicationAmounts([
    ...liabilities.map((liability) => liability?.value),
    ...debts.map((debt) => getBondApplicationPathValue(debt, 'outstandingBalance') ?? getBondApplicationPathValue(debt, 'currentBalance')),
  ])
}

export function calculateRequestedBondAmount(applicationState = {}) {
  const finance = applicationState?.application?.finance || {}
  const purchase = parseBondApplicationAmount(finance.purchasePrice)
  const deposit = parseBondApplicationAmount(finance.depositAmount)
  if (purchase === null || deposit === null) return finance.requestedBondAmount ?? null
  return String(purchase - deposit)
}
