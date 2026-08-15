import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BOND_APPLICATION_DOCUMENT_RULES,
  BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
  BOND_APPLICATION_DOCUMENT_TIMING,
  GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_REASON,
  GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_SECTION,
  GUIDED_BOND_APPLICATION_V2_FLOW_VERSION,
  applyGuidedBondApplicationMetadata,
  buildBondApplicationDocumentChecklist,
  buildBondApplicationDocumentReconciliationPlan,
  calculateBondApplicationDocumentProgress,
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
  createGuidedBondApplicationMetadataPatch,
  fromLegacyBondApplication,
  resolveBondApplicationDocumentRequirements,
  toLegacyBondApplication,
  validateBondApplicationDocumentRuleContract,
} from '../index.js'
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
  state.application.transactionId = 'transaction-1'
  state.application.finance.purchasePrice = '2000000'
  state.application.finance.depositAmount = '150000'
  state.application.finance.requestedBondAmount = '1850000'
  state.application.applicantStructure = 'sole'
  state.participants.primaryApplicant.personal.first_name = 'Sample'
  state.participants.primaryApplicant.personal.surname = 'Buyer'
  state.participants.primaryApplicant.contact.email = 'buyer@example.test'
  state.participants.primaryApplicant.contact.phone = '0710000000'
  state.participants.primaryApplicant.credit.has_debts = 'no'
  state.participants.primaryApplicant.credit.owns_property = 'no'
  state.participants.primaryApplicant.credit.under_debt_review = 'no'
  state.participants.primaryApplicant.credit.has_judgment = 'no'
  state.participants.primaryApplicant.credit.has_arrears = 'no'
  state.participants.primaryApplicant.credit.declared_insolvent = 'no'
  return state
}

function employmentState(type) {
  let state = baseState()
  state = setPath(state, 'participants.primaryApplicant.employment.occupation_status', type)
  state = setPath(state, 'participants.primaryApplicant.employment.has_additional_income', 'no')
  if (type === 'permanent_employee') {
    state = setPath(state, 'participants.primaryApplicant.employment.employer_name', 'Employer')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '55000')
  }
  if (type === 'contract_employee') {
    state = setPath(state, 'participants.primaryApplicant.employment.employer_name', 'Contract Co')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '70000')
  }
  if (type === 'self_employed') {
    state = setPath(state, 'participants.primaryApplicant.employment.employer_name', 'Business')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '85000')
    state = setPath(state, 'participants.primaryApplicant.employment.financials_older_than_6_months', 'no')
  }
  if (type === 'commission_based') {
    state = setPath(state, 'participants.primaryApplicant.expenses.average_commission', '25000')
  }
  if (type === 'retired' || type === 'other') {
    state = setPath(state, 'participants.primaryApplicant.incomeSources', [{
      id: `${type}_income`,
      type: type === 'retired' ? 'pension' : 'other',
      sourceName: 'Income source',
      monthlyAmount: '40000',
    }])
  }
  return state
}

function withIncomeSources(type, incomeSources = []) {
  return setPath(employmentState(type), 'participants.primaryApplicant.incomeSources', incomeSources)
}

function runContractTests() {
  const validation = validateBondApplicationDocumentRuleContract(BOND_APPLICATION_DOCUMENT_RULES)
  assert.equal(validation.valid, true)
  assert.equal(new Set(BOND_APPLICATION_DOCUMENT_RULES.map((rule) => rule.key)).size, BOND_APPLICATION_DOCUMENT_RULES.length)
  assert.equal(BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION, 'phase-4-v1')
}

function runResolutionTests() {
  const permanent = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('permanent_employee') })
  assert.ok(permanent.activeRequirements.some((item) => item.key === 'bond_application_offer_to_purchase'))
  assert.ok(permanent.activeRequirements.some((item) => item.key === 'bond_application_salary_income_evidence'))
  assert.ok(permanent.activeRequirements.some((item) => item.key === 'bond_application_deposit_proof'))
  const permanentBankStatements = permanent.activeRequirements.find((item) => item.key === 'bond_application_primary_applicant_bank_statements')
  assert.equal(permanentBankStatements?.title, 'Latest 3 months bank statements')
  const permanentIncomeEvidence = permanent.activeRequirements.find((item) => item.key === 'bond_application_salary_income_evidence')
  assert.equal(permanentIncomeEvidence?.title, 'Latest payslip / salary income evidence')

  const noDeposit = setPath(employmentState('permanent_employee'), 'application.finance.depositAmount', '0')
  const noDepositResolution = resolveBondApplicationDocumentRequirements({ applicationState: noDeposit })
  assert.equal(noDepositResolution.activeRequirements.some((item) => item.key === 'bond_application_deposit_proof'), false)
  assert.equal(noDepositResolution.activeRequirements.some((item) => item.key === 'bond_application_offer_to_purchase'), true)

  let marriedAncState = employmentState('permanent_employee')
  marriedAncState = setPath(marriedAncState, 'participants.primaryApplicant.personal.marital_status', 'married')
  marriedAncState = setPath(marriedAncState, 'participants.primaryApplicant.marital.regime', 'out_of_community')
  const marriedAnc = resolveBondApplicationDocumentRequirements({ applicationState: marriedAncState })
  assert.ok(marriedAnc.activeRequirements.some((item) => item.key === 'bond_application_primary_applicant_marriage_certificate'))
  assert.ok(marriedAnc.activeRequirements.some((item) => item.key === 'bond_application_primary_applicant_antenuptial_contract'))

  const branches = [
    ['contract_employee', 'bond_application_employment_contract'],
    ['self_employed', 'bond_application_business_registration'],
    ['commission_based', 'bond_application_commission_income_evidence'],
    ['retired', 'bond_application_retirement_income_evidence'],
    ['other', 'bond_application_other_income_evidence'],
  ]
  branches.forEach(([type, expectedKey]) => {
    const resolved = resolveBondApplicationDocumentRequirements({ applicationState: employmentState(type) })
    assert.ok(resolved.activeRequirements.some((item) => item.key === expectedKey), `${type} should require ${expectedKey}`)
  })
  const selfEmployed = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('self_employed') })
  assert.equal(
    selfEmployed.activeRequirements.some((item) => item.key === 'bond_application_primary_applicant_bank_statements'),
    false,
  )
  const selfEmployedPersonalBankStatements = selfEmployed.activeRequirements.find((item) => item.key === 'bond_application_primary_applicant_self_employed_personal_bank_statements')
  const selfEmployedBusinessBankStatements = selfEmployed.activeRequirements.find((item) => item.key === 'bond_application_primary_applicant_self_employed_business_bank_statements')
  assert.equal(selfEmployedPersonalBankStatements?.title, 'Latest 6 months personal bank statements')
  assert.equal(selfEmployedPersonalBankStatements?.evidencePeriodMonths, 6)
  assert.equal(selfEmployedPersonalBankStatements?.allowMultipleFiles, true)
  assert.equal(selfEmployedBusinessBankStatements?.title, 'Latest 6 months business bank statements')
  assert.equal(selfEmployedBusinessBankStatements?.evidencePeriodMonths, 6)
  assert.equal(selfEmployedBusinessBankStatements?.allowMultipleFiles, true)
  assert.ok(selfEmployed.activeRequirements.some((item) => item.key === 'bond_application_self_employed_accountant_letter'))
  assert.ok(selfEmployed.activeRequirements.some((item) => item.key === 'bond_application_self_employed_financials'))
  assert.ok(selfEmployed.activeRequirements.some((item) => item.key === 'bond_application_self_employed_tax_documents'))
  assert.ok(selfEmployed.activeRequirements.some((item) => item.key === 'bond_application_self_employed_assets_liabilities_statement'))
  assert.equal(selfEmployed.activeRequirements.some((item) => item.key === 'bond_application_self_employed_management_accounts'), false)
  const oldFinancials = setPath(employmentState('self_employed'), 'participants.primaryApplicant.employment.financials_older_than_6_months', 'yes')
  const oldFinancialsResolution = resolveBondApplicationDocumentRequirements({ applicationState: oldFinancials })
  assert.ok(oldFinancialsResolution.activeRequirements.some((item) => item.key === 'bond_application_self_employed_management_accounts'))

  const individualPurchaser = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('permanent_employee') })
  assert.equal(individualPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_company_registration'), false)
  assert.equal(individualPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_trust_deed'), false)

  const companyPurchaser = resolveBondApplicationDocumentRequirements({
    applicationState: setPath(employmentState('permanent_employee'), 'application.buyerEntity.entityType', 'company'),
  })
  assert.ok(companyPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_company_registration'))
  assert.ok(companyPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_company_director_ids'))
  assert.ok(companyPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_company_resolution'))
  assert.ok(companyPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_company_financials'))
  assert.ok(companyPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_company_tax_documents'))
  assert.ok(companyPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_company_beneficial_ownership'))
  assert.equal(companyPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_trust_deed'), false)

  const trustPurchaser = resolveBondApplicationDocumentRequirements({
    applicationState: setPath(employmentState('permanent_employee'), 'application.buyerEntity.entityType', 'trust'),
  })
  assert.ok(trustPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_trust_deed'))
  assert.ok(trustPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_letters_of_authority'))
  assert.ok(trustPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_trustee_ids'))
  assert.ok(trustPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_trust_resolution'))
  assert.ok(trustPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_trust_beneficial_ownership'))
  assert.equal(trustPurchaser.activeRequirements.some((item) => item.key === 'bond_application_buyer_company_registration'), false)

  let propertyState = employmentState('permanent_employee')
  propertyState = setPath(propertyState, 'participants.primaryApplicant.credit.owns_property', 'yes')
  assert.ok(resolveBondApplicationDocumentRequirements({ applicationState: propertyState }).activeRequirements.some((item) => item.key === 'bond_application_existing_property_bond_statement'))

  let creditState = employmentState('permanent_employee')
  creditState = setPath(creditState, 'participants.primaryApplicant.credit.has_judgment', 'yes')
  assert.ok(resolveBondApplicationDocumentRequirements({ applicationState: creditState }).activeRequirements.some((item) => item.key === 'bond_application_credit_history_support'))

  const commission = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('commission_based') })
  const commissionEvidence = commission.activeRequirements.find((item) => item.key === 'bond_application_commission_income_evidence')
  assert.equal(commissionEvidence?.title, 'Latest 6 months commission income evidence')
  assert.equal(commissionEvidence?.evidencePeriodMonths, 6)
  assert.equal(commissionEvidence?.allowMultipleFiles, true)

  const contract = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('contract_employee') })
  assert.equal(contract.activeRequirements.find((item) => item.key === 'bond_application_employment_contract')?.title, 'Signed employment contract')
  assert.ok(contract.activeRequirements.some((item) => item.key === 'bond_application_contract_income_history'))

  const retired = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('retired') })
  assert.equal(retired.activeRequirements.find((item) => item.key === 'bond_application_retirement_income_evidence')?.title, 'Pension / annuity income evidence')

  const incomeVariationCases = [
    ['rental_income', 'bond_application_rental_income_evidence'],
    ['maintenance_received', 'bond_application_maintenance_income_evidence'],
    ['investment_income', 'bond_application_investment_income_evidence'],
    ['trust_income', 'bond_application_trust_income_evidence'],
    ['pension', 'bond_application_additional_pension_income_evidence'],
    ['part_time_income', 'bond_application_other_income_evidence'],
  ]
  incomeVariationCases.forEach(([incomeType, expectedKey]) => {
    const state = withIncomeSources('permanent_employee', [{
      id: `${incomeType}_1`,
      type: incomeType,
      sourceName: 'Additional income',
      monthlyAmount: '5000',
    }])
    const resolved = resolveBondApplicationDocumentRequirements({ applicationState: state })
    assert.ok(resolved.activeRequirements.some((item) => item.key === expectedKey), `${incomeType} should require ${expectedKey}`)
  })
}

function runChecklistAndMatchingTests() {
  const resolved = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('permanent_employee') })
  const identityRequirement = resolved.activeRequirements.find((item) => item.key === 'bond_application_primary_applicant_identity')
  const existingRequiredDocuments = [{
    id: 'req-1',
    document_key: identityRequirement.key,
    document_label: identityRequirement.title,
    is_required: true,
    uploaded_document_id: 'doc-linked',
    status: 'uploaded',
    required_from_role: 'client',
    visibility_scope: 'client',
  }, {
    id: 'manual-1',
    document_key: 'manual_originator_request',
    document_label: 'Manual originator request',
    is_required: true,
    status: 'missing',
    required_from_role: 'client',
    visibility_scope: 'client',
  }]
  const documents = [{
    id: 'doc-linked',
    name: 'Identity.pdf',
    document_type: 'id_document',
    uploaded_by_role: 'client',
    uploaded_by_party: 'buyer',
    status: 'uploaded',
  }, {
    id: 'seller-doc',
    name: 'Seller ID.pdf',
    document_type: 'id_document',
    uploaded_by_role: 'seller',
    uploaded_by_party: 'seller',
    status: 'uploaded',
  }]
  const checklist = buildBondApplicationDocumentChecklist({
    activeRequirements: resolved.activeRequirements,
    existingRequiredDocuments,
    existingDocuments: documents,
  })
  const identity = checklist.items.find((item) => item.requirement.key === identityRequirement.key)
  assert.equal(identity.status, 'satisfied')
  assert.equal(identity.documents.some((document) => document.id === 'seller-doc'), false)
  assert.ok(checklist.items.some((item) => item.requirement.key === 'manual_originator_request'))

  const selfEmployedResolved = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('self_employed') })
  const selfEmployedBankStatements = selfEmployedResolved.activeRequirements.find((item) => item.key === 'bond_application_primary_applicant_self_employed_personal_bank_statements')
  const monthlyStatementDocuments = Array.from({ length: 6 }, (_, index) => ({
    id: `statement-${index + 1}`,
    name: `Statement month ${index + 1}.pdf`,
    document_type: 'bank_statements_6_months',
    uploaded_by_role: 'client',
    uploaded_by_party: 'buyer',
    status: 'uploaded',
  }))
  const selfEmployedChecklist = buildBondApplicationDocumentChecklist({
    activeRequirements: [selfEmployedBankStatements],
    existingRequiredDocuments: [],
    existingDocuments: monthlyStatementDocuments,
  })
  const sixMonthStatements = selfEmployedChecklist.items.find((item) => item.requirement.key === selfEmployedBankStatements.key)
  assert.equal(sixMonthStatements.status, 'satisfied')
  assert.equal(sixMonthStatements.uploadedCount, 6)
  assert.equal(sixMonthStatements.candidateDocuments.length, 0)
}

function runProgressAndReconciliationTests() {
  const resolved = resolveBondApplicationDocumentRequirements({ applicationState: employmentState('permanent_employee') })
  const checklist = buildBondApplicationDocumentChecklist({
    activeRequirements: resolved.activeRequirements,
    existingRequiredDocuments: [],
    existingDocuments: [],
  })
  const progress = calculateBondApplicationDocumentProgress(checklist)
  assert.equal(progress.canContinue, false)
  assert.ok(progress.blockingMissing.every((item) => item.requirement.requiredBefore === BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature))

  const acceptedModeChecklist = buildBondApplicationDocumentChecklist({
    activeRequirements: [{
      key: 'bond_application_acceptance_required',
      active: true,
      required: true,
      title: 'Accepted document',
      description: '',
      requiredBefore: BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature,
      satisfactionMode: 'accepted',
      minimumFileCount: 1,
      participantRole: 'primary_applicant',
      matching: { canonicalTypes: ['accepted_document'] },
    }],
    existingRequiredDocuments: [],
    existingDocuments: [{
      id: 'pending-doc',
      document_type: 'accepted_document',
      uploaded_by_role: 'client',
      uploaded_by_party: 'buyer',
      status: 'uploaded',
    }],
  })
  const acceptedModeProgress = calculateBondApplicationDocumentProgress(acceptedModeChecklist)
  assert.equal(acceptedModeProgress.canContinue, false)

  const firstPlan = buildBondApplicationDocumentReconciliationPlan({
    transactionId: 'transaction-1',
    activeRequirements: resolved.activeRequirements,
    existingRequiredDocuments: [],
  })
  const secondPlan = buildBondApplicationDocumentReconciliationPlan({
    transactionId: 'transaction-1',
    activeRequirements: resolved.activeRequirements,
    existingRequiredDocuments: firstPlan.rowsToUpsert,
  })
  assert.equal(firstPlan.rowsToUpsert.length, secondPlan.rowsToUpsert.length)
  assert.equal(secondPlan.inactiveRows.length, 0)
  assert.equal(firstPlan.fingerprint, secondPlan.fingerprint)

  const selfEmployedPlan = buildBondApplicationDocumentReconciliationPlan({
    transactionId: 'transaction-1',
    activeRequirements: resolveBondApplicationDocumentRequirements({ applicationState: employmentState('self_employed') }).activeRequirements,
    existingRequiredDocuments: [],
  })
  const selfEmployedBankStatementRow = selfEmployedPlan.rowsToUpsert.find((row) =>
    row.document_key === 'bond_application_primary_applicant_self_employed_personal_bank_statements'
  )
  const selfEmployedBusinessBankStatementRow = selfEmployedPlan.rowsToUpsert.find((row) =>
    row.document_key === 'bond_application_primary_applicant_self_employed_business_bank_statements'
  )
  assert.equal(selfEmployedBankStatementRow?.allow_multiple, true)
  assert.equal(selfEmployedBusinessBankStatementRow?.allow_multiple, true)

  const stalePlan = buildBondApplicationDocumentReconciliationPlan({
    transactionId: 'transaction-1',
    activeRequirements: resolved.activeRequirements.filter((item) => item.key !== 'bond_application_deposit_proof'),
    existingRequiredDocuments: firstPlan.rowsToUpsert,
  })
  assert.ok(stalePlan.inactiveRows.some((row) => row.document_key === 'bond_application_deposit_proof'))
}

function runMetadataAndBoundaryTests() {
  const legacy = cloneBondApplicationValue(legacyBondApplicationFixtures.solePermanentEmployee.sources.existingBondApplication)
  const metadata = createGuidedBondApplicationMetadataPatch({
    currentScreenKey: 'document_checklist',
    completedScreenKeys: ['credit_history'],
    documentRuleSetVersion: BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
    documentRequirementFingerprint: 'fingerprint-1',
    now: '2026-07-28T12:00:00.000Z',
  })
  const withMetadata = applyGuidedBondApplicationMetadata(legacy, metadata)
  const roundTripped = toLegacyBondApplication(fromLegacyBondApplication(withMetadata))
  assert.equal(roundTripped._meta.guided_bond_application_v2.flow_version, GUIDED_BOND_APPLICATION_V2_FLOW_VERSION)
  assert.equal(roundTripped._meta.guided_bond_application_v2.document_rule_set_version, 'phase-4-v1')
  assert.equal(roundTripped._meta.guided_bond_application_v2.document_requirement_fingerprint, 'fingerprint-1')
  assert.equal(GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_REASON, 'phase_4_review_sign')
  assert.equal(GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_SECTION, 'declarations_consents')

  const guidedSource = readFile('src/modules/bond/application/guided/GuidedBondApplication.jsx')
  const documentSource = readFile('src/modules/bond/application/documents/buildBondApplicationDocumentChecklist.js')
  assert.equal(guidedSource.includes('transaction_bond_applications'), false)
  assert.equal(documentSource.includes('OCR'), false)
}

runContractTests()
runResolutionTests()
runChecklistAndMatchingTests()
runProgressAndReconciliationTests()
runMetadataAndBoundaryTests()

console.log('Phase 4 guided dynamic document tests passed')
