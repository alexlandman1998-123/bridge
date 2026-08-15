import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BOND_APPLICATION_DECLARATION_CONTRACT_VERSION,
  BOND_APPLICATION_DECLARATIONS,
  BOND_APPLICATION_INTENTS,
  BOND_APPLICATION_PRE_APPROVAL_STATUSES,
  BOND_APPLICATION_SUBMISSION_FLOW_VERSION,
  BOND_APPLICATION_SUBMISSION_STATUSES,
  BOND_APPLICATION_JOURNEY_STAGE_KEYS,
  BOND_APPLICATION_JOURNEY_VERSION,
  BOND_APPLICATION_PRE_APPROVAL_JOURNEY_STAGE_DEFINITIONS,
  BOND_APPLICATION_STATUSES,
  buildBondApplicationDeclarationEvidence,
  buildBondApplicationDocumentChecklist,
  buildBondApplicationJourneyModel,
  buildBondApplicationReviewSections,
  buildBondApplicationSubmissionSnapshot,
  canonicalizeBondApplicationSnapshot,
  calculateBondApplicationDocumentProgress,
  cloneBondApplicationValue,
  canConvertPreApprovalToBondApplication,
  buildNormalizedBondApplicationFromState,
  buildPreApprovalConversionPersistencePayload,
  convertNormalizedPreApprovalToBondApplication,
  convertPreApprovalToBondApplication,
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

  const preApprovalState = setPath(state, 'application.intent', BOND_APPLICATION_INTENTS.preApproval)
  preApprovalState.application.selectedBankIds = []
  const preApprovalChecklist = completeChecklist(preApprovalState)
  const preApprovalDeclarations = resolveBondApplicationDeclarations({ applicationState: preApprovalState })
  const preApprovalDeclarationValues = Object.fromEntries(preApprovalDeclarations.map((item) => [item.key, item.required]))
  const preApprovalReadiness = validateBondApplicationSubmissionReadiness({
    applicationState: preApprovalState,
    documentChecklist: preApprovalChecklist,
    declarations: preApprovalDeclarations,
    declarationValues: preApprovalDeclarationValues,
    latestSaveStatus: 'saved',
  })
  assert.equal(preApprovalReadiness.ready, true)
  assert.equal(preApprovalReadiness.issues.some((item) => item.code === 'selected_bank_required'), false)
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

  const workspaceSource = readFile('src/pages/AttorneyTransactionDetail.jsx')
  assert.ok(workspaceSource.includes('Assessment & Outcome'))
  assert.ok(workspaceSource.includes('Pre-approval Assessment & Outcome'))
  assert.ok(workspaceSource.includes('isBondPreApprovalOnlyWorkspace'))
  assert.ok(workspaceSource.includes('Capture Pre-approval Outcome'))
  assert.ok(workspaceSource.includes('handleCapturePreApprovalOutcome'))
  assert.ok(workspaceSource.includes('onCapturePreApprovalOutcome={(payload) => void handleCapturePreApprovalOutcome(payload)}'))
  assert.ok(workspaceSource.includes('Convert to full bond application'))
  assert.ok(workspaceSource.includes('handleConvertPreApprovalToBondApplication'))

  const apiSource = readFile('src/lib/api.js')
  assert.ok(apiSource.includes('recordTransactionPreApprovalOutcome'))
  assert.ok(apiSource.includes('persistTransactionPreApprovalState'))
  assert.ok(apiSource.includes('pre_approval_outcome_captured'))
  assert.ok(apiSource.includes('convertTransactionPreApprovalToBondApplication'))
  assert.ok(apiSource.includes('pre_approval_converted'))
  assert.ok(apiSource.includes('persistNormalizedApplicationSharedSection'))

  const workflowSource = readFile('src/core/transactions/bondHybridFinanceWorkflow.js')
  assert.ok(workflowSource.includes('pre_approval_outcome_captured'))
  assert.ok(workflowSource.includes('pre_approval_converted'))

  const preApprovalEventsMigration = readFile('../supabase/migrations/202608150001_pre_approval_finance_workflow_events.sql')
  assert.ok(preApprovalEventsMigration.includes('pre_approval_outcome_captured'))
  assert.ok(preApprovalEventsMigration.includes('pre_approval_converted'))

  const viewModelSource = readFile('src/modules/bond/utils/bondApplicationViewModel.js')
  assert.ok(viewModelSource.includes('Pre-approval Summary'))
}

function runJourneyStageGateTests() {
  const state = completeState()
  const missingChecklist = buildBondApplicationDocumentChecklist({
    activeRequirements: resolveBondApplicationDocumentRequirements({ applicationState: state }).activeRequirements,
    existingRequiredDocuments: [],
    existingDocuments: [],
  })
  const missingProgress = calculateBondApplicationDocumentProgress(missingChecklist)
  const blocked = buildBondApplicationJourneyModel({
    applicationViewModel: { application: { createdAtDisplay: '19 Jul 2026' } },
    documentProgress: missingProgress,
    missingDocuments: missingChecklist.items.filter((item) => item.status !== 'satisfied').map((item) => ({ title: item.requirement.title })),
    selectedBankIds: ['FNB'],
  })
  assert.equal(blocked.version, BOND_APPLICATION_JOURNEY_VERSION)
  assert.equal(blocked.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents)
  assert.equal(blocked.nextActions[0].key, 'request_outstanding_documents')
  assert.ok(blocked.stages.find((stage) => stage.key === 'documents').requirements.some((requirement) => requirement.key === 'required_documents_received' && requirement.complete === false))

  const checklist = completeChecklist(state)
  const documentProgress = calculateBondApplicationDocumentProgress(checklist)
  const readyToSubmit = buildBondApplicationJourneyModel({
    applicationViewModel: { application: { createdAtDisplay: '19 Jul 2026' } },
    documentProgress,
    selectedBankIds: ['FNB', 'Standard Bank'],
  })
  assert.equal(readyToSubmit.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks)
  assert.equal(readyToSubmit.nextActions[0].key, 'submit_to_banks')
  assert.ok(readyToSubmit.stages.find((stage) => stage.key === 'documents').done)

  const awaitingQuotes = buildBondApplicationJourneyModel({
    applicationViewModel: { application: { createdAtDisplay: '19 Jul 2026' } },
    documentProgress,
    submissionRows: [{ bankName: 'FNB', submittedAt: '2026-07-20T10:00:00.000Z', status: 'submitted' }],
  })
  assert.equal(awaitingQuotes.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes)
  assert.equal(awaitingQuotes.nextActions[0].key, 'follow_up_bank_responses')

  const quote = { id: 'quote-1', bankName: 'FNB', interestRate: 10.75 }
  const needsGrantAcceptance = buildBondApplicationJourneyModel({
    applicationViewModel: { application: { createdAtDisplay: '19 Jul 2026' } },
    documentProgress,
    submissionRows: [{ bankName: 'FNB', submittedAt: '2026-07-20T10:00:00.000Z', status: 'submitted' }],
    quoteRows: [quote],
  })
  assert.equal(needsGrantAcceptance.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.grant)
  assert.equal(needsGrantAcceptance.nextActions[0].key, 'compare_and_accept_offer')

  const needsInstruction = buildBondApplicationJourneyModel({
    applicationViewModel: { application: { createdAtDisplay: '19 Jul 2026' } },
    documentProgress,
    submissionRows: [{ bankName: 'FNB', submittedAt: '2026-07-20T10:00:00.000Z', status: 'submitted' }],
    quoteRows: [quote],
    acceptedQuote: quote,
  })
  assert.equal(needsInstruction.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction)
  assert.equal(needsInstruction.nextActions[0].key, 'issue_attorney_instruction')

  const complete = buildBondApplicationJourneyModel({
    applicationViewModel: { application: { createdAtDisplay: '19 Jul 2026' } },
    documentProgress,
    submissionRows: [{ bankName: 'FNB', submittedAt: '2026-07-20T10:00:00.000Z', status: 'submitted' }],
    quoteRows: [quote],
    acceptedQuote: quote,
    action: { stage: 'registered' },
  })
  assert.equal(complete.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.complete)
  assert.equal(complete.currentStage.title, 'Complete')
  assert.ok(complete.stages.every((stage) => stage.done))

  const preApprovalState = setPath(state, 'application.intent', BOND_APPLICATION_INTENTS.preApproval)
  preApprovalState.application.selectedBankIds = []
  const preApprovalChecklist = completeChecklist(preApprovalState)
  const preApprovalProgress = calculateBondApplicationDocumentProgress(preApprovalChecklist)
  const preApprovalNeedsProvider = buildBondApplicationJourneyModel({
    applicationState: preApprovalState,
    applicationViewModel: {
      canonical: { intent: BOND_APPLICATION_INTENTS.preApproval },
      application: { createdAtDisplay: '19 Jul 2026', intent: BOND_APPLICATION_INTENTS.preApproval },
    },
    documentProgress: preApprovalProgress,
  })
  assert.equal(BOND_APPLICATION_PRE_APPROVAL_JOURNEY_STAGE_DEFINITIONS.length, 5)
  assert.deepEqual(
    preApprovalNeedsProvider.stages.map((stage) => stage.key),
    [
      BOND_APPLICATION_JOURNEY_STAGE_KEYS.received,
      BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents,
      BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks,
      BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes,
      BOND_APPLICATION_JOURNEY_STAGE_KEYS.complete,
    ],
  )
  assert.equal(preApprovalNeedsProvider.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks)
  assert.equal(preApprovalNeedsProvider.currentStage.title, 'Provider not selected')
  assert.equal(preApprovalNeedsProvider.nextActions[0].key, 'select_pre_approval_provider')
  assert.equal(preApprovalNeedsProvider.stages.some((stage) => stage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.grant), false)
  assert.equal(preApprovalNeedsProvider.stages.some((stage) => stage.key === BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction), false)

  const preApprovalReadyToSubmit = buildBondApplicationJourneyModel({
    applicationState: preApprovalState,
    documentProgress: preApprovalProgress,
    selectedBankIds: ['FNB'],
  })
  assert.equal(preApprovalReadyToSubmit.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks)
  assert.equal(preApprovalReadyToSubmit.currentStage.title, 'Ready for assessment')
  assert.equal(preApprovalReadyToSubmit.nextActions[0].key, 'submit_pre_approval')

  const preApprovalSubmitted = buildBondApplicationJourneyModel({
    applicationState: setPath(preApprovalState, 'application.preApproval.status', BOND_APPLICATION_PRE_APPROVAL_STATUSES.submitted),
    documentProgress: preApprovalProgress,
  })
  assert.equal(preApprovalSubmitted.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes)
  assert.equal(preApprovalSubmitted.nextActions[0].key, 'capture_pre_approval_outcome')

  const preApprovalApproved = buildBondApplicationJourneyModel({
    applicationState: setPath(preApprovalState, 'application.preApproval.status', BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved),
    documentProgress: preApprovalProgress,
  })
  assert.equal(preApprovalApproved.currentStage.key, BOND_APPLICATION_JOURNEY_STAGE_KEYS.complete)
  assert.equal(preApprovalApproved.currentStage.title, 'Complete')
  assert.ok(preApprovalApproved.stages.every((stage) => stage.done))

  const approvedPreApprovalState = setPath(preApprovalState, 'application.preApproval.status', BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved)
  approvedPreApprovalState.application.preApproval.provider = 'FNB'
  approvedPreApprovalState.application.preApproval.approvedAmount = '1800000'
  approvedPreApprovalState.application.preApproval.referenceNumber = 'PRE-123'
  approvedPreApprovalState.application.preApproval.certificateDocumentId = 'doc-pre-approval'
  approvedPreApprovalState.application.selectedBankIds = ['FNB']
  const approvedPreApprovalSnapshot = cloneBondApplicationValue(approvedPreApprovalState)
  assert.equal(canConvertPreApprovalToBondApplication(approvedPreApprovalState), true)
  const converted = convertPreApprovalToBondApplication(approvedPreApprovalState, { now: '2026-08-15T08:00:00.000Z' })
  assert.deepEqual(approvedPreApprovalState, approvedPreApprovalSnapshot)
  assert.equal(converted.application.intent, BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval)
  assert.equal(converted.application.preApproval.provider, 'FNB')
  assert.equal(converted.application.preApproval.approvedAmount, '1800000')
  assert.equal(converted.application.preApproval.certificateDocumentId, 'doc-pre-approval')
  assert.deepEqual(converted.application.selectedBankIds, [])
  assert.equal(converted.compatibility.preApprovalConversion.convertedAt, '2026-08-15T08:00:00.000Z')
  const convertedRequirements = resolveBondApplicationDocumentRequirements({ applicationState: converted }).activeRequirements
  assert.ok(convertedRequirements.some((item) => item.key === 'bond_application_offer_to_purchase'))
  assert.ok(convertedRequirements.some((item) => item.key === 'bond_application_existing_pre_approval_certificate'))
  assert.equal(convertedRequirements.some((item) => item.key === 'bond_application_pre_approval_credit_check_consent'), false)

  const conversionPayload = buildPreApprovalConversionPersistencePayload({
    applicationState: approvedPreApprovalState,
    existingFormData: { keep_me: 'yes' },
    now: '2026-08-15T08:00:00.000Z',
  })
  assert.equal(conversionPayload.formData.keep_me, 'yes')
  assert.equal(conversionPayload.formData.bond_application.summary.application_intent, BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval)
  assert.equal(conversionPayload.formData.bond_application.pre_approval.provider, 'FNB')
  assert.equal(conversionPayload.formData.bond_application.pre_approval.status, BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved)

  const normalizedPreApproval = buildNormalizedBondApplicationFromState({
    applicationState: approvedPreApprovalState,
    transactionId: 'transaction-pre-approval',
    onboardingFormDataId: 'onboarding-pre-approval',
  })
  const normalizedConverted = convertNormalizedPreApprovalToBondApplication({
    normalizedApplication: {
      ...normalizedPreApproval,
      id: 'normalized-pre-approval',
    },
    now: '2026-08-15T08:00:00.000Z',
  })
  assert.equal(normalizedConverted.normalizedApplication.status, BOND_APPLICATION_STATUSES.draft)
  assert.equal(normalizedConverted.normalizedApplication.revision, normalizedPreApproval.revision + 1)
  assert.equal(normalizedConverted.normalizedApplication.sharedSections.application_intent.intent, BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval)
  assert.deepEqual(normalizedConverted.normalizedApplication.sharedSections.selected_banks, [])
  assert.equal(normalizedConverted.normalizedApplication.participants[0].participantKey, normalizedPreApproval.participants[0].participantKey)

  const declinedPreApprovalState = setPath(preApprovalState, 'application.preApproval.status', BOND_APPLICATION_PRE_APPROVAL_STATUSES.declined)
  assert.equal(canConvertPreApprovalToBondApplication(declinedPreApprovalState), false)
  assert.throws(
    () => convertPreApprovalToBondApplication(declinedPreApprovalState),
    /Only approved pre-approvals can be converted/,
  )
}

await runDeclarationTests()
runReadinessTests()
await runSnapshotTests()
runReviewAndBoundaryTests()
runJourneyStageGateTests()

assert.equal(BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature, 'awaiting_signature')

console.log('Phase 5 guided review and signing tests passed')
