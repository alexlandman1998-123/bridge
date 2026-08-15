import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_SECTION,
  GUIDED_BOND_APPLICATION_V2_FLOW_VERSION,
  applyEmploymentBranchChange,
  applyGuidedBondApplicationMetadata,
  buildBondApplicationState,
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
  createGuidedBondApplicationMetadataPatch,
  detectEmploymentBranchChange,
  evaluateBondApplicationRule,
  fromLegacyBondApplication,
  getPhase2GuidedBondApplicationEligibility,
  resolveBondApplicationFlow,
  shouldUseGuidedBondApplicationV2,
  toLegacyBondApplication,
  validateBondApplicationScreen,
  validateBondApplicationSteps,
} from '../index.js'
import { buildBondApplicationViewModel } from '../../utils/bondApplicationViewModel.js'
import { legacyBondApplicationFixtures } from '../__fixtures__/legacyBondApplicationFixtures.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDirectory, '../../../../..')

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function setPath(source, pathKey, value) {
  const next = cloneBondApplicationValue(source)
  const parts = pathKey.split('.')
  let current = next
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value
      return
    }
    current[part] = current[part] || {}
    current = current[part]
  })
  return next
}

function baseState() {
  const state = createEmptyBondApplicationState()
  state.application.finance.purchasePrice = '2000000'
  state.application.finance.requestedBondAmount = '1800000'
  state.application.applicantStructure = 'sole'
  state.participants.primaryApplicant.personal.first_name = 'Sample'
  state.participants.primaryApplicant.personal.surname = 'Buyer'
  state.participants.primaryApplicant.contact.email = 'buyer@example.test'
  state.participants.primaryApplicant.contact.phone = '0710000000'
  state.participants.primaryApplicant.expenses.maintenance_paid = 'no'
  state.participants.primaryApplicant.expenses.pays_rent = 'no'
  state.participants.primaryApplicant.expenses.groceries = '6000'
  state.participants.primaryApplicant.credit.has_debts = 'no'
  state.participants.primaryApplicant.credit.owns_property = 'no'
  state.participants.primaryApplicant.credit.under_debt_review = 'no'
  state.participants.primaryApplicant.credit.has_judgment = 'no'
  state.participants.primaryApplicant.credit.has_arrears = 'no'
  state.participants.primaryApplicant.credit.declared_insolvent = 'no'
  state.participants.primaryApplicant.bankAccounts = [{
    legacyKey: 'primary',
    bankName: 'Sample Bank',
    accountType: 'Cheque',
  }]
  return state
}

function completeEmploymentState(type) {
  let state = baseState()
  state = setPath(state, 'participants.primaryApplicant.employment.occupation_status', type)
  if (type === 'permanent_employee') {
    state = setPath(state, 'participants.primaryApplicant.employment.employer_name', 'Sample Employer')
    state = setPath(state, 'participants.primaryApplicant.employment.nature_of_occupation', 'Analyst')
    state = setPath(state, 'participants.primaryApplicant.employment.employment_years', '2')
    state = setPath(state, 'participants.primaryApplicant.employment.works_in_south_africa', 'yes')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '55000')
    state = setPath(state, 'participants.primaryApplicant.employment.has_additional_income', 'no')
  }
  if (type === 'contract_employee') {
    state = setPath(state, 'participants.primaryApplicant.employment.employer_name', 'Contract Co')
    state = setPath(state, 'participants.primaryApplicant.employment.nature_of_occupation', 'Consultant')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '70000')
    state = setPath(state, 'participants.primaryApplicant.employment.contract_start_date', '2025-01-01')
    state = setPath(state, 'participants.primaryApplicant.employment.contract_end_date', '2027-01-01')
    state = setPath(state, 'participants.primaryApplicant.employment.works_in_south_africa', 'yes')
    state = setPath(state, 'participants.primaryApplicant.employment.has_additional_income', 'no')
  }
  if (type === 'self_employed') {
    state = setPath(state, 'participants.primaryApplicant.employment.employer_name', 'Sample Trading')
    state = setPath(state, 'participants.primaryApplicant.employment.business_type', 'Private company')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '85000')
    state = setPath(state, 'participants.primaryApplicant.employment.ownership_percentage', '100')
    state = setPath(state, 'participants.primaryApplicant.employment.financials_older_than_6_months', 'no')
    state = setPath(state, 'participants.primaryApplicant.employment.has_additional_income', 'no')
  }
  if (type === 'commission_based') {
    state = setPath(state, 'participants.primaryApplicant.employment.employer_name', 'Sales House')
    state = setPath(state, 'participants.primaryApplicant.employment.nature_of_occupation', 'Sales executive')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '60000')
    state = setPath(state, 'participants.primaryApplicant.expenses.average_commission', '25000')
    state = setPath(state, 'participants.primaryApplicant.employment.employment_years', '3')
    state = setPath(state, 'participants.primaryApplicant.employment.works_in_south_africa', 'yes')
    state = setPath(state, 'participants.primaryApplicant.employment.has_additional_income', 'no')
  }
  if (type === 'retired' || type === 'other') {
    state = setPath(state, 'participants.primaryApplicant.incomeSources', [{
      id: `${type}_income`,
      source: 'guided',
      type: type === 'retired' ? 'pension' : 'other',
      sourceName: 'Sample source',
      monthlyAmount: '40000',
    }])
  }
  return state
}

function runRuleEvaluatorTests() {
  const state = {
    person: {
      active: false,
      count: 0,
      name: '',
      items: [{ id: 1 }],
      incomeSources: [{ type: 'rental_income' }],
      income: '1200',
      status: null,
    },
  }
  assert.equal(evaluateBondApplicationRule({ field: 'person.active', equals: false }, state), true)
  assert.equal(evaluateBondApplicationRule({ field: 'person.count', equals: 0 }, state), true)
  assert.equal(evaluateBondApplicationRule({ field: 'person.count', exists: true }, state), true)
  assert.equal(evaluateBondApplicationRule({ field: 'person.name', exists: true }, state), false)
  assert.equal(evaluateBondApplicationRule({ field: 'person.status', notExists: true }, state), true)
  assert.equal(evaluateBondApplicationRule({ field: 'person.income', greaterThan: 1000 }, state), true)
  assert.equal(evaluateBondApplicationRule({ field: 'person.items', collectionCountAtLeast: 1 }, state), true)
  assert.equal(evaluateBondApplicationRule({ field: 'person.incomeSources', collectionContains: { field: 'type', equals: 'rental_income' } }, state), true)
  assert.equal(evaluateBondApplicationRule({ field: 'person.incomeSources', collectionContains: { field: 'type', in: ['trust_income'] } }, state), false)
  assert.equal(evaluateBondApplicationRule({ all: [{ field: 'person.count', equals: 0 }, { not: { field: 'person.active', equals: true } }] }, state), true)
  assert.equal(evaluateBondApplicationRule({ any: [{ field: 'missing', exists: true }, { field: 'person.active', falsy: true }] }, state), true)
}

function runEligibilityTests() {
  assert.equal(
    getPhase2GuidedBondApplicationEligibility(completeEmploymentState('self_employed'), {
      featureFlags: { guidedBondApplicationV2: true },
      activeBondApplicationTab: 'application',
    }).eligible,
    true,
  )
  assert.equal(
    shouldUseGuidedBondApplicationV2({
      featureFlags: { guidedBondApplicationV2: true },
      applicationState: buildBondApplicationState(legacyBondApplicationFixtures.jointApplication.portal),
      activeBondApplicationTab: 'application',
    }).reason,
    'joint_application',
  )
}

function runFlowBranchTests() {
  const branches = [
    ['permanent_employee', 'employment_details'],
    ['contract_employee', 'contract_details'],
    ['self_employed', 'self_employed_details'],
    ['commission_based', 'employment_details'],
    ['retired', 'retirement_income'],
    ['other', 'other_income'],
  ]
  branches.forEach(([type, expectedScreen]) => {
    const state = completeEmploymentState(type)
    const flow = resolveBondApplicationFlow({ applicationState: state, currentScreenKey: 'employment_type' })
    assert.ok(flow.screens.some((screen) => screen.key === expectedScreen), `${type} should show ${expectedScreen}`)
    assert.equal(flow.screens.some((screen) => screen.key === 'document_checklist'), true)
    assert.equal(flow.progress.percent < 100, true)
  })
}

function runValidationAndProgressTests() {
  const missingDebt = setPath(completeEmploymentState('permanent_employee'), 'participants.primaryApplicant.credit.has_debts', 'yes')
  const validation = validateBondApplicationScreen({
    applicationState: missingDebt,
    screenKey: 'debts',
  })
  assert.equal(validation.valid, false)
  assert.ok(validation.issues.some((item) => item.path === 'participants.primaryApplicant.debts'))

  const complete = completeEmploymentState('permanent_employee')
  const allSteps = validateBondApplicationSteps({ applicationState: complete, throughStepOrder: 6 })
  assert.equal(allSteps.valid, true)
  const flow = resolveBondApplicationFlow({ applicationState: complete, currentScreenKey: 'document_checklist' })
  assert.equal(flow.progress.percent <= 75, true)
}

function runBranchChangeTests() {
  let state = completeEmploymentState('self_employed')
  state = setPath(state, 'participants.primaryApplicant.employment.company_registration_number', '2026/000001/07')
  const change = detectEmploymentBranchChange(state, 'permanent_employee')
  assert.equal(change.changesBranch, true)
  assert.ok(change.pathsWithData.includes('participants.primaryApplicant.employment.company_registration_number'))
  const applied = applyEmploymentBranchChange(state, 'permanent_employee')
  assert.equal(applied.state.participants.primaryApplicant.employment.company_registration_number, null)
  assert.equal(applied.state.participants.primaryApplicant.personal.first_name, 'Sample')
}

function runAdapterRepeatableTests() {
  const state = completeEmploymentState('permanent_employee')
  state.participants.primaryApplicant.incomeSources = [{
    id: 'guided_income_1',
    source: 'guided',
    type: 'rental_income',
    sourceName: 'Rental',
    monthlyAmount: '12000',
  }]
  state.participants.primaryApplicant.debts = [{
    id: 'guided_debt_1',
    source: 'guided',
    type: 'vehicle_finance',
    bank: 'Vehicle Bank',
    outstandingBalance: '150000',
    monthlyInstalment: '4500',
  }]
  state.participants.primaryApplicant.assets = [{
    id: 'guided_asset_1',
    source: 'guided',
    type: 'vehicle',
    description: 'Vehicle',
    value: '300000',
  }]
  state.participants.primaryApplicant.existingProperties = [{
    id: 'guided_property_1',
    source: 'guided',
    address: '1 Sample Road',
    estimatedValue: '1600000',
  }]
  const legacy = toLegacyBondApplication(state)
  assert.equal(legacy._guided_repeatables.income_sources[0].monthlyAmount, '12000')
  assert.equal(legacy._guided_repeatables.debts[0].monthlyInstalment, '4500')
  assert.equal(legacy._guided_repeatables.existing_properties[0].address, '1 Sample Road')
  assert.equal(legacy.status ?? null, null)
  assert.equal(legacy.submitted_at ?? null, null)

  const roundTripped = fromLegacyBondApplication(legacy)
  assert.equal(roundTripped.participants.primaryApplicant.incomeSources[0].sourceName, 'Rental')
  assert.equal(roundTripped.participants.primaryApplicant.debts.some((item) => item.id === 'guided_debt_1'), true)
  const viewModel = buildBondApplicationViewModel(legacy)
  assert.equal(Boolean(viewModel.applicant), true)
  assert.equal(Boolean(viewModel.financials), true)
}

function runMetadataAndSourceTests() {
  const legacy = cloneBondApplicationValue(legacyBondApplicationFixtures.solePermanentEmployee.sources.existingBondApplication)
  const metadata = createGuidedBondApplicationMetadataPatch({
    currentScreenKey: 'document_checklist',
    completedScreenKeys: ['credit_history'],
    handoffReason: 'phase_3_documents',
    handoffAt: '2026-07-28T12:00:00.000Z',
    now: '2026-07-28T12:00:00.000Z',
  })
  const withMetadata = applyGuidedBondApplicationMetadata(legacy, metadata)
  const roundTripped = toLegacyBondApplication(fromLegacyBondApplication(withMetadata))
  assert.equal(roundTripped._meta.guided_bond_application_v2.flow_version, GUIDED_BOND_APPLICATION_V2_FLOW_VERSION)
  assert.equal(roundTripped._meta.guided_bond_application_v2.legacy_handoff_reason, 'phase_3_documents')
  assert.equal(GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_SECTION, 'documents')

  const guidedSource = readFile('src/modules/bond/application/guided/GuidedBondApplication.jsx')
  const controllerSource = readFile('src/modules/bond/application/guided/hooks/useGuidedBondApplication.js')
  assert.equal(guidedSource.includes('ensureTransactionRequiredDocuments'), false)
  assert.equal(controllerSource.includes('transaction_bond_applications'), false)
  assert.ok(controllerSource.includes('GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_SECTION'))
}

runRuleEvaluatorTests()
runEligibilityTests()
runFlowBranchTests()
runValidationAndProgressTests()
runBranchChangeTests()
runAdapterRepeatableTests()
runMetadataAndSourceTests()

console.log('Phase 3 guided conditional sole-applicant flow tests passed')
