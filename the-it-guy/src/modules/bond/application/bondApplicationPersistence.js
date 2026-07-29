import { buildFinanceReadinessPayload } from '../../../core/finance/financeReadinessSelectors.js'
import { cloneBondApplicationValue } from './bondApplicationState.js'

export function mergeBondApplicationIntoFormData(existingFormData = {}, legacyBondApplication = {}) {
  return {
    ...(cloneBondApplicationValue(existingFormData) || {}),
    bond_application: cloneBondApplicationValue(legacyBondApplication) || {},
  }
}

export function buildLegacyBondApplicationPersistencePayload({
  existingFormData = {},
  legacyBondApplication,
  submitted = false,
  timestamp = new Date().toISOString(),
} = {}) {
  const nextStatus = submitted
    ? 'Submitted'
    : legacyBondApplication?.status === 'Not Started' || !legacyBondApplication?.status
      ? 'In Progress'
      : legacyBondApplication.status

  const draftToPersist = {
    ...(cloneBondApplicationValue(legacyBondApplication) || {}),
    status: nextStatus,
    submitted_at: submitted ? timestamp : legacyBondApplication?.submitted_at || '',
  }

  const nextFormData = mergeBondApplicationIntoFormData(existingFormData, draftToPersist)
  const primaryIncomeExpenses = draftToPersist?.income_deductions_expenses?.primary || {}
  const primaryEmployment = draftToPersist?.employment?.primary || {}
  nextFormData.finance_readiness = buildFinanceReadinessPayload({
    monthlyIncome: primaryIncomeExpenses.gross_salary || draftToPersist?.income?.salary || nextFormData.gross_monthly_income,
    monthlyDebt:
      primaryIncomeExpenses.total_monthly_debt ||
      primaryIncomeExpenses.total_debt_repayments ||
      draftToPersist?.banking_liabilities?.other_finance_1_monthly_payment,
    monthlyExpenses: primaryIncomeExpenses.total_monthly_expenses || primaryIncomeExpenses.living_expenses,
    deposit: draftToPersist?.summary?.deposit_amount || draftToPersist?.summary?.cash_contribution || nextFormData.deposit_amount,
    employmentType: primaryEmployment.occupation_status || primaryEmployment.employment_type,
    employmentDurationMonths:
      (Number(primaryEmployment.employment_years || 0) * 12) + Number(primaryEmployment.employment_months || 0),
    dependants: draftToPersist?.personal_details?.primary?.dependants || nextFormData.dependants,
    estimatedPurchaseRange: draftToPersist?.summary?.purchase_price || nextFormData.purchase_price,
    documentReadiness: submitted ? 1 : 0.5,
    onboardingCompleteness: submitted ? 1 : 0.65,
  }, nextFormData).finance_readiness

  return {
    draftToPersist,
    formData: nextFormData,
  }
}
