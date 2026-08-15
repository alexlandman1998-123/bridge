import {
  BOND_APPLICATION_PREFILL_SOURCE_KEYS,
  BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
} from './bondApplicationPrefillSourceMatrix.js'

export const BOND_APPLICATION_PREFILL_COVERAGE_VERSION = 'phase-11-v1'

export const BOND_APPLICATION_PREFILL_COVERAGE_SCENARIOS = Object.freeze([
  {
    key: 'individual_buyer',
    label: 'Individual buyer',
    requiredPaths: [
      'summary.applicant_name',
      'summary.purchase_price',
      'summary.deposit_contribution',
      'summary.finance_type',
      'summary.buyer_entity_type',
      'applicants.primary.first_name',
      'applicants.primary.last_name',
      'applicants.primary.id_number',
      'contact_address.email_address',
      'contact_address.cellphone_number',
      'contact_address.residential_address_street',
      'loan_details.amount_to_be_registered',
      'income_deductions_expenses.primary.gross_salary',
    ],
    notYetCollectedPaths: [
      'loan_details.preferred_debit_order_date',
      'credit_history.bound_by_surety_agreements',
    ],
  },
  {
    key: 'joint_buyer',
    label: 'Joint buyer / co-applicant',
    requiredPaths: [
      'summary.has_co_applicant',
      'applicants.co_applicant.first_name',
      'applicants.co_applicant.last_name',
      'applicants.co_applicant.id_number',
      'applicants.co_applicant.email',
      'applicants.co_applicant.phone',
    ],
    notYetCollectedPaths: [
      'employment.co_applicant.employer_name',
      'income_deductions_expenses.co_applicant.gross_salary',
    ],
  },
  {
    key: 'company_buyer',
    label: 'Company purchaser',
    requiredPaths: [
      'summary.buyer_entity_type',
      'summary.buyer_entity_name',
      'summary.buyer_entity_registration_number',
      'banking_liabilities.primary_bank_name',
      'banking_liabilities.primary_account_number',
    ],
    notYetCollectedPaths: [
      'company.director_names',
      'company.shareholding_structure',
      'company.resolution_document',
    ],
  },
  {
    key: 'trust_buyer',
    label: 'Trust purchaser',
    requiredPaths: [
      'summary.buyer_entity_type',
      'summary.buyer_entity_name',
      'summary.buyer_entity_registration_number',
      'contact_address.email_address',
    ],
    notYetCollectedPaths: [
      'trust.trustee_names',
      'trust.letters_of_authority',
      'trust.trust_deed',
    ],
  },
  {
    key: 'returning_saved_draft',
    label: 'Returning buyer with saved draft',
    requiredPaths: [
      'summary.applicant_name',
      'summary.purchase_price',
      'loan_details.amount_to_be_registered',
      'banking_liabilities.primary_bank_name',
      'assets_liabilities.net_asset_value',
      'declarations_consents.declaration_accepted',
    ],
    notYetCollectedPaths: [],
  },
])

function sourceKeysForField(field = {}) {
  return (Array.isArray(field.sources) ? field.sources : []).map((source) => source.sourceKey).filter(Boolean)
}

function hasRuntimeSource(field = {}) {
  return sourceKeysForField(field).some((sourceKey) => sourceKey !== BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication)
}

function buildFieldIndex(matrix = []) {
  return new Map((Array.isArray(matrix) ? matrix : []).map((field) => [field.path, field]))
}

function buildSectionCoverage(matrix = []) {
  const sections = new Map()
  for (const field of Array.isArray(matrix) ? matrix : []) {
    const sectionKey = field.section || 'unknown'
    const current = sections.get(sectionKey) || {
      key: sectionKey,
      totalFields: 0,
      runtimeMappedFields: 0,
      savedOnlyFields: 0,
      requiredFields: 0,
    }
    current.totalFields += 1
    if (field.required) current.requiredFields += 1
    if (hasRuntimeSource(field)) current.runtimeMappedFields += 1
    else current.savedOnlyFields += 1
    sections.set(sectionKey, current)
  }
  return Array.from(sections.values())
}

export function buildBondApplicationPrefillCoverageAudit({
  matrix = BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
  scenarios = BOND_APPLICATION_PREFILL_COVERAGE_SCENARIOS,
} = {}) {
  const fieldIndex = buildFieldIndex(matrix)
  const scenarioAudits = (Array.isArray(scenarios) ? scenarios : []).map((scenario) => {
    const requiredPaths = Array.isArray(scenario.requiredPaths) ? scenario.requiredPaths : []
    const mappedPaths = requiredPaths.filter((path) => fieldIndex.has(path))
    const runtimeMappedPaths = mappedPaths.filter((path) => hasRuntimeSource(fieldIndex.get(path)))
    const savedOnlyPaths = mappedPaths.filter((path) => !hasRuntimeSource(fieldIndex.get(path)))
    const missingMatrixPaths = requiredPaths.filter((path) => !fieldIndex.has(path))
    const notYetCollectedPaths = Array.isArray(scenario.notYetCollectedPaths) ? scenario.notYetCollectedPaths : []

    return {
      key: scenario.key,
      label: scenario.label,
      requiredPaths,
      mappedPaths,
      runtimeMappedPaths,
      savedOnlyPaths,
      missingMatrixPaths,
      notYetCollectedPaths,
      mappedCount: mappedPaths.length,
      runtimeMappedCount: runtimeMappedPaths.length,
      requiredCount: requiredPaths.length,
      coveragePercent: requiredPaths.length ? Math.round((mappedPaths.length / requiredPaths.length) * 100) : 100,
      runtimeCoveragePercent: requiredPaths.length ? Math.round((runtimeMappedPaths.length / requiredPaths.length) * 100) : 100,
      complete: missingMatrixPaths.length === 0,
    }
  })
  const scenarioGapCount = scenarioAudits.reduce((total, scenario) => total + scenario.missingMatrixPaths.length, 0)
  const notYetCollectedCount = scenarioAudits.reduce((total, scenario) => total + scenario.notYetCollectedPaths.length, 0)

  return {
    version: BOND_APPLICATION_PREFILL_COVERAGE_VERSION,
    status: scenarioGapCount === 0 ? 'prefill_coverage_matrix_locked' : 'prefill_coverage_matrix_gaps',
    source: 'buyer_portal_prefill_source_matrix',
    scenarioAudits,
    sectionCoverage: buildSectionCoverage(matrix),
    metrics: {
      scenarioCount: scenarioAudits.length,
      scenarioGapCount,
      notYetCollectedCount,
      matrixFieldCount: Array.isArray(matrix) ? matrix.length : 0,
      runtimeMappedFieldCount: (Array.isArray(matrix) ? matrix : []).filter(hasRuntimeSource).length,
      savedOnlyFieldCount: (Array.isArray(matrix) ? matrix : []).filter((field) => !hasRuntimeSource(field)).length,
    },
    notYetCollectedPaths: Array.from(new Set(scenarioAudits.flatMap((scenario) => scenario.notYetCollectedPaths))).sort(),
  }
}
