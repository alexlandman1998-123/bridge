import {
  calculateAdditionalIncomeTotal,
  calculateAssetTotal,
  calculateLiabilityTotal,
  calculateMonthlyCommitmentTotal,
} from '../flow/bondApplicationDerivedValues.js'

function present(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0
}

function join(values = []) {
  return values.filter(present).join(' ')
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function buildBondApplicationReviewSections({
  applicationState = {},
  documentProgress = null,
  readinessIssues = [],
} = {}) {
  const primary = applicationState?.participants?.primaryApplicant || {}
  const finance = applicationState?.application?.finance || {}
  const property = applicationState?.application?.property || {}
  const employment = primary.employment || {}
  const issuesByStep = readinessIssues.reduce((accumulator, issue) => {
    const key = issue.stepKey || issue.category || 'application'
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})
  const statusFor = (key) => issuesByStep[key] ? 'needs_attention' : 'complete'

  return [
    {
      key: 'property_finance',
      title: 'Property and finance',
      stepKey: 'your_application',
      screenKey: 'application_confirmation',
      status: statusFor('your_application'),
      summary: [
        property.developmentName || property.propertyReference || 'Property confirmed',
        finance.purchasePrice ? `Purchase price ${finance.purchasePrice}` : '',
        finance.requestedBondAmount ? `Bond required ${finance.requestedBondAmount}` : '',
      ].filter(Boolean),
    },
    {
      key: 'applicant_details',
      title: 'Applicant details',
      stepKey: 'about_you',
      screenKey: 'about_you_confirmation',
      status: statusFor('about_you'),
      summary: [
        join([primary.personal?.first_name, primary.personal?.surname]) || 'Primary applicant',
        primary.contact?.email || primary.personal?.email || '',
        primary.contact?.phone || primary.personal?.phone || '',
      ].filter(Boolean),
    },
    {
      key: 'employment_income',
      title: 'Employment and income',
      stepKey: 'employment_income',
      screenKey: 'employment_type',
      status: statusFor('employment_income'),
      summary: [
        employment.occupation_status || 'Main income',
        employment.employer_name || '',
        primary.expenses?.gross_salary ? `Gross monthly income ${primary.expenses.gross_salary}` : '',
      ].filter(Boolean),
    },
    {
      key: 'additional_income',
      title: 'Additional income',
      stepKey: 'employment_income',
      screenKey: 'additional_income_gate',
      status: 'complete',
      summary: [
        countLabel((primary.incomeSources || []).length, 'income source'),
        calculateAdditionalIncomeTotal(applicationState) ? `Total ${calculateAdditionalIncomeTotal(applicationState)}` : '',
      ].filter(Boolean),
    },
    {
      key: 'monthly_commitments',
      title: 'Monthly commitments',
      stepKey: 'monthly_commitments',
      screenKey: 'monthly_commitments_summary',
      status: statusFor('monthly_commitments'),
      summary: [
        countLabel((primary.monthlyCommitments || []).length, 'commitment'),
        calculateMonthlyCommitmentTotal(applicationState) ? `Estimated total ${calculateMonthlyCommitmentTotal(applicationState)}` : '',
      ].filter(Boolean),
    },
    {
      key: 'accounts_assets',
      title: 'Accounts and assets',
      stepKey: 'accounts_assets',
      screenKey: 'bank_accounts',
      status: statusFor('accounts_assets'),
      summary: [
        countLabel((primary.bankAccounts || []).length, 'bank account'),
        countLabel((primary.debts || []).length, 'debt'),
        countLabel((primary.existingProperties || []).length, 'property', 'properties'),
        calculateAssetTotal(applicationState) ? `Assets ${calculateAssetTotal(applicationState)}` : '',
        calculateLiabilityTotal(applicationState) ? `Liabilities ${calculateLiabilityTotal(applicationState)}` : '',
      ].filter(Boolean),
    },
    {
      key: 'documents',
      title: 'Documents',
      stepKey: 'documents',
      screenKey: 'document_checklist',
      status: documentProgress?.canContinue === false ? 'needs_attention' : 'complete',
      summary: documentProgress ? [
        `${documentProgress.completedRequired} of ${documentProgress.totalRequired} required documents received`,
        documentProgress.blockingMissing?.length ? `${documentProgress.blockingMissing.length} needed before signature` : 'Ready for review',
      ] : ['Document checklist will be checked before signing.'],
    },
  ]
}
