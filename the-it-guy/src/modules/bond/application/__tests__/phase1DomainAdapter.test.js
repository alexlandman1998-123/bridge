import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildBondApplicationViewModel } from '../../utils/bondApplicationViewModel.js'
import {
  BOND_APPLICATION_INTENTS,
  BOND_APPLICATION_PRE_APPROVAL_STATUSES,
  buildBondApplicationState,
  buildLegacyBondApplicationDraft,
  buildLegacyBondApplicationPersistencePayload,
  buildNormalizedBondApplicationFromState,
  calculateLegacyBondApplicationCompletion,
  cloneBondApplicationValue,
  fromLegacyBondApplication,
  getAdapterDiagnostics,
  getCoApplicant,
  getFinanceSummary,
  getPrimaryApplicant,
  getPropertySummary,
  getSelectedBankIds,
  mergeBondApplicationIntoFormData,
  toLegacyBondApplication,
  validateLegacyBondApplicationSubmission,
} from '../index.js'
import { legacyBondApplicationFixtures } from '../__fixtures__/legacyBondApplicationFixtures.js'
import { resolveGuidedBondApplicationV2Flag } from '../../../../lib/guidedBondApplicationFeatureFlag.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDirectory, '../../../../..')

const LEGACY_SECTIONS = [
  { key: 'summary', label: 'Application Summary' },
  { key: 'personal_details', label: 'Personal Details' },
  { key: 'contact_address', label: 'Contact & Address' },
  { key: 'employment', label: 'Employment' },
  { key: 'credit_history', label: 'Credit History' },
  { key: 'loan_details', label: 'Loan Details' },
  { key: 'income_deductions_expenses', label: 'Income, Deductions & Expenses' },
  { key: 'banking_liabilities', label: 'Bank Accounts & Existing Debt' },
  { key: 'assets_liabilities', label: 'Assets & Liabilities' },
  { key: 'declarations_consents', label: 'Declarations & Consents' },
  { key: 'documents', label: 'Documents' },
]

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function fixtures() {
  return Object.values(legacyBondApplicationFixtures)
}

function assertNotMutated(value, snapshot, label) {
  assert.deepEqual(value, snapshot, `${label} should not be mutated`)
}

function runLegacyDraftBuilderEquivalence() {
  fixtures().forEach((fixture) => {
    const input = cloneBondApplicationValue(fixture.portal)
    const inputSnapshot = cloneBondApplicationValue(input)
    const draft = buildLegacyBondApplicationDraft(input)
    const existing = fixture.sources.existingBondApplication

    assert.equal(draft.status, existing.status, `${fixture.key} status should preserve legacy status`)
    assert.deepEqual(draft.selected_banks, existing.selected_banks, `${fixture.key} selected banks should preserve existing legacy data`)
    assert.equal(draft.summary.applicant_name, existing.summary.applicant_name, `${fixture.key} applicant summary should preserve saved answer`)
    assert.equal(draft.summary.property_reference, existing.summary.property_reference, `${fixture.key} property reference should preserve saved answer`)
    assert.equal(draft.loan_details.amount_to_be_registered, existing.loan_details.amount_to_be_registered)
    assert.equal(draft.applicants.find((item) => item.key === 'primary')?.first_name, existing.applicants[0]?.first_name)
    assertNotMutated(input, inputSnapshot, `${fixture.key} portal input`)
  })
}

function runLegacyToCleanMapping() {
  const joint = legacyBondApplicationFixtures.jointApplication
  const state = buildBondApplicationState(joint.portal)
  const property = getPropertySummary(state)
  const finance = getFinanceSummary(state)
  const primary = getPrimaryApplicant(state)
  const coApplicant = getCoApplicant(state)

  assert.equal(state.schemaVersion, 2)
  assert.equal(state.application.intent, BOND_APPLICATION_INTENTS.bondApplication)
  assert.equal(state.application.preApproval.status, BOND_APPLICATION_PRE_APPROVAL_STATUSES.none)
  assert.equal(property.developmentName, 'Sample Gardens')
  assert.equal(property.unitReference, 'Unit A-104')
  assert.equal(property.propertyReference, 'Sample Gardens - Unit A-104')
  assert.equal(finance.purchasePrice, '1850000')
  assert.equal(finance.depositAmount, '185000')
  assert.equal(finance.requestedBondAmount, '1665000')
  assert.equal(finance.financeType, 'bond')
  assert.deepEqual(getSelectedBankIds(state), ['Nedbank', 'Standard Bank'])
  assert.equal(primary.personal.first_name, 'Thabo')
  assert.equal(primary.employment.occupation_status, 'permanent_employee')
  assert.equal(primary.expenses.gross_salary, '68000')
  assert.equal(coApplicant.role, 'co_applicant')
  assert.equal(coApplicant.personal.first_name, 'Priya')
  assert.equal(coApplicant.employment.occupation_status, 'contract_employee')

  const commitments = buildBondApplicationState(legacyBondApplicationFixtures.financialCommitments.portal)
  assert.equal(commitments.participants.primaryApplicant.bankAccounts[0].bankName, 'ABSA')
  assert.ok(commitments.participants.primaryApplicant.debts.some((debt) => debt.legacyKey === 'home_loan_1'))
  assert.ok(commitments.participants.primaryApplicant.assets.some((asset) => asset.legacyKey === 'fixed_property'))
  assert.ok(commitments.participants.primaryApplicant.liabilities.some((liability) => liability.legacyKey === 'total_liabilities'))
  assert.equal(commitments.participants.primaryApplicant.credit.currently_under_administration, 'no')
  assert.equal(commitments.legacySubmission.typedSignatureName, 'Lerato Nkosi')
  assert.equal(commitments.legacySubmission.typedSignatureDate, '2026-02-12')
  assert.equal(commitments.legacySubmission.status, 'Submitted')
  assert.equal(commitments.legacySubmission.submittedAt, '2026-02-13T09:15:00.000Z')
}

function runCleanToLegacyMappingAndPassthrough() {
  const legacy = cloneBondApplicationValue(legacyBondApplicationFixtures.financialCommitments.sources.existingBondApplication)
  legacy.unknown_phase1 = { nested: { keep: true } }
  const state = fromLegacyBondApplication(legacy)
  const stateSnapshot = cloneBondApplicationValue(state)
  const updated = cloneBondApplicationValue(state)

  updated.application.finance.purchasePrice = '1999000'
  updated.application.buyerEntity = {
    entityType: 'company',
    name: 'Updated Holdings (Pty) Ltd',
    registrationNumber: '2026/123456/07',
  }
  updated.application.selectedBankIds = ['FNB']
  updated.application.intent = BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval
  updated.application.preApproval = {
    status: BOND_APPLICATION_PRE_APPROVAL_STATUSES.existing,
    provider: 'FNB',
    approvedAmount: '1800000',
    issuedAt: '2026-07-01',
    expiresAt: '2026-10-01',
    referenceNumber: 'PA-123',
    conditions: ['Subject to property valuation'],
    certificateDocumentId: 'document-preapproval-1',
  }
  updated.participants.primaryApplicant.personal.first_name = 'Updated'
  updated.participants.primaryApplicant.bankAccounts[0].bankName = 'Nedbank'
  updated.legacySubmission.typedSignatureName = 'Updated Applicant'

  const roundTripped = toLegacyBondApplication(updated)
  assert.equal(roundTripped.summary.purchase_price, '1999000')
  assert.equal(roundTripped.summary.buyer_entity_type, 'company')
  assert.equal(roundTripped.summary.buyer_entity_name, 'Updated Holdings (Pty) Ltd')
  assert.equal(roundTripped.summary.buyer_entity_registration_number, '2026/123456/07')
  assert.deepEqual(roundTripped.selected_banks, ['FNB'])
  assert.equal(roundTripped.summary.application_intent, BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval)
  assert.equal(roundTripped.application_intent, BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval)
  assert.equal(roundTripped.pre_approval.status, BOND_APPLICATION_PRE_APPROVAL_STATUSES.existing)
  assert.equal(roundTripped.pre_approval.provider, 'FNB')
  assert.equal(roundTripped.pre_approval.approved_amount, '1800000')
  assert.equal(roundTripped.pre_approval.certificate_document_id, 'document-preapproval-1')
  assert.deepEqual(roundTripped.pre_approval.conditions, ['Subject to property valuation'])
  assert.equal(roundTripped.applicants.find((applicant) => applicant.key === 'primary')?.first_name, 'Updated')
  assert.equal(roundTripped.banking_liabilities.primary_bank_name, 'Nedbank')
  assert.equal(roundTripped.declarations_consents.digital_signature_name, 'Updated Applicant')
  assert.deepEqual(roundTripped.unknown_phase1, { nested: { keep: true } })
  assert.equal(roundTripped.credit_history.currently_under_administration, legacy.credit_history.currently_under_administration)
  assertNotMutated(state, stateSnapshot, 'adapter state passed to toLegacyBondApplication')
}

function runRoundTripIntegrity() {
  fixtures().forEach((fixture) => {
    const legacy = fixture.sources.existingBondApplication
    const state = fromLegacyBondApplication(legacy)
    const roundTripped = toLegacyBondApplication(state)
    assert.deepEqual(roundTripped, legacy, `${fixture.key} should preserve meaningful legacy JSON round trip`)
  })
}

function runUnknownAndValuePreservation() {
  const legacy = cloneBondApplicationValue(legacyBondApplicationFixtures.solePermanentEmployee.sources.existingBondApplication)
  legacy.phase1_unknown = {
    falseValue: false,
    zeroValue: 0,
    emptyString: '',
    nullValue: null,
    emptyArray: [],
    dateString: '2026-02-01',
    numericString: '0',
    existingId: 'legacy-id-123',
  }
  const roundTripped = toLegacyBondApplication(fromLegacyBondApplication(legacy))
  assert.deepEqual(roundTripped.phase1_unknown, legacy.phase1_unknown)
  const diagnostics = getAdapterDiagnostics(fromLegacyBondApplication(legacy))
  assert.ok(diagnostics.some((item) => item.type === 'passthrough_preserved' && item.path === 'phase1_unknown'))
}

function runNonMutationContract() {
  const legacy = cloneBondApplicationValue(legacyBondApplicationFixtures.soleSelfEmployed.sources.existingBondApplication)
  const legacySnapshot = cloneBondApplicationValue(legacy)
  const state = fromLegacyBondApplication(legacy)
  assertNotMutated(legacy, legacySnapshot, 'legacy input')

  const stateSnapshot = cloneBondApplicationValue(state)
  toLegacyBondApplication(state)
  assertNotMutated(state, stateSnapshot, 'clean state input')

  const formData = {
    first_name: 'Alex',
    existing_onboarding_answer: 'keep',
    nested: { keep: true },
  }
  const formDataSnapshot = cloneBondApplicationValue(formData)
  const merged = mergeBondApplicationIntoFormData(formData, legacy)
  assertNotMutated(formData, formDataSnapshot, 'form_data input')
  assert.equal(merged.existing_onboarding_answer, 'keep')
  assert.deepEqual(merged.nested, { keep: true })
  assert.deepEqual(merged.bond_application, legacy)
}

function runSourcePrecedence() {
  const portal = cloneBondApplicationValue(legacyBondApplicationFixtures.solePermanentEmployee.portal)
  portal.onboardingFormData.formData.first_name = 'Onboarding'
  portal.onboardingFormData.formData.last_name = 'Person'
  portal.onboardingFormData.formData.bond_application.applicants[0].first_name = 'Saved'
  portal.onboardingFormData.formData.bond_application.summary.property_reference = 'Saved Property'
  portal.unit.development.name = 'Fresh Development'
  portal.onboardingFormData.formData.bond_application.selected_banks = ['Saved Bank']
  portal.onboardingFormData.formData.bond_application.selectedBanks = ['Old Camel Bank']
  portal.onboardingFormData.formData.spouse_full_name = 'Onboarding Spouse'
  portal.onboardingFormData.formData.bond_application.applicants.push({
    key: 'co_applicant',
    label: 'Co-applicant',
    first_name: 'Saved Co',
  })

  const draft = buildLegacyBondApplicationDraft(portal)
  assert.equal(draft.applicants.find((item) => item.key === 'primary')?.first_name, 'Saved')
  assert.equal(draft.summary.property_reference, 'Saved Property')
  assert.deepEqual(draft.selected_banks, ['Saved Bank'])
  assert.equal(draft.applicants.find((item) => item.key === 'co_applicant')?.first_name, 'Saved Co')
}

function runCompletionValidationAndPersistence() {
  const fixture = legacyBondApplicationFixtures.solePermanentEmployee
  const application = fixture.sources.existingBondApplication
  const completion = calculateLegacyBondApplicationCompletion({
    application,
    sections: LEGACY_SECTIONS,
    requiredDocuments: [],
  })
  assert.equal(completion.sectionStatusByKey.declarations_consents.isComplete, true)
  assert.equal(completion.sectionStatusByKey.documents.isComplete, true)
  assert.ok(Number.isInteger(completion.progressPercent))

  assert.equal(validateLegacyBondApplicationSubmission(application).valid, true)
  const withoutConsent = cloneBondApplicationValue(application)
  withoutConsent.declarations_consents.loan_processing_consent = false
  assert.deepEqual(validateLegacyBondApplicationSubmission(withoutConsent).issues.map((issue) => issue.code), ['consent_and_signature_required'])
  const withoutBanks = cloneBondApplicationValue(application)
  withoutBanks.selected_banks = []
  assert.deepEqual(validateLegacyBondApplicationSubmission(withoutBanks).issues.map((issue) => issue.code), ['selected_bank_required'])

  const payload = buildLegacyBondApplicationPersistencePayload({
    existingFormData: fixture.portal.onboardingFormData.formData,
    legacyBondApplication: application,
    submitted: true,
    timestamp: '2026-03-01T08:00:00.000Z',
  })
  assert.equal(payload.draftToPersist.status, 'Submitted')
  assert.equal(payload.draftToPersist.submitted_at, '2026-03-01T08:00:00.000Z')
  assert.deepEqual(payload.formData.bond_application, payload.draftToPersist)
  assert.equal(payload.formData.existing_onboarding_answer, 'preserve me')
  assert.ok(payload.formData.finance_readiness)
}

function runViewModelAndRuntimeBoundaryCompatibility() {
  fixtures().forEach((fixture) => {
    const legacy = fixture.sources.existingBondApplication
    const state = fromLegacyBondApplication(legacy)
    const roundTripped = toLegacyBondApplication(state)
    const viewModel = buildBondApplicationViewModel({
      transaction: fixture.sources.transactionInformation,
      buyer: fixture.sources.portalBuyer,
      development: fixture.sources.developmentInformation,
      unit: fixture.sources.unitInformation,
      onboarding: { status: roundTripped.status },
      onboardingFormData: roundTripped,
      reference: `PHASE1-${fixture.key}`,
      statusLabel: roundTripped.status,
    })
    assert.ok(viewModel.applicant.fullName)
    assert.ok(viewModel.property.label)
    assert.equal(viewModel.applicant.email, fixture.sources.portalBuyer.email)
    assert.equal(viewModel.applicant.phone, fixture.sources.portalBuyer.phone)
    assert.equal(viewModel.primaryApplicantDetail.idNumber, legacy.applicants[0]?.identity_number)
    assert.equal(viewModel.primaryApplicantDetail.employer, legacy.employment.primary.employer_name)
    assert.equal(viewModel.financials.purchasePrice.raw, fixture.sources.transactionInformation.purchase_price)
    assert.equal(viewModel.financials.deposit.raw, fixture.sources.transactionInformation.deposit_amount)
    assert.equal(viewModel.financials.bondAmountRequired.raw, fixture.sources.transactionInformation.bond_amount)

    const normalized = buildNormalizedBondApplicationFromState({
      applicationState: state,
      transactionId: fixture.sources.transactionInformation.id,
      onboardingFormDataId: `onboarding-${fixture.key}`,
      includeCoApplicant: Boolean(state.participants.coApplicant),
    })
    const originatorViewModel = buildBondApplicationViewModel({
      transaction: fixture.sources.transactionInformation,
      buyer: fixture.sources.portalBuyer,
      development: fixture.sources.developmentInformation,
      unit: fixture.sources.unitInformation,
      onboarding: { status: roundTripped.status },
      onboardingFormData: roundTripped,
      bondApplication: normalized,
      reference: `NORMALIZED-${fixture.key}`,
      statusLabel: roundTripped.status,
    })
    assert.equal(originatorViewModel.canonical.storageMode, 'normalized_v1')
    assert.equal(originatorViewModel.applicant.fullName, viewModel.applicant.fullName)
    assert.equal(originatorViewModel.applicant.email, viewModel.applicant.email)
    assert.equal(originatorViewModel.applicant.phone, viewModel.applicant.phone)
    assert.equal(originatorViewModel.primaryApplicantDetail.idNumber, viewModel.primaryApplicantDetail.idNumber)
    assert.equal(originatorViewModel.financials.purchasePrice.raw, viewModel.financials.purchasePrice.raw)
    assert.equal(originatorViewModel.financials.deposit.raw, viewModel.financials.deposit.raw)
    assert.equal(originatorViewModel.financials.bondAmountRequired.raw, viewModel.financials.bondAmountRequired.raw)
  })

  const clientPortalSource = readFile('src/pages/ClientPortal.jsx')
  assert.ok(clientPortalSource.includes('buildBondApplicationPrefillDraft(portal).application'))
  assert.equal(clientPortalSource.includes('isGuidedBondApplicationV2Enabled'), false)
  assert.ok(clientPortalSource.includes("activeBondApplicationTab === 'offers'"))
  assert.ok(clientPortalSource.includes("activeBondApplicationTab === 'grant'"))
  assert.equal(resolveGuidedBondApplicationV2Flag({ env: {} }).enabled, false)
}

function runWorkflowSeparationInvariant() {
  const persistenceSource = readFile('src/modules/bond/application/bondApplicationPersistence.js')
  const adapterSource = readFile('src/modules/bond/application/legacy/bondApplicationLegacyAdapter.js')
  const apiSource = readFile('src/lib/api.js')
  const upsertStart = apiSource.indexOf('async function upsertClientPortalOnboardingForm')
  const upsertEnd = apiSource.indexOf('\nexport async function saveClientPortalOnboardingDraft', upsertStart)
  const upsertSource = apiSource.slice(upsertStart, upsertEnd)

  assert.equal(persistenceSource.includes('transaction_bond_applications'), false)
  assert.equal(adapterSource.includes('transaction_bond_applications'), false)
  assert.equal(upsertSource.includes('transaction_bond_applications'), false)
}

runLegacyDraftBuilderEquivalence()
runLegacyToCleanMapping()
runCleanToLegacyMappingAndPassthrough()
runRoundTripIntegrity()
runUnknownAndValuePreservation()
runNonMutationContract()
runSourcePrecedence()
runCompletionValidationAndPersistence()
runViewModelAndRuntimeBoundaryCompatibility()
runWorkflowSeparationInvariant()

console.log('Phase 1 bond application domain adapter tests passed')
