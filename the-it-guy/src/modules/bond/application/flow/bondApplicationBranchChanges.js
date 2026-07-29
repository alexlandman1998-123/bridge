import { cloneBondApplicationValue } from '../bondApplicationState.js'
import {
  EMPLOYMENT_TYPE_VALUES,
} from './bondApplicationFlowContract.js'
import {
  getBondApplicationPathValue,
  isBondApplicationValuePresent,
} from './bondApplicationRuleEvaluator.js'

const EMPLOYMENT_BRANCH_FIELDS = {
  permanent_employee: [
    'participants.primaryApplicant.employment.employment_years',
    'participants.primaryApplicant.employment.employment_months',
  ],
  contract_employee: [
    'participants.primaryApplicant.employment.contract_start_date',
    'participants.primaryApplicant.employment.contract_end_date',
  ],
  self_employed: [
    'participants.primaryApplicant.employment.business_type',
    'participants.primaryApplicant.employment.company_registration_number',
    'participants.primaryApplicant.employment.ownership_percentage',
  ],
  commission_based: [
    'participants.primaryApplicant.expenses.basic_salary',
    'participants.primaryApplicant.expenses.average_commission',
  ],
  retired: [
    'participants.primaryApplicant.incomeSources',
  ],
  other: [
    'participants.primaryApplicant.incomeSources',
  ],
}

function canonicalEmploymentType(value) {
  return Object.entries(EMPLOYMENT_TYPE_VALUES).find(([, values]) => values.includes(value))?.[0] || value
}

function setPathValue(source, path, value) {
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return source
  let current = source
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value
      return
    }
    current[part] = current[part] && typeof current[part] === 'object' && !Array.isArray(current[part]) ? current[part] : {}
    current = current[part]
  })
  return source
}

export function getEmploymentBranchSpecificPaths(employmentType) {
  const canonical = canonicalEmploymentType(employmentType)
  if (canonical === 'permanent') return EMPLOYMENT_BRANCH_FIELDS.permanent_employee
  if (canonical === 'contract') return EMPLOYMENT_BRANCH_FIELDS.contract_employee
  if (canonical === 'selfEmployed') return EMPLOYMENT_BRANCH_FIELDS.self_employed
  if (canonical === 'commission') return EMPLOYMENT_BRANCH_FIELDS.commission_based
  if (canonical === 'retired') return EMPLOYMENT_BRANCH_FIELDS.retired
  if (canonical === 'other') return EMPLOYMENT_BRANCH_FIELDS.other
  return []
}

export function detectEmploymentBranchChange(applicationState = {}, nextEmploymentType = '') {
  const currentEmploymentType = getBondApplicationPathValue(applicationState, 'participants.primaryApplicant.employment.occupation_status')
  if (!currentEmploymentType || currentEmploymentType === nextEmploymentType) {
    return { changesBranch: false, pathsWithData: [] }
  }
  const paths = getEmploymentBranchSpecificPaths(currentEmploymentType)
  const pathsWithData = paths.filter((path) => isBondApplicationValuePresent(getBondApplicationPathValue(applicationState, path)))
  return {
    changesBranch: canonicalEmploymentType(currentEmploymentType) !== canonicalEmploymentType(nextEmploymentType),
    currentEmploymentType,
    nextEmploymentType,
    pathsWithData,
  }
}

export function applyEmploymentBranchChange(applicationState = {}, nextEmploymentType = '') {
  const next = cloneBondApplicationValue(applicationState) || {}
  const change = detectEmploymentBranchChange(next, nextEmploymentType)
  change.pathsWithData.forEach((path) => setPathValue(next, path, Array.isArray(getBondApplicationPathValue(next, path)) ? [] : null))
  setPathValue(next, 'participants.primaryApplicant.employment.occupation_status', nextEmploymentType)
  return {
    state: next,
    clearedPaths: change.pathsWithData,
  }
}
