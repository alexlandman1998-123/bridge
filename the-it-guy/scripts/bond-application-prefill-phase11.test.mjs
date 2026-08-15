import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  BOND_APPLICATION_PREFILL_COVERAGE_VERSION,
  BOND_APPLICATION_PREFILL_SOURCE_KEYS,
  buildBondApplicationPrefillCoverageAudit,
  buildBondApplicationPrefillDraft,
  getBondApplicationPrefillSourceForPath,
} from '../src/modules/bond/application/index.js'

const root = process.cwd()

function makePortal({ formData = {}, transaction = {}, buyer = {}, unit = {} } = {}) {
  return {
    buyer: {
      name: 'Fallback Buyer',
      email: 'fallback@example.com',
      phone: '0820000000',
      ...buyer,
    },
    onboardingFormData: {
      formData,
    },
    transaction: {
      finance_type: 'bond',
      purchase_price: 1_750_000,
      sales_price: 1_750_000,
      bond_amount: 1_400_000,
      deposit_amount: 350_000,
      purchaser_type: 'individual',
      property_address_line_1: '12 Agent Street',
      suburb: 'Agent Suburb',
      ...transaction,
    },
    unit: {
      unit_number: 'A-101',
      price: 1_800_000,
      development: {
        name: 'Matrix Gardens',
      },
      ...unit,
    },
  }
}

function getApplicant(application, key) {
  return application.applicants.find((applicant) => applicant.key === key)
}

function sourceKey(metadata, path) {
  return getBondApplicationPrefillSourceForPath(metadata, path)?.sourceKey || ''
}

function runExpandedBuyerOnboardingChecks() {
  const { application, metadata } = buildBondApplicationPrefillDraft(makePortal({
    formData: {
      first_name: 'Lerato',
      last_name: 'Mokoena',
      email: 'lerato@example.com',
      phone: '0832222222',
      identity_number: '9001015009087',
      spouse_full_name: 'Thabo Mokoena',
      spouse_identity_number: '9101015009088',
      spouse_email: 'thabo@example.com',
      spouse_phone: '0843333333',
      employment_status: 'permanent',
      occupation: 'Software Engineer',
      employer_name: 'Buyer Employer',
      employment_years: '4',
      employment_months: '6',
      gross_monthly_income: '65000',
      rental_income: '8500',
      other_income: '1500',
      monthly_rent: '12000',
      utilities: '1800',
      groceries: '6500',
      transport: '3200',
      bank_name: 'FNB',
      bank_account_type: 'cheque',
      bank_account_number: '62000000000',
      preferred_debit_order_date: '2026-09-01',
      currently_under_administration: 'no',
      currently_under_debt_review: 'no',
      ever_declared_insolvent: 'no',
      bound_by_surety_agreements: 'no',
      fixed_property: '900000',
      vehicle_value: '220000',
      investments: '150000',
      total_assets: '1270000',
      total_liabilities: '200000',
      net_worth: '1070000',
    },
  }))
  const coApplicant = getApplicant(application, 'co_applicant')

  assert.equal(coApplicant.first_name, 'Thabo')
  assert.equal(coApplicant.last_name, 'Mokoena')
  assert.equal(application.employment.primary.occupation_status, 'permanent')
  assert.equal(application.employment.primary.nature_of_occupation, 'Software Engineer')
  assert.equal(application.employment.primary.employment_years, '4')
  assert.equal(application.employment.primary.employment_months, '6')
  assert.equal(application.income_deductions_expenses.primary.rental_income, '8500')
  assert.equal(application.income_deductions_expenses.primary.other_income_value, '1500')
  assert.equal(application.income_deductions_expenses.primary.rental_expense, '12000')
  assert.equal(application.income_deductions_expenses.primary.water_electricity, '1800')
  assert.equal(application.income_deductions_expenses.primary.groceries, '6500')
  assert.equal(application.income_deductions_expenses.primary.transport, '3200')
  assert.equal(application.loan_details.debit_order_bank_name, 'FNB')
  assert.equal(application.loan_details.debit_order_account_number, '62000000000')
  assert.equal(application.loan_details.preferred_debit_order_date, '2026-09-01')
  assert.equal(application.banking_liabilities.primary_bank_name, 'FNB')
  assert.equal(application.banking_liabilities.primary_account_type, 'cheque')
  assert.equal(application.banking_liabilities.primary_account_number, '62000000000')
  assert.equal(application.credit_history.currently_under_debt_review, 'no')
  assert.equal(application.credit_history.bound_by_surety_agreements, 'no')
  assert.equal(application.assets_liabilities.vehicles, '220000')
  assert.equal(application.assets_liabilities.total_assets, '1270000')
  assert.equal(application.assets_liabilities.total_liabilities, '200000')
  assert.equal(application.assets_liabilities.net_asset_value, '1070000')
  assert.equal(sourceKey(metadata, 'banking_liabilities.primary_account_number'), BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding)
  assert.equal(sourceKey(metadata, 'credit_history.bound_by_surety_agreements'), BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding)
  assert.equal(sourceKey(metadata, 'applicants.co_applicant.last_name'), BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding)
}

function runEntityScenarioChecks() {
  const company = buildBondApplicationPrefillDraft(makePortal({
    transaction: {
      buyer_entity_type: 'company',
      buyer_entity_name: 'Agent Holdings (Pty) Ltd',
      buyer_entity_registration_number: '2026/123456/07',
    },
  }))
  assert.equal(company.application.summary.buyer_entity_type, 'company')
  assert.equal(company.application.summary.buyer_entity_name, 'Agent Holdings (Pty) Ltd')
  assert.equal(company.application.summary.buyer_entity_registration_number, '2026/123456/07')

  const trust = buildBondApplicationPrefillDraft(makePortal({
    transaction: {
      buyer_entity_type: 'trust',
      trust_name: 'Mokoena Family Trust',
      trust_registration_number: 'IT1234/2026',
    },
  }))
  assert.equal(trust.application.summary.buyer_entity_type, 'trust')
  assert.equal(trust.application.summary.buyer_entity_name, 'Mokoena Family Trust')
  assert.equal(trust.application.summary.buyer_entity_registration_number, 'IT1234/2026')
}

function runSavedDraftPriorityChecks() {
  const { application, metadata } = buildBondApplicationPrefillDraft(makePortal({
    formData: {
      bank_name: 'FNB',
      bank_account_number: '62000000000',
      bond_application: {
        banking_liabilities: {
          primary_bank_name: 'Saved Bank',
          primary_account_number: '1111111111',
        },
      },
    },
  }))

  assert.equal(application.banking_liabilities.primary_bank_name, 'Saved Bank')
  assert.equal(application.banking_liabilities.primary_account_number, '1111111111')
  assert.equal(sourceKey(metadata, 'banking_liabilities.primary_bank_name'), BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication)
}

function runCoverageAuditChecks() {
  const audit = buildBondApplicationPrefillCoverageAudit()

  assert.equal(audit.version, BOND_APPLICATION_PREFILL_COVERAGE_VERSION)
  assert.equal(audit.status, 'prefill_coverage_matrix_locked')
  assert.equal(audit.metrics.scenarioCount, 5)
  assert.equal(audit.metrics.scenarioGapCount, 0)
  assert.equal(audit.metrics.notYetCollectedCount > 0, true)
  assert.equal(audit.notYetCollectedPaths.includes('trust.trust_deed'), true)
  assert.equal(audit.notYetCollectedPaths.includes('company.director_names'), true)
  assert.equal(audit.scenarioAudits.every((scenario) => scenario.complete), true)
  assert.equal(audit.sectionCoverage.some((section) => section.key === 'banking_liabilities' && section.runtimeMappedFields >= 3), true)
  assert.equal(audit.sectionCoverage.some((section) => section.key === 'credit_history' && section.runtimeMappedFields >= 4), true)
}

async function runStaticChecks() {
  const [matrixSource, builderSource, legacyDraftSource, coverageSource, indexSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillSourceMatrix.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillBuilder.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/legacy/buildLegacyBondApplicationDraft.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillCoverageAudit.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/index.js'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-11-prefill-coverage-closeout.md'), 'utf8'),
  ])

  assert.match(matrixSource, /banking_liabilities\.primary_account_number/)
  assert.match(matrixSource, /credit_history\.bound_by_surety_agreements/)
  assert.match(matrixSource, /assets_liabilities\.total_liabilities/)
  assert.match(matrixSource, /formData\.spouse_full_name\.last/)
  assert.match(builderSource, /formData\.spouse_full_name\.last/)
  assert.match(legacyDraftSource, /spouseSurnameFromFullName/)
  assert.match(coverageSource, /BOND_APPLICATION_PREFILL_COVERAGE_SCENARIOS/)
  assert.match(coverageSource, /notYetCollectedPaths/)
  assert.match(indexSource, /buildBondApplicationPrefillCoverageAudit/)
  assert.match(docSource, /Prefill Coverage Closeout/)
  assert.match(docSource, /company_buyer/)
  assert.match(docSource, /not-yet-collected/)
}

runExpandedBuyerOnboardingChecks()
runEntityScenarioChecks()
runSavedDraftPriorityChecks()
runCoverageAuditChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 11 checks passed.')
