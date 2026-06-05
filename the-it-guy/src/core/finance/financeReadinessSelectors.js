export const FINANCE_READINESS_DISCLAIMER =
  'These estimates are based on the information provided and do not constitute financial approval or credit advice. Final approval depends on bank assessment and supporting documentation.'

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function positiveNumber(value, fallback = 0) {
  return Math.max(0, number(value, fallback))
}

function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function roundTo(value, increment = 1000) {
  if (!Number.isFinite(Number(value))) return 0
  return Math.round(Number(value) / increment) * increment
}

function monthlyRepayment(principal, annualRate = 11.75, years = 20) {
  const amount = positiveNumber(principal)
  if (!amount) return 0
  const months = Math.max(1, positiveNumber(years, 20) * 12)
  const monthlyRate = positiveNumber(annualRate, 11.75) / 100 / 12
  if (!monthlyRate) return amount / months
  return amount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1)
}

function principalFromRepayment(payment, annualRate = 11.75, years = 20) {
  const repayment = positiveNumber(payment)
  if (!repayment) return 0
  const months = Math.max(1, positiveNumber(years, 20) * 12)
  const monthlyRate = positiveNumber(annualRate, 11.75) / 100 / 12
  if (!monthlyRate) return repayment * months
  return repayment * ((Math.pow(1 + monthlyRate, months) - 1) / (monthlyRate * Math.pow(1 + monthlyRate, months)))
}

function isFilled(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  return false
}

function getPurchaserEntries(formData = {}) {
  if (Array.isArray(formData.purchasers) && formData.purchasers.length) {
    return formData.purchasers.filter((entry) => entry && typeof entry === 'object')
  }

  const primary = {}
  const secondary = {}
  Object.entries(formData || {}).forEach(([key, value]) => {
    if (key.startsWith('co_')) {
      secondary[key.slice(3)] = value
    } else {
      primary[key] = value
    }
  })

  const entries = []
  if (Object.values(primary).some(isFilled)) entries.push(primary)
  if (Object.values(secondary).some(isFilled)) entries.push(secondary)
  return entries
}

function sumFromEntries(entries = [], keys = []) {
  return entries.reduce((total, entry) => {
    const value = keys.map((key) => entry?.[key]).find(isFilled)
    return total + positiveNumber(value)
  }, 0)
}

function pickFirstFromEntries(entries = [], keys = []) {
  for (const entry of entries) {
    for (const key of keys) {
      const value = entry?.[key]
      if (isFilled(value)) return value
    }
  }
  return ''
}

function pickFirstValue(candidates = []) {
  for (const candidate of candidates) {
    if (isFilled(candidate)) return candidate
  }
  return ''
}

function normalizeChoice(value) {
  return text(value).toLowerCase()
}

function isYesChoice(value) {
  return ['yes', 'true', '1'].includes(normalizeChoice(value))
}

function isNoChoice(value) {
  return ['no', 'false', '0'].includes(normalizeChoice(value))
}

function monthsSinceDate(value) {
  const normalized = text(value)
  if (!normalized) return 0
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return 0
  const now = new Date()
  const months = (now.getFullYear() - parsed.getFullYear()) * 12 + (now.getMonth() - parsed.getMonth())
  return Math.max(0, months)
}

function getEmploymentDurationMonths(entries = []) {
  return entries.reduce((maxMonths, entry) => {
    const fromDate = monthsSinceDate(entry?.employment_start_date || entry?.employmentStartDate)
    const fromBusinessYears = positiveNumber(entry?.years_in_business || entry?.yearsInBusiness) * 12
    const explicit =
      positiveNumber(entry?.employment_duration_months || entry?.employmentDurationMonths) ||
      positiveNumber(entry?.employment_months || entry?.employmentMonths)
    return Math.max(maxMonths, fromDate, fromBusinessYears, explicit)
  }, 0)
}

function getFinanceProfile(formData = {}) {
  return formData.finance || formData.financial_profile || formData.financialProfile || {}
}

function getReadinessDeclarationFlags(formData = {}) {
  const purchasers = getPurchaserEntries(formData)
  const finance = getFinanceProfile(formData)
  const flags = []
  const anyPurchaserYes = (keys = []) => purchasers.some((entry) => keys.some((key) => isYesChoice(entry?.[key])))

  if (anyPurchaserYes(['under_debt_review', 'underDebtReview'])) flags.push('Debt review declared')
  if (anyPurchaserYes(['under_administration', 'underAdministration'])) flags.push('Administration declared')
  if (anyPurchaserYes(['ever_declared_insolvent', 'everDeclaredInsolvent'])) flags.push('Prior insolvency declared')
  if (anyPurchaserYes(['surety_obligations', 'suretyObligations'])) flags.push('Surety obligations declared')

  const bankStatementsAvailable = pickFirstValue([finance.bank_statements_available, finance.bankStatementsAvailable, formData.bank_statements_available, formData.bankStatementsAvailable])
  if (isNoChoice(bankStatementsAvailable)) flags.push('Bank statements not confirmed')

  const consent = pickFirstValue([finance.bond_readiness_consent, finance.bondReadinessConsent, formData.bond_readiness_consent, formData.bondReadinessConsent])
  if (isNoChoice(consent)) flags.push('Bond readiness sharing consent not granted')

  return flags
}

export function formatFinanceCurrency(value) {
  return CURRENCY_FORMATTER.format(positiveNumber(value))
}

export function extractFinanceReadinessInputs(source = {}) {
  const formData = source?.form_data || source?.formData || source?.onboardingFormData || source || {}
  const readiness = formData.finance_readiness || formData.financeReadiness || {}
  const inputs = readiness.affordability_inputs || readiness.affordabilityInputs || {}
  const bondApplication = formData.bond_application || formData.bondApplication || {}
  const employment = formData.employment || formData.employment_details || formData.employmentDetails || {}
  const finance = getFinanceProfile(formData)
  const purchasers = getPurchaserEntries(formData)
  const summedGrossIncome = sumFromEntries(purchasers, ['gross_monthly_income', 'grossMonthlyIncome', 'monthly_income', 'monthlyIncome'])
  const summedNetIncome = sumFromEntries(purchasers, ['net_monthly_income', 'netMonthlyIncome'])
  const summedMonthlyIncome = summedGrossIncome || summedNetIncome
  const summedDebt = sumFromEntries(purchasers, ['monthly_credit_commitments', 'monthlyCreditCommitments', 'monthly_debt', 'monthlyDebt'])
  const summedExpenses = sumFromEntries(purchasers, ['monthly_living_expenses', 'monthlyLivingExpenses', 'monthly_expenses', 'monthlyExpenses'])
  const summedDependants = sumFromEntries(purchasers, ['number_of_dependants', 'numberOfDependants', 'dependants', 'dependents'])
  const employmentType = pickFirstFromEntries(purchasers, ['employment_type', 'employmentType'])
  const employmentDurationMonths = getEmploymentDurationMonths(purchasers)

  return {
    monthlyIncome: positiveNumber(
      inputs.monthlyIncome ??
        inputs.monthly_income ??
        bondApplication.monthly_income ??
        finance.monthly_income ??
        finance.monthlyIncome ??
        summedMonthlyIncome,
    ),
    otherIncome: positiveNumber(inputs.otherIncome ?? inputs.other_income ?? bondApplication.other_income ?? finance.other_income ?? finance.otherIncome),
    monthlyDebt: positiveNumber(inputs.monthlyDebt ?? inputs.monthly_debt ?? bondApplication.monthly_debt ?? finance.monthly_debt ?? finance.monthlyDebt ?? summedDebt),
    monthlyExpenses: positiveNumber(
      inputs.monthlyExpenses ??
        inputs.expenses ??
        inputs.monthly_expenses ??
        bondApplication.monthly_expenses ??
        finance.monthly_expenses ??
        finance.expenses ??
        summedExpenses,
    ),
    deposit: positiveNumber(
      inputs.deposit ??
        inputs.depositAvailable ??
        inputs.deposit_available ??
        bondApplication.deposit_available ??
        bondApplication.deposit_contribution ??
        finance.cash_contribution_available ??
        finance.cashContributionAvailable ??
        finance.deposit_available ??
        finance.deposit ??
        formData.cash_contribution_available ??
        formData.cashContributionAvailable ??
        formData.deposit_available ??
        formData.deposit_amount ??
        finance.cash_amount ??
        formData.cash_amount,
    ),
    depositCaptured:
      inputs.depositCaptured === true ||
      inputs.deposit_captured === true ||
      [
        finance.cash_contribution_available,
        finance.cashContributionAvailable,
        formData.cash_contribution_available,
        formData.cashContributionAvailable,
        finance.deposit_available,
        formData.deposit_available,
        formData.deposit_amount,
      ].some(isFilled),
    interestRate: positiveNumber(inputs.interestRate ?? inputs.interest_rate ?? finance.interest_rate, 11.75),
    repaymentYears: positiveNumber(inputs.repaymentYears ?? inputs.repayment_years ?? finance.repayment_years, 20),
    dependants: positiveNumber(inputs.dependants ?? inputs.dependents ?? bondApplication.dependants ?? finance.dependants ?? summedDependants),
    employmentType: text(inputs.employmentType ?? inputs.employment_type ?? employment.employment_type ?? employment.type ?? employmentType),
    employmentDurationMonths: positiveNumber(
      inputs.employmentDurationMonths ??
        inputs.employment_duration_months ??
        employment.duration_months ??
        employment.employment_duration_months ??
        employmentDurationMonths,
    ),
    estimatedPurchaseRange: positiveNumber(
      inputs.estimatedPurchaseRange ??
        inputs.estimated_purchase_range ??
        bondApplication.estimated_purchase_range ??
        bondApplication.purchase_price ??
        finance.purchase_price ??
        formData.purchase_price,
    ),
    documentReadiness: positiveNumber(inputs.documentReadiness ?? inputs.document_readiness),
    onboardingCompleteness: positiveNumber(inputs.onboardingCompleteness ?? inputs.onboarding_completeness),
  }
}

export function calculateAffordabilityEstimate(input = {}) {
  const monthlyIncome = positiveNumber(input.monthlyIncome) + positiveNumber(input.otherIncome)
  const monthlyDebt = positiveNumber(input.monthlyDebt)
  const expenses = positiveNumber(input.expenses ?? input.monthlyExpenses)
  const dependants = positiveNumber(input.dependants)
  const deposit = positiveNumber(input.deposit)
  const depositCaptured = input.depositCaptured === true || deposit > 0
  const interestRate = positiveNumber(input.interestRate, 11.75)
  const repaymentYears = positiveNumber(input.repaymentYears, 20)
  const warnings = []

  if (!monthlyIncome) warnings.push('Monthly income is missing.')
  if (!depositCaptured) warnings.push('Deposit has not been captured yet.')
  if (!expenses) warnings.push('Monthly expenses are incomplete.')

  const dependantAllowance = dependants * 1800
  const grossDebtRatio = monthlyIncome ? monthlyDebt / monthlyIncome : 1
  const conservativeDebtCap = monthlyIncome * 0.3
  const netDisposable = Math.max(0, monthlyIncome - monthlyDebt - expenses - dependantAllowance)
  const repaymentCapacity = Math.max(0, Math.min(conservativeDebtCap - monthlyDebt, netDisposable * 0.55))
  const estimatedBondAmount = principalFromRepayment(repaymentCapacity, interestRate, repaymentYears)
  const depositAdjustedMax = estimatedBondAmount + deposit
  const estimatedPurchaseRangeMax = roundTo(depositAdjustedMax * 0.95, 10000)
  const estimatedPurchaseRangeMin = roundTo(estimatedPurchaseRangeMax * 0.82, 10000)
  const estimatedMonthlyRepayment = roundTo(monthlyRepayment(Math.max(0, estimatedPurchaseRangeMax - deposit), interestRate, repaymentYears), 100)

  if (grossDebtRatio >= 0.35) warnings.push('High existing debt exposure may reduce finance readiness.')
  if (repaymentCapacity <= 0 && monthlyIncome) warnings.push('No conservative repayment capacity is available from captured income and expenses.')

  const affordabilityBand =
    !monthlyIncome ? 'Incomplete' :
    grossDebtRatio >= 0.35 || repaymentCapacity <= monthlyIncome * 0.08 ? 'Needs Attention' :
    deposit >= estimatedPurchaseRangeMax * 0.1 && repaymentCapacity >= monthlyIncome * 0.2 ? 'Strong' :
    'Moderate'

  const confidence =
    !monthlyIncome ? 'Low' :
    warnings.length >= 2 ? 'Low' :
    warnings.length === 1 ? 'Medium' :
    'Medium'

  return {
    estimatedPurchaseRangeMin,
    estimatedPurchaseRangeMax,
    estimatedMonthlyRepayment,
    affordabilityBand,
    confidence,
    warnings,
  }
}

export function calculateFinanceReadinessScore(input = {}) {
  const income = positiveNumber(input.monthlyIncome) + positiveNumber(input.otherIncome)
  const debt = positiveNumber(input.monthlyDebt)
  const expenses = positiveNumber(input.expenses ?? input.monthlyExpenses)
  const deposit = positiveNumber(input.deposit)
  const depositCaptured = input.depositCaptured === true || deposit > 0
  const employmentDurationMonths = positiveNumber(input.employmentDurationMonths)
  const documentReadiness = clamp(number(input.documentReadiness, 0), 0, 1)
  const onboardingCompleteness = clamp(number(input.onboardingCompleteness, 0), 0, 1)
  const debtRatio = income ? debt / income : 1
  const disposable = Math.max(0, income - debt - expenses - positiveNumber(input.dependants) * 1800)
  const bufferRatio = income ? disposable / income : 0
  const affordability = calculateAffordabilityEstimate(input)
  const targetPurchase = positiveNumber(input.estimatedPurchaseRange || affordability.estimatedPurchaseRangeMax)
  const depositRatio = targetPurchase ? deposit / targetPurchase : 0
  const strengths = []
  const risks = []
  const recommendations = []

  let score = 0
  if (income > 0) score += 18
  if (income >= 45000) score += 8
  if (debtRatio <= 0.2) score += 16
  else if (debtRatio <= 0.32) score += 9
  else risks.push('High debt exposure')
  if (depositRatio >= 0.1) score += 16
  else if (deposit > 0) score += 8
  else risks.push(depositCaptured ? 'No deposit or cash contribution available' : 'Deposit not captured')
  if (employmentDurationMonths >= 24) score += 12
  else if (employmentDurationMonths >= 6) score += 7
  else risks.push('Short employment history')
  score += Math.round(documentReadiness * 14)
  score += Math.round(onboardingCompleteness * 12)
  if (bufferRatio >= 0.28) score += 12
  else if (bufferRatio >= 0.15) score += 7
  else risks.push('Limited affordability buffer')

  if (income > 0) strengths.push('Income captured')
  if (debtRatio <= 0.25 && income) strengths.push('Manageable debt ratio')
  if (depositRatio >= 0.1) strengths.push('Deposit position supports transaction readiness')
  if (employmentDurationMonths >= 12) strengths.push('Employment history captured')
  if (documentReadiness >= 0.75) strengths.push('Supporting finance documents mostly ready')

  if (!income) recommendations.push('Capture monthly income before estimating readiness.')
  if (!expenses) recommendations.push('Capture monthly expenses for a better affordability estimate.')
  if (documentReadiness < 0.75) recommendations.push('Collect income, bank statement, and identification documents.')
  if (debtRatio > 0.32) recommendations.push('Review monthly debt commitments with the buyer.')
  if (!depositCaptured || depositRatio < 0.05) recommendations.push('Confirm available deposit or cash contribution.')

  score = clamp(score, 0, 100)
  const label =
    score >= 76 ? 'Strong' :
    score >= 55 ? 'Moderate' :
    score >= 25 ? 'Needs Attention' :
    'Incomplete'
  const tone =
    label === 'Strong' ? 'success' :
    label === 'Moderate' ? 'warning' :
    label === 'Needs Attention' ? 'danger' :
    'neutral'

  return {
    score,
    label,
    tone,
    strengths,
    risks,
    recommendations,
  }
}

function readinessLabelForScore(score = 0) {
  if (score >= 76) return 'Strong'
  if (score >= 55) return 'Moderate'
  if (score >= 25) return 'Needs Attention'
  return 'Incomplete'
}

function readinessToneForLabel(label = '') {
  if (label === 'Strong') return 'success'
  if (label === 'Moderate') return 'warning'
  if (label === 'Needs Attention') return 'danger'
  return 'neutral'
}

function applyDeclarationRiskPenalty(score = {}, declarationFlags = []) {
  if (!declarationFlags.length) return score
  const nextScore = clamp(positiveNumber(score.score) - Math.min(40, declarationFlags.length * 14), 0, 100)
  const label = readinessLabelForScore(nextScore)
  return {
    ...score,
    score: nextScore,
    label,
    tone: readinessToneForLabel(label),
    risks: [...new Set([...(score.risks || []), ...declarationFlags])],
  }
}

export function getDepositStrength({ deposit = 0, estimatedPurchaseRangeMax = 0, purchasePrice = 0 } = {}) {
  const target = positiveNumber(estimatedPurchaseRangeMax || purchasePrice)
  if (!positiveNumber(deposit)) return 'Limited'
  if (!target) return 'Moderate'
  const ratio = positiveNumber(deposit) / target
  if (ratio >= 0.12) return 'Strong'
  if (ratio >= 0.05) return 'Moderate'
  return 'Limited'
}

export function shouldShowFinanceReadinessSection(rowOrTransaction = {}) {
  const transaction = rowOrTransaction?.transaction || rowOrTransaction || {}
  const financeType = lower(transaction.finance_type || transaction.financeType)
  return financeType === 'bond' || financeType === 'hybrid' || financeType === 'combination' || !financeType
}

export function shouldShowBondReadinessCta(rowOrTransaction = {}) {
  const transaction = rowOrTransaction?.transaction || rowOrTransaction || {}
  const financeType = lower(transaction.finance_type || transaction.financeType)
  return financeType === 'bond' || financeType === 'hybrid' || financeType === 'combination'
}

export function getFinanceReadinessSummary(rowOrTransaction = {}) {
  const row = rowOrTransaction || {}
  const transaction = row.transaction || row
  const financeType = lower(transaction.finance_type || transaction.financeType)
  const onboardingFormData =
    row.onboardingFormData ||
    row.onboarding_form_data ||
    row.onboarding?.formData ||
    row.onboarding?.form_data ||
    row.onboardingPrefill?.form_data ||
    row.onboardingPrefill?.formData ||
    {}
  const formData = onboardingFormData.form_data || onboardingFormData.formData || onboardingFormData
  const existing = formData.finance_readiness || formData.financeReadiness || {}
  const documentSummary = row.documentSummary || {}
  const documentTotal = positiveNumber(documentSummary.totalRequired)
  const documentUploaded = positiveNumber(documentSummary.uploadedCount)
  const documentReadiness = documentTotal ? clamp(documentUploaded / documentTotal, 0, 1) : number(existing.document_readiness, 0)
  const extractedInputs = extractFinanceReadinessInputs(formData)
  const rawPurchasePrice = positiveNumber(extractedInputs.estimatedPurchaseRange || transaction.purchase_price || transaction.sales_price)
  const isHybrid = financeType === 'hybrid' || financeType === 'combination'
  const isBondLike = shouldShowBondReadinessCta(transaction)
  const finance = getFinanceProfile(formData)
  const purchaserEntries = getPurchaserEntries(formData)
  const hasCapturedPurchaserValue = (keys = []) =>
    purchaserEntries.some((entry) => keys.some((key) => isFilled(entry?.[key])))
  const hasCapturedDeposit = extractedInputs.depositCaptured === true || [
    finance.cash_contribution_available,
    finance.cashContributionAvailable,
    formData.cash_contribution_available,
    formData.cashContributionAvailable,
    finance.deposit_available,
    formData.deposit_available,
    formData.deposit_amount,
  ].some(isFilled) || positiveNumber(extractedInputs.deposit) > 0
  const hasBankStatementsChoice = [
    finance.bank_statements_available,
    finance.bankStatementsAvailable,
    formData.bank_statements_available,
    formData.bankStatementsAvailable,
  ].some(isFilled)
  const hasConsentChoice = [
    finance.bond_readiness_consent,
    finance.bondReadinessConsent,
    formData.bond_readiness_consent,
    formData.bondReadinessConsent,
  ].some(isFilled)
  const hasCashContributionSource = [
    finance.cash_contribution_source,
    finance.cashContributionSource,
    formData.cash_contribution_source,
    formData.cashContributionSource,
  ].some(isFilled)
  const completenessChecks = [
    positiveNumber(extractedInputs.monthlyIncome) > 0,
    positiveNumber(extractedInputs.employmentDurationMonths) > 0,
    positiveNumber(extractedInputs.estimatedPurchaseRange || transaction.purchase_price || transaction.sales_price) > 0,
    hasCapturedPurchaserValue(['monthly_credit_commitments', 'monthlyCreditCommitments', 'monthly_debt', 'monthlyDebt']) || positiveNumber(extractedInputs.monthlyDebt) > 0,
    hasCapturedPurchaserValue(['number_of_dependants', 'numberOfDependants', 'dependants', 'dependents']) || positiveNumber(extractedInputs.dependants) > 0,
  ]
  if (isBondLike) {
    completenessChecks.push(
      positiveNumber(extractedInputs.monthlyExpenses) > 0,
      Boolean(hasCapturedDeposit),
      hasCashContributionSource,
      hasBankStatementsChoice,
      hasConsentChoice,
    )
  } else if (extractedInputs.monthlyExpenses) {
    completenessChecks.push(true)
  }
  const input = {
    ...extractedInputs,
    monthlyIncome: positiveNumber(extractedInputs.monthlyIncome || transaction.monthly_income),
    monthlyDebt: positiveNumber(extractedInputs.monthlyDebt || transaction.monthly_debt),
    monthlyExpenses: positiveNumber(extractedInputs.monthlyExpenses || transaction.monthly_expenses),
    deposit: positiveNumber(extractedInputs.deposit || transaction.deposit_amount || transaction.cash_amount),
    depositCaptured: hasCapturedDeposit,
    estimatedPurchaseRange: rawPurchasePrice,
    documentReadiness,
    onboardingCompleteness:
      existing.onboarding_completeness ||
      clamp(completenessChecks.filter(Boolean).length / completenessChecks.length, 0, 1),
  }
  const affordabilityEstimate = existing.affordability_estimate || calculateAffordabilityEstimate(input)
  const score = existing.readiness_score
    ? {
        score: positiveNumber(existing.readiness_score.score ?? existing.readiness_score),
        label: text(existing.readiness_score.label) || 'Incomplete',
        tone: text(existing.readiness_score.tone) || 'neutral',
        strengths: existing.readiness_score.strengths || [],
        risks: existing.readiness_score.risks || [],
        recommendations: existing.readiness_score.recommendations || [],
      }
    : calculateFinanceReadinessScore(input)
  const missingItems = []
  if (!input.monthlyIncome) missingItems.push('Monthly income')
  if (!input.monthlyExpenses) missingItems.push('Monthly expenses')
  if (isBondLike && !hasCapturedDeposit) missingItems.push(isHybrid ? 'Cash contribution / deposit position' : 'Deposit position')
  if (isBondLike && !hasCashContributionSource) missingItems.push('Cash contribution source')
  if (isBondLike && !hasBankStatementsChoice) missingItems.push('Bank statement availability')
  if (isBondLike && !hasConsentChoice) missingItems.push('Bond readiness consent')
  if (!input.employmentDurationMonths) missingItems.push('Employment duration')
  if (!input.estimatedPurchaseRange) missingItems.push('Purchase price')
  if (documentReadiness < 0.75) missingItems.push('Finance documents')
  const declarationRiskFlags = getReadinessDeclarationFlags(formData)
  const readinessScore = applyDeclarationRiskPenalty(score, declarationRiskFlags)
  const riskFlags = [...new Set([...(existing.risk_flags || []), ...readinessScore.risks, ...affordabilityEstimate.warnings, ...declarationRiskFlags])]
  const depositStrength = getDepositStrength({
    deposit: input.deposit,
    estimatedPurchaseRangeMax: affordabilityEstimate.estimatedPurchaseRangeMax || input.estimatedPurchaseRange,
    purchasePrice: transaction.purchase_price || transaction.sales_price,
  })
  const nextRecommendedAction =
    !shouldShowBondReadinessCta(transaction) ? 'Confirm proof of funds for the cash component.' :
    missingItems.includes('Monthly income') ? 'Send Bond Readiness Form' :
    missingItems.includes('Finance documents') ? 'Collect Bank Statements' :
    readinessScore.score >= 70 ? 'Refer to Bond Originator' :
    'Request Documents'

  return {
    readinessScore,
    affordabilityEstimate,
    repaymentEstimate: affordabilityEstimate.estimatedMonthlyRepayment,
    depositStrength,
    riskFlags,
    strengths: readinessScore.strengths,
    recommendations: readinessScore.recommendations,
    missingItems,
    confidenceLabel: affordabilityEstimate.confidence,
    nextRecommendedAction,
    disclaimer: FINANCE_READINESS_DISCLAIMER,
    inputs: input,
  }
}

export function buildFinanceReadinessPayload(input = {}, existingFormData = {}) {
  const affordabilityEstimate = calculateAffordabilityEstimate(input)
  const readinessScore = calculateFinanceReadinessScore({
    ...input,
    estimatedPurchaseRange: input.estimatedPurchaseRange || affordabilityEstimate.estimatedPurchaseRangeMax,
  })
  const now = new Date().toISOString()
  return {
    ...existingFormData,
    finance_readiness: {
      ...(existingFormData.finance_readiness || {}),
      affordability_estimate: affordabilityEstimate,
      repayment_estimate: affordabilityEstimate.estimatedMonthlyRepayment,
      deposit_strength: getDepositStrength({
        deposit: input.deposit,
        estimatedPurchaseRangeMax: affordabilityEstimate.estimatedPurchaseRangeMax,
        purchasePrice: input.estimatedPurchaseRange,
      }),
      readiness_score: readinessScore,
      risk_flags: [...new Set([...readinessScore.risks, ...affordabilityEstimate.warnings])],
      affordability_inputs: {
        monthlyIncome: positiveNumber(input.monthlyIncome),
        otherIncome: positiveNumber(input.otherIncome),
        monthlyDebt: positiveNumber(input.monthlyDebt),
        monthlyExpenses: positiveNumber(input.monthlyExpenses ?? input.expenses),
        deposit: positiveNumber(input.deposit),
        depositCaptured: input.depositCaptured === true || positiveNumber(input.deposit) > 0,
        employmentType: text(input.employmentType),
        employmentDurationMonths: positiveNumber(input.employmentDurationMonths),
        dependants: positiveNumber(input.dependants),
        estimatedPurchaseRange: positiveNumber(input.estimatedPurchaseRange),
        interestRate: positiveNumber(input.interestRate, 11.75),
        repaymentYears: positiveNumber(input.repaymentYears, 20),
        documentReadiness: clamp(number(input.documentReadiness, 0), 0, 1),
        onboardingCompleteness: clamp(number(input.onboardingCompleteness, 0), 0, 1),
      },
      generated_at: existingFormData.finance_readiness?.generated_at || now,
      last_updated_at: now,
    },
  }
}

export function getFinanceReadinessAnalytics(rows = []) {
  const summaries = (Array.isArray(rows) ? rows : []).map((row) => getFinanceReadinessSummary(row))
  const scoreValues = summaries.map((summary) => number(summary.readinessScore?.score)).filter((value) => value > 0)
  const averageReadinessScore = scoreValues.length
    ? Math.round(scoreValues.reduce((total, value) => total + value, 0) / scoreValues.length)
    : 0
  const distribution = (key) => summaries.reduce((accumulator, summary) => {
    const value = summary[key] || 'Unknown'
    accumulator[value] = (accumulator[value] || 0) + 1
    return accumulator
  }, {})

  return {
    averageReadinessScore,
    affordabilityDistribution: summaries.reduce((accumulator, summary) => {
      const band = summary.affordabilityEstimate?.affordabilityBand || 'Incomplete'
      accumulator[band] = (accumulator[band] || 0) + 1
      return accumulator
    }, {}),
    depositStrengthDistribution: distribution('depositStrength'),
    financeConversionPotential: summaries.filter((summary) => summary.readinessScore?.score >= 65).length,
    readinessHeatmapInputs: summaries.map((summary, index) => ({
      id: rows[index]?.transaction?.id || rows[index]?.id || `finance-readiness-${index}`,
      score: summary.readinessScore?.score || 0,
      label: summary.readinessScore?.label || 'Incomplete',
      riskCount: summary.riskFlags?.length || 0,
      affordabilityMax: summary.affordabilityEstimate?.estimatedPurchaseRangeMax || 0,
    })),
  }
}

export function buildFinanceReadinessHandoffPacket(rowOrTransaction = {}) {
  const summary = getFinanceReadinessSummary(rowOrTransaction)
  const score = positiveNumber(summary.readinessScore?.score)
  const label = text(summary.readinessScore?.label) || 'Incomplete'
  const missingItems = Array.isArray(summary.missingItems) ? summary.missingItems.filter(Boolean) : []
  const riskFlags = Array.isArray(summary.riskFlags) ? summary.riskFlags.filter(Boolean) : []
  const strengths = Array.isArray(summary.strengths) ? summary.strengths.filter(Boolean) : []
  const recommendations = Array.isArray(summary.recommendations) ? summary.recommendations.filter(Boolean) : []
  const estimate = summary.affordabilityEstimate || {}
  const financeDocumentsMissing = missingItems.includes('Finance documents')
  const inputMissingItems = missingItems.filter((item) => item !== 'Finance documents')
  const action =
    inputMissingItems.length ? 'Complete readiness inputs before originator review.' :
    financeDocumentsMissing ? 'Collect supporting finance documents before bank submission.' :
    riskFlags.length ? 'Review declared readiness risks with the buyer.' :
    summary.nextRecommendedAction || 'Refer to Bond Originator'
  const statusLabel =
    inputMissingItems.length ? 'Inputs Outstanding' :
    financeDocumentsMissing ? 'Documents Outstanding' :
    score >= 70 && riskFlags.length === 0 ? 'Originator Ready' :
    riskFlags.length ? 'Originator Review Needed' :
    score > 0 ? 'Indicative Readiness Captured' :
    'Readiness Not Captured'
  const statusTone =
    missingItems.length ? 'warning' :
    score >= 70 && riskFlags.length === 0 ? 'success' :
    riskFlags.length ? 'danger' :
    score > 0 ? 'warning' :
    'neutral'
  const topBlockers = [...new Set([...missingItems, ...riskFlags])].slice(0, 5)
  const handoffChecklist = [
    {
      key: 'readiness_inputs',
      label: 'Readiness inputs',
      complete: missingItems.length === 0,
      detail: missingItems.length ? `${missingItems.length} missing` : 'Captured',
    },
    {
      key: 'supporting_documents',
      label: 'Supporting documents',
      complete: !missingItems.includes('Finance documents'),
      detail: missingItems.includes('Finance documents') ? 'Outstanding' : 'No readiness blocker',
    },
    {
      key: 'risk_review',
      label: 'Risk review',
      complete: riskFlags.length === 0,
      detail: riskFlags.length ? `${riskFlags.length} flag${riskFlags.length === 1 ? '' : 's'}` : 'No flags captured',
    },
  ]

  return {
    statusLabel,
    statusTone,
    score,
    scoreLabel: `${score}% · ${label}`,
    readinessLabel: label,
    affordabilityRangeLabel:
      estimate.estimatedPurchaseRangeMin || estimate.estimatedPurchaseRangeMax
        ? `${formatFinanceCurrency(estimate.estimatedPurchaseRangeMin)} - ${formatFinanceCurrency(estimate.estimatedPurchaseRangeMax)}`
        : 'Range pending',
    repaymentEstimateLabel: estimate.estimatedMonthlyRepayment
      ? `${formatFinanceCurrency(estimate.estimatedMonthlyRepayment)} / month est.`
      : 'Repayment pending',
    depositStrengthLabel: `${summary.depositStrength || 'Limited'} deposit position`,
    recommendedAction: action,
    topMissingItems: missingItems.slice(0, 5),
    topRiskFlags: riskFlags.slice(0, 5),
    topStrengths: strengths.slice(0, 4),
    topRecommendations: recommendations.slice(0, 4),
    topBlockers,
    handoffChecklist,
    summaryLine:
      topBlockers.length
        ? `${statusLabel}: ${topBlockers.slice(0, 2).join(', ')}.`
        : `${statusLabel}: captured data supports originator review.`,
    disclaimer: FINANCE_READINESS_DISCLAIMER,
  }
}

export function hasCompletedBuyerReadinessForm(formData = {}) {
  const readiness = formData?.finance_readiness || formData?.financeReadiness || {}
  const inputs = readiness.affordability_inputs || readiness.affordabilityInputs || {}
  return Boolean(
    positiveNumber(inputs.monthlyIncome || inputs.monthly_income) &&
      positiveNumber(inputs.monthlyExpenses || inputs.monthly_expenses || inputs.expenses),
  )
}

export function isFinanceReadinessSafeCopy(value = '') {
  const normalized = lower(value)
  return !/(guaranteed|pre-approved by bank|accepted by bank|approved)/i.test(normalized)
}
