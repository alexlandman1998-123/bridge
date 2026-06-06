import {
  FINANCE_READINESS_DISCLAIMER,
  getFinanceReadinessSummary,
} from '../core/finance/financeReadinessSelectors'

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

function percent(value) {
  return Math.max(0, Math.min(100, Math.round(number(value))))
}

function ratioPercent(value) {
  return percent(number(value) * 100)
}

function formatCurrency(value, fallback = 'Pending') {
  const amount = positiveNumber(value)
  return amount ? CURRENCY_FORMATTER.format(amount) : fallback
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  return Object.keys(value || {}).length > 0
}

function pickValue(source = {}, keys = []) {
  for (const key of keys) {
    if (hasValue(source?.[key])) return source[key]
  }
  return ''
}

function collectDocuments(applicationData = {}) {
  const docs = Array.isArray(applicationData.documents) ? applicationData.documents : []
  const checklist = Array.isArray(applicationData.requiredDocumentChecklist) ? applicationData.requiredDocumentChecklist : []
  return { docs, checklist }
}

function hasDocumentLike(applicationData = {}, patterns = []) {
  const { docs, checklist } = collectDocuments(applicationData)
  const haystack = [...docs, ...checklist]
    .map((item) => `${item?.name || ''} ${item?.displayName || ''} ${item?.label || ''} ${item?.category || ''} ${item?.categoryLabel || ''} ${item?.document_type_key || ''} ${item?.key || ''}`.toLowerCase())
    .join(' ')
  return patterns.some((pattern) => haystack.includes(pattern))
}

function getScoreState(score = 0) {
  const value = percent(score)
  if (value <= 30) return { label: 'Critical', tone: 'danger', color: '#ef4444' }
  if (value <= 60) return { label: 'Needs Attention', tone: 'warning', color: '#f59e0b' }
  if (value <= 85) return { label: 'Almost Ready', tone: 'info', color: '#2563eb' }
  return { label: 'Ready', tone: 'success', color: '#16a34a' }
}

function getProgressTone(value = 0) {
  const score = percent(value)
  if (score >= 80) return 'success'
  if (score >= 55) return 'warning'
  return 'danger'
}

function getProgressColor(tone = 'neutral') {
  if (tone === 'success') return '#16a34a'
  if (tone === 'warning') return '#f59e0b'
  if (tone === 'danger') return '#ef4444'
  return '#2563eb'
}

function normalizeApplicationData(applicationData = {}) {
  const transaction = applicationData.transaction || {}
  const onboardingFormData = applicationData.onboardingFormData || applicationData.onboarding_form_data || {}
  const formData = onboardingFormData.form_data || onboardingFormData.formData || onboardingFormData
  const finance = formData.finance || formData.financial_profile || formData.financialProfile || {}
  const bondApplication = formData.bond_application || formData.bondApplication || {}
  return {
    transaction,
    formData,
    finance,
    bondApplication,
    summary: getFinanceReadinessSummary({
      transaction,
      onboardingFormData,
      documentSummary: applicationData.documentSummary,
    }),
  }
}

export function calculateReadinessScore(applicationData = {}) {
  const { summary } = normalizeApplicationData(applicationData)
  return percent(summary.readinessScore?.score)
}

export function calculateApprovalConfidence(applicationData = {}) {
  const { summary } = normalizeApplicationData(applicationData)
  const score = percent(summary.readinessScore?.score)
  const riskPenalty = Math.min(25, (summary.riskFlags || []).length * 7)
  const missingPenalty = Math.min(20, (summary.missingItems || []).length * 4)
  const affordabilityBonus =
    summary.affordabilityEstimate?.affordabilityBand === 'Strong' ? 8 :
    summary.affordabilityEstimate?.affordabilityBand === 'Moderate' ? 2 :
    0
  const confidence = percent(score + affordabilityBonus - riskPenalty - missingPenalty)
  const label = confidence >= 82 ? 'Excellent' : confidence >= 68 ? 'Good' : confidence >= 45 ? 'Review' : 'Low'
  return {
    score: confidence,
    label,
    note: 'Based on information provided and current criteria.',
    disclaimer: 'This is not a final approval guarantee.',
  }
}

export function getReadinessBreakdown(applicationData = {}) {
  const { summary, finance, formData, bondApplication, transaction } = normalizeApplicationData(applicationData)
  const inputs = summary.inputs || {}
  const documentSummary = applicationData.documentSummary || {}
  const documentProgress =
    documentSummary.totalRequired
      ? ratioPercent(positiveNumber(documentSummary.uploadedCount) / positiveNumber(documentSummary.totalRequired))
      : ratioPercent(inputs.documentReadiness)
  const bankStatementsAvailable = hasValue(pickValue(finance, ['bank_statements_available', 'bankStatementsAvailable'])) || hasDocumentLike(applicationData, ['bank statement', 'bank_statement'])
  const payslipAvailable = hasDocumentLike(applicationData, ['payslip', 'pay slip', 'salary slip'])
  const proofOfResidenceAvailable = hasDocumentLike(applicationData, ['proof of residence', 'residence'])
  const incomeProgress = percent(
    (positiveNumber(inputs.monthlyIncome) ? 45 : 0) +
    (positiveNumber(inputs.monthlyExpenses) ? 20 : 0) +
    (hasValue(inputs.employmentType) || hasValue(pickValue(bondApplication, ['employment_type', 'employmentType'])) ? 15 : 0) +
    (payslipAvailable ? 20 : 0),
  )
  const affordabilityProgress = percent(
    (positiveNumber(inputs.monthlyIncome) ? 25 : 0) +
    (positiveNumber(inputs.monthlyExpenses) ? 25 : 0) +
    (positiveNumber(summary.affordabilityEstimate?.estimatedMonthlyRepayment) ? 25 : 0) +
    (positiveNumber(transaction.bond_amount || transaction.bondAmount || bondApplication.bond_amount || bondApplication.bondAmount) ? 25 : 0),
  )
  const depositSource = pickValue(finance, ['cash_contribution_source', 'cashContributionSource', 'deposit_source', 'depositSource']) || pickValue(formData, ['cash_contribution_source', 'cashContributionSource', 'deposit_source', 'depositSource'])
  const depositProgress = percent((positiveNumber(inputs.deposit) ? 55 : 0) + (hasValue(depositSource) ? 30 : 0) + (summary.depositStrength === 'Strong' ? 15 : summary.depositStrength === 'Moderate' ? 8 : 0))
  const consentCaptured = hasValue(pickValue(finance, ['bond_readiness_consent', 'bondReadinessConsent'])) || hasValue(pickValue(formData, ['bond_readiness_consent', 'bondReadinessConsent', 'credit_consent', 'creditConsent']))
  const complianceProgress = percent((bankStatementsAvailable ? 35 : 0) + (proofOfResidenceAvailable ? 25 : 0) + (consentCaptured ? 25 : 0) + ((summary.riskFlags || []).length ? 0 : 15))

  return [
    { key: 'documents', label: 'Documents', progress: documentProgress, tone: getProgressTone(documentProgress) },
    { key: 'income', label: 'Income', progress: incomeProgress, tone: getProgressTone(incomeProgress) },
    { key: 'affordability', label: 'Affordability', progress: affordabilityProgress, tone: getProgressTone(affordabilityProgress) },
    { key: 'deposit', label: 'Deposit', progress: depositProgress, tone: getProgressTone(depositProgress) },
    { key: 'bank_compliance', label: 'Bank Compliance', progress: complianceProgress, tone: getProgressTone(complianceProgress) },
  ]
}

export function getWatchItems(applicationData = {}) {
  const { summary, finance, formData } = normalizeApplicationData(applicationData)
  const items = []
  const add = (label, severity = 'Medium', action = 'Review') => {
    if (!items.some((item) => item.label === label)) items.push({ label, severity, action })
  }

  if (summary.missingItems?.includes('Finance documents')) add('Missing latest bank statements', 'High', 'Open documents')
  if (!hasValue(pickValue(finance, ['bank_statements_available', 'bankStatementsAvailable'])) && !hasDocumentLike(applicationData, ['bank statement', 'bank_statement'])) add('Missing latest bank statements', 'High', 'Open documents')
  const depositSource = pickValue(finance, ['cash_contribution_source', 'cashContributionSource', 'deposit_source', 'depositSource']) || pickValue(formData, ['cash_contribution_source', 'cashContributionSource', 'deposit_source', 'depositSource'])
  if (!hasValue(depositSource)) add('Deposit source not fully verified', 'Medium', 'Verify source')
  if (!hasDocumentLike(applicationData, ['proof of residence', 'residence'])) add('Proof of residence required', 'Medium', 'Request document')
  if ((summary.riskFlags || []).length || summary.affordabilityEstimate?.affordabilityBand === 'Needs Attention') add('Affordability requires review', 'High', 'Review affordability')
  ;(summary.riskFlags || []).slice(0, 2).forEach((flag) => add(flag, 'High', 'Review risk'))
  ;(summary.missingItems || []).filter((item) => item !== 'Finance documents').slice(0, 3).forEach((item) => add(`${item} required`, 'Medium', 'Complete input'))

  return items.slice(0, 6)
}

export function getNextBestActions(applicationData = {}) {
  const watchItems = getWatchItems(applicationData)
  const actions = watchItems.map((item) => ({
    label:
      item.label.toLowerCase().includes('bank statement') ? 'Upload latest bank statements' :
      item.label.toLowerCase().includes('deposit') ? 'Verify deposit source' :
      item.label.toLowerCase().includes('affordability') ? 'Confirm affordability assumptions' :
      item.label.toLowerCase().includes('residence') ? 'Request missing proof of residence' :
      item.action || `Resolve ${item.label.toLowerCase()}`,
    target: item.action,
  }))

  return actions.length ? actions.slice(0, 4) : [
    { label: 'Review readiness with consultant', target: 'Review' },
    { label: 'Prepare application for bank submission', target: 'Submit' },
  ]
}

export function getFinancialSnapshot(applicationData = {}) {
  const { summary, transaction } = normalizeApplicationData(applicationData)
  const inputs = summary.inputs || {}
  const purchasePrice = positiveNumber(transaction.purchase_price || transaction.sales_price || inputs.estimatedPurchaseRange)
  const deposit = positiveNumber(inputs.deposit || transaction.deposit_amount || transaction.cash_amount)
  const depositPercent = purchasePrice ? `${Math.round((deposit / purchasePrice) * 1000) / 10}%` : ''
  return {
    monthlyIncome: formatCurrency(inputs.monthlyIncome, 'Income not captured'),
    estimatedRepayment: summary.affordabilityEstimate?.estimatedMonthlyRepayment
      ? `${formatCurrency(summary.affordabilityEstimate.estimatedMonthlyRepayment)} at ${inputs.interestRate || 11.75}%`
      : 'Repayment pending',
    affordableAmount: summary.affordabilityEstimate?.estimatedPurchaseRangeMax
      ? formatCurrency(summary.affordabilityEstimate.estimatedPurchaseRangeMax)
      : 'Range pending',
    depositAvailable: deposit ? `${formatCurrency(deposit)}${depositPercent ? ` / ${depositPercent}` : ''}` : 'Deposit source missing',
  }
}

export function getFinanceReadiness(applicationId = '', applicationData = {}) {
  const score = calculateReadinessScore(applicationData)
  const scoreState = getScoreState(score)
  const watchItems = getWatchItems(applicationData)
  const blockers = watchItems.filter((item) => ['High', 'Medium'].includes(item.severity))
  const readyForSubmission = score >= 86 && blockers.length === 0

  return {
    applicationId,
    score,
    scoreState,
    submissionStatus: {
      ready: readyForSubmission,
      label: readyForSubmission ? 'Ready for Submission' : 'Not Ready for Submission',
      blockerCount: blockers.length,
      copy: readyForSubmission
        ? 'Application health supports bank submission.'
        : 'Complete the required items before submitting to banks.',
    },
    breakdown: getReadinessBreakdown(applicationData).map((item) => ({
      ...item,
      color: getProgressColor(item.tone),
    })),
    watchItems,
    approvalConfidence: calculateApprovalConfidence(applicationData),
    financialSnapshot: getFinancialSnapshot(applicationData),
    nextBestActions: getNextBestActions(applicationData),
    disclaimer: FINANCE_READINESS_DISCLAIMER,
  }
}

