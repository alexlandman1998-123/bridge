import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BOND_APPLICATION_DECLARATION_CONTRACT_VERSION,
  BOND_APPLICATION_DECLARATIONS,
  BOND_APPLICATION_SUBMISSION_FLOW_VERSION,
  BOND_APPLICATION_SUBMISSION_STATUSES,
  buildBondApplicationDeclarationEvidence,
  buildBondApplicationDocumentChecklist,
  buildBondApplicationReviewSections,
  buildBondApplicationSubmissionSnapshot,
  canonicalizeBondApplicationSnapshot,
  calculateBondApplicationDocumentProgress,
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
  hashBondApplicationSnapshot,
  resolveBondApplicationDeclarations,
  resolveBondApplicationDocumentRequirements,
  resolveBondApplicationSignerIdentity,
  validateBondApplicationDeclarationAcceptance,
  validateBondApplicationDeclarationContract,
  validateBondApplicationSubmissionReadiness,
} from '../index.js'

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

function completeState() {
  let state = createEmptyBondApplicationState()
  state.application.transactionId = 'transaction-1'
  state.application.applicantStructure = 'sole'
  state.application.finance.purchasePrice = '2000000'
  state.application.finance.depositAmount = '0'
  state.application.finance.requestedBondAmount = '1800000'
  state.application.finance.financeType = 'bond'
  state.application.selectedBankIds = ['bank-a']
  state.participants.primaryApplicant.personal.first_name = 'Sample'
  state.participants.primaryApplicant.personal.surname = 'Buyer'
  state.participants.primaryApplicant.personal.identity_number = '9001010000000'
  state.participants.primaryApplicant.contact.email = 'buyer@example.test'
  state.participants.primaryApplicant.contact.phone = '0710000000'
  state.participants.primaryApplicant.employment.occupation_status = 'permanent_employee'
  state.participants.primaryApplicant.employment.employer_name = 'Employer'
  state.participants.primaryApplicant.employment.nature_of_occupation = 'Analyst'
  state.participants.primaryApplicant.employment.employment_years = '2'
  state.participants.primaryApplicant.employment.works_in_south_africa = 'yes'
  state.participants.primaryApplicant.employment.has_additional_income = 'no'
  state.participants.primaryApplicant.expenses.gross_salary = '65000'
  state.participants.primaryApplicant.expenses.groceries = '8000'
  state.participants.primaryApplicant.expenses.maintenance_paid = 'no'
  state.participants.primaryApplicant.expenses.pays_rent = 'no'
  state.participants.primaryApplicant.bankAccounts = [{ id: 'account-1', bankName: 'Bank', accountType: 'Cheque' }]
  state.participants.primaryApplicant.credit.has_debts = 'no'
  state.participants.primaryApplicant.credit.owns_property = 'no'
  state.participants.primaryApplicant.credit.under_debt_review = 'no'
  state.participants.primaryApplicant.credit.has_judgment = 'no'
  state.participants.primaryApplicant.credit.has_arrears = 'no'
  state.participants.primaryApplicant.credit.declared_insolvent = 'no'
  state = setPath(state, 'participants.primaryApplicant.address.residential_address_street', '1 Road')
  state = setPath(state, 'participants.primaryApplicant.address.residential_address_city', 'Cape Town')
  return state
}

function completeChecklist(state = completeState()) {
  const resolved = resolveBondApplicationDocumentRequirements({ applicationState: state })
  const docs = resolved.activeRequirements.map((requirement) => ({
    id: `doc-${requirement.key}`,
    document_type: requirement.canonicalDocumentType,
    uploaded_by_role: 'client',
    uploaded_by_party: 'buyer',
    status: requirement.satisfactionMode === 'accepted' ? 'accepted' : 'uploaded',
  }))
  return buildBondApplicationDocumentChecklist({
    activeRequirements: resolved.activeRequirements,
    existingRequiredDocuments: [],
    existingDocuments: docs,
  })
}

async function runDeclarationTests() {
  const contract = validateBondApplicationDeclarationContract(BOND_APPLICATION_DECLARATIONS)
  assert.equal(contract.valid, true)
  assert.equal(BOND_APPLICATION_DECLARATION_CONTRACT_VERSION, 'phase-6-v1')
  assert.ok(BOND_APPLICATION_DECLARATIONS.every((item) => item.participantRoles.includes('co_applicant')))
  const declarations = resolveBondApplicationDeclarations({ applicationState: completeState() })
  assert.ok(declarations.some((item) => item.key === 'application_information_accuracy'))
  const unchecked = validateBondApplicationDeclarationAcceptance({ declarations, values: {} })
  assert.equal(unchecked.valid, false)
  const values = Object.fromEntries(declarations.map((item) => [item.key, item.required]))
  values.marketing_privacy_preference = false
  const checked = validateBondApplicationDeclarationAcceptance({ declarations, values })
  assert.equal(checked.valid, true)
  const evidence = buildBondApplicationDeclarationEvidence({ declarations, values, acceptedAt: '2026-07-28T10:00:00.000Z', selectedBankIds: ['bank-a'] })
  assert.ok(evidence.every((item) => item.version && item.contractVersion && item.text))
  assert.equal(evidence.find((item) => item.key === 'marketing_privacy_preference').accepted, false)
}

function runReadinessTests() {
  const state = completeState()
  const checklist = completeChecklist(state)
  const declarations = resolveBondApplicationDeclarations({ applicationState: state })
  const declarationValues = Object.fromEntries(declarations.map((item) => [item.key, item.required]))
  const readiness = validateBondApplicationSubmissionReadiness({
    applicationState: state,
    documentChecklist: checklist,
    declarations,
    declarationValues,
    latestSaveStatus: 'saved',
  })
  assert.equal(readiness.ready, true)

  const missingBank = cloneBondApplicationValue(state)
  missingBank.application.selectedBankIds = []
  const bankReadiness = validateBondApplicationSubmissionReadiness({ applicationState: missingBank, documentChecklist: checklist, declarations, declarationValues, latestSaveStatus: 'saved' })
  assert.equal(bankReadiness.ready, false)
  assert.ok(bankReadiness.issues.some((item) => item.code === 'selected_bank_required'))

  const missingDocChecklist = buildBondApplicationDocumentChecklist({
    activeRequirements: resolveBondApplicationDocumentRequirements({ applicationState: state }).activeRequirements,
    existingRequiredDocuments: [],
    existingDocuments: [],
  })
  const docReadiness = validateBondApplicationSubmissionReadiness({ applicationState: state, documentChecklist: missingDocChecklist, declarations, declarationValues, latestSaveStatus: 'saved' })
  assert.equal(docReadiness.ready, false)
  assert.ok(docReadiness.issues.some((item) => item.code === 'blocking_document_missing'))
}

async function runSnapshotTests() {
  const state = completeState()
  const checklist = completeChecklist(state)
  const declarations = resolveBondApplicationDeclarations({ applicationState: state })
  const declarationValues = Object.fromEntries(declarations.map((item) => [item.key, item.required]))
  const evidence = buildBondApplicationDeclarationEvidence({ declarations, values: declarationValues, acceptedAt: '2026-07-28T10:00:00.000Z' })
  const signer = resolveBondApplicationSignerIdentity(state)
  const snapshot = buildBondApplicationSubmissionSnapshot({
    applicationState: state,
    submissionVersion: 1,
    declarations: evidence,
    documentChecklist: checklist,
    signerIdentity: signer,
    source: { onboardingFormDataId: 'form-1', sourceHash: 'source-hash' },
    createdAt: '2026-07-28T10:00:00.000Z',
  })
  assert.equal(snapshot.versions.flowVersion, BOND_APPLICATION_SUBMISSION_FLOW_VERSION)
  assert.equal(snapshot.signerManifest[0].participantRole, 'primary_applicant')
  assert.equal(JSON.stringify(snapshot).includes('portal_token'), false)
  assert.equal(JSON.stringify(snapshot).includes('signedUrl'), false)
  assert.equal(JSON.stringify(snapshot).includes('storage/v1'), false)
  const reordered = { createdAt: snapshot.createdAt, ...snapshot }
  assert.equal(canonicalizeBondApplicationSnapshot(snapshot), canonicalizeBondApplicationSnapshot(reordered))
  const hashA = await hashBondApplicationSnapshot(snapshot)
  const hashB = await hashBondApplicationSnapshot(reordered)
  assert.equal(hashA, hashB)
  const changed = cloneBondApplicationValue(snapshot)
  changed.finance.requestedBondAmount = '1900000'
  assert.notEqual(await hashBondApplicationSnapshot(changed), hashA)
}

function runReviewAndBoundaryTests() {
  const state = completeState()
  const checklist = completeChecklist(state)
  const progress = calculateBondApplicationDocumentProgress(checklist)
  const sections = buildBondApplicationReviewSections({ applicationState: state, documentProgress: progress, readinessIssues: [] })
  assert.ok(sections.some((item) => item.key === 'property_finance'))
  assert.ok(sections.some((item) => item.key === 'documents'))

  const migration = readFile('../supabase/migrations/202607280003_guided_bond_application_phase5_submissions.sql')
  assert.ok(migration.includes('transaction_bond_application_submissions'))
  assert.ok(migration.includes('bridge_prevent_bond_submission_snapshot_mutation'))
  assert.equal(migration.includes('bond_application_participants'), false)
  assert.equal(migration.includes('transaction_bond_applications'), false)

  const guidedSource = readFile('src/modules/bond/application/guided/GuidedBondApplication.jsx')
  assert.ok(guidedSource.includes('Review your application'))
  assert.ok(guidedSource.includes('Sign application'))
  assert.equal(guidedSource.includes('handleBondApplicationSubmit'), false)
}

await runDeclarationTests()
runReadinessTests()
await runSnapshotTests()
runReviewAndBoundaryTests()

assert.equal(BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature, 'awaiting_signature')

console.log('Phase 5 guided review and signing tests passed')
