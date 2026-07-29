import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GUIDED_BOND_APPLICATION_V2_ENV,
  GUIDED_BOND_APPLICATION_V2_FLAG,
  isGuidedBondApplicationV2Enabled,
  resolveGuidedBondApplicationV2Flag,
} from '../../../../lib/guidedBondApplicationFeatureFlag.js'
import { buildBondApplicationViewModel } from '../../utils/bondApplicationViewModel.js'
import { legacyBondApplicationFixtures } from '../__fixtures__/legacyBondApplicationFixtures.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDirectory, '../../../../..')

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function sliceFunction(source, signature) {
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, `${signature} should exist`)
  const nextIndentedFunction = source.indexOf('\n  async function ', start + signature.length)
  const nextTopLevelFunction = source.indexOf('\nfunction ', start + signature.length)
  const candidates = [nextIndentedFunction, nextTopLevelFunction].filter((index) => index > start)
  const end = candidates.length ? Math.min(...candidates) : source.length
  return source.slice(start, end)
}

function assertContains(source, needle, message = `${needle} should be present`) {
  assert.ok(source.includes(needle), message)
}

function runFeatureFlagContract() {
  assert.equal(GUIDED_BOND_APPLICATION_V2_FLAG, 'guided_bond_application_v2')
  assert.equal(resolveGuidedBondApplicationV2Flag({ env: {} }).enabled, false)
  assert.equal(resolveGuidedBondApplicationV2Flag().enabled, false)
  assert.equal(resolveGuidedBondApplicationV2Flag({ env: { [GUIDED_BOND_APPLICATION_V2_ENV]: 'not-a-flag' } }).enabled, false)
  assert.equal(resolveGuidedBondApplicationV2Flag({ env: { [GUIDED_BOND_APPLICATION_V2_ENV]: 'true' } }).enabled, true)
  assert.equal(isGuidedBondApplicationV2Enabled({ env: { [GUIDED_BOND_APPLICATION_V2_ENV]: 'enabled' } }), true)
  assert.equal(resolveGuidedBondApplicationV2Flag({ config: { features: { guided_bond_application_v2: true } } }).enabled, true)
  assert.equal(resolveGuidedBondApplicationV2Flag({ organisation: { feature_flags: { guided_bond_application_v2: 'yes' } } }).source, 'organisation')
  assert.equal(resolveGuidedBondApplicationV2Flag({ transaction: { guidedBondApplicationV2: true } }).source, 'transaction')

  const envValidationSource = readFile('src/lib/envValidation.js')
  assertContains(envValidationSource, 'guidedBondApplicationV2: resolveGuidedBondApplicationV2Flag({ env: import.meta.env }).enabled')
}

function runFixtureContract() {
  const fixtures = legacyBondApplicationFixtures
  assert.deepEqual(Object.keys(fixtures), [
    'solePermanentEmployee',
    'soleSelfEmployed',
    'jointApplication',
    'financialCommitments',
  ])

  Object.values(fixtures).forEach((fixture) => {
    assert.ok(fixture.sources.portalBuyer, `${fixture.key} should include portal buyer source data`)
    assert.ok(fixture.sources.buyerOnboardingInformation, `${fixture.key} should include buyer onboarding source data`)
    assert.ok(fixture.sources.transactionInformation, `${fixture.key} should include transaction source data`)
    assert.ok(fixture.sources.unitInformation, `${fixture.key} should include unit source data`)
    assert.ok(fixture.sources.developmentInformation, `${fixture.key} should include development source data`)
    assert.ok(fixture.sources.existingBondApplication, `${fixture.key} should include legacy bond application JSON`)
    assert.ok(Array.isArray(fixture.sources.selectedBanks), `${fixture.key} should include selected banks`)
    assert.equal(
      fixture.portal.onboardingFormData.formData.bond_application,
      fixture.sources.existingBondApplication,
      `${fixture.key} should persist legacy JSON under form_data.bond_application`,
    )
  })

  const jointApplicants = legacyBondApplicationFixtures.jointApplication.sources.existingBondApplication.applicants
  assert.ok(jointApplicants.some((applicant) => applicant.key === 'primary'))
  assert.ok(jointApplicants.some((applicant) => applicant.key === 'co_applicant'))
}

function runRouteAndCurrentExperienceContract() {
  const appSource = readFile('src/App.jsx')
  const clientPortalSource = readFile('src/pages/ClientPortal.jsx')

  assertContains(appSource, 'const ClientPortal = lazy(() => import(\'./pages/ClientPortal\'))')
  assertContains(appSource, '<Route path="/client/:token/bond-application"')
  assertContains(appSource, '<ClientPortal /></AppErrorBoundary></TokenRouteGate>')
  assert.equal(
    clientPortalSource.includes('isGuidedBondApplicationV2Enabled'),
    false,
    'Phase 0 must not route or render a guided V2 application',
  )
}

function runDraftConstructionContract() {
  const clientPortalSource = readFile('src/pages/ClientPortal.jsx')
  const draftSource = readFile('src/modules/bond/application/legacy/buildLegacyBondApplicationDraft.js')

  assertContains(clientPortalSource, 'buildLegacyBondApplicationDraft,')
  assertContains(clientPortalSource, 'buildLegacyBondApplicationDraft(portal)')
  assertContains(draftSource, 'portal?.onboardingFormData?.formData || {}')
  assertContains(draftSource, 'formData.bond_application')
  assertContains(draftSource, 'getBondApplicationApplicantDefault(\'primary\', portal)')
  assertContains(draftSource, 'getBondApplicationApplicantDefault(\'co_applicant\', portal)')
  assertContains(draftSource, 'portal?.transaction?.purchase_price')
  assertContains(draftSource, 'portal?.transaction?.sales_price')
  assertContains(draftSource, 'portal?.unit?.price')
  assertContains(draftSource, 'portal?.unit?.development?.name')
  assertContains(draftSource, 'existing.selected_banks')
  assertContains(draftSource, 'existing.selectedBanks')
  assertContains(draftSource, 'declarations_consents')
}

function runPersistenceAndSubmissionContract() {
  const clientPortalSource = readFile('src/pages/ClientPortal.jsx')
  const apiSource = readFile('src/lib/api.js')
  const persistenceSource = readFile('src/modules/bond/application/bondApplicationPersistence.js')
  const validationSource = readFile('src/modules/bond/application/bondApplicationValidation.js')
  const persistSource = sliceFunction(clientPortalSource, 'async function persistBondApplicationDraft')
  const submitSource = sliceFunction(clientPortalSource, 'async function handleBondApplicationSubmit')
  const upsertSource = sliceFunction(apiSource, 'async function upsertClientPortalOnboardingForm')

  assertContains(persistSource, 'buildLegacyBondApplicationPersistencePayload({')
  assertContains(persistenceSource, 'bond_application: cloneBondApplicationValue(legacyBondApplication) || {}')
  assertContains(persistSource, 'saveClientPortalOnboardingDraft({')
  assertContains(persistenceSource, 'submitted_at: submitted ? timestamp : legacyBondApplication?.submitted_at || \'\'')
  assert.equal(persistSource.includes('transaction_bond_applications'), false)

  assertContains(upsertSource, 'fetchOnboardingFormDataForTransaction')
  assertContains(upsertSource, 'getOrCreateTransactionOnboardingRecord')
  assertContains(upsertSource, 'ensureTransactionRequiredDocuments')
  assertContains(apiSource, 'export async function saveClientPortalOnboardingDraft({ token, formData })')
  assert.equal(
    upsertSource.includes('transaction_bond_applications'),
    false,
    'Client portal draft persistence must not write buyer answers into bank workflow rows',
  )

  assertContains(submitSource, 'validateLegacyBondApplicationSubmission(bondApplicationDraft)')
  assertContains(validationSource, 'loan_processing_consent')
  assertContains(validationSource, 'credit_bureau_fraud_bank_data_consent')
  assertContains(validationSource, 'declaration_accepted')
  assertContains(validationSource, 'digital_signature_name')
  assertContains(validationSource, 'digital_signature_date')
  assertContains(validationSource, 'Please complete the declarations, consents, and digital signature')
  assertContains(validationSource, 'selected_banks')
  assertContains(validationSource, 'Select at least one bank before submitting your bond application.')
  assertContains(submitSource, 'status: \'Submitted\'')
  assertContains(submitSource, '{ submitted: true }')
}

function runViewModelContract() {
  const permanent = legacyBondApplicationFixtures.solePermanentEmployee
  const permanentApplication = permanent.sources.existingBondApplication
  const permanentViewModel = buildBondApplicationViewModel({
    transaction: permanent.sources.transactionInformation,
    buyer: permanent.sources.portalBuyer,
    development: permanent.sources.developmentInformation,
    unit: permanent.sources.unitInformation,
    onboarding: { status: permanentApplication.status },
    onboardingFormData: permanentApplication,
    documentRows: [
      { id: 'doc-id', name: 'ID document', status: 'uploaded', fileUrl: 'https://example.test/id.pdf' },
      { id: 'doc-income', name: 'Payslip income proof', status: 'uploaded', fileUrl: 'https://example.test/payslip.pdf' },
    ],
    requiredDocumentRows: [
      { id: 'required-bank', displayName: 'Latest bank statement', status: 'missing' },
    ],
    reference: 'BOND-PHASE0-001',
    statusLabel: permanentApplication.status,
  })

  assert.equal(permanentViewModel.applicant.fullName, 'Jordan Mokoena')
  assert.equal(permanentViewModel.applicant.employmentStatus, 'permanent_employee')
  assert.equal(permanentViewModel.property.developmentName, 'Sample Gardens')
  assert.equal(permanentViewModel.property.unitNumber, 'A-104')
  assert.equal(permanentViewModel.financials.purchasePrice.raw, 1850000)
  assert.equal(permanentViewModel.financials.bondAmountRequired.raw, 1665000)
  assert.ok(permanentViewModel.documents.some((document) => document.key === 'bankStatement'))

  const commitmentsFixture = legacyBondApplicationFixtures.financialCommitments
  const commitments = commitmentsFixture.sources.existingBondApplication
  const commitmentsViewModel = buildBondApplicationViewModel({
    transaction: commitmentsFixture.sources.transactionInformation,
    buyer: commitmentsFixture.sources.portalBuyer,
    development: commitmentsFixture.sources.developmentInformation,
    unit: commitmentsFixture.sources.unitInformation,
    onboarding: { status: commitments.status },
    onboardingFormData: commitments,
    reference: 'BOND-PHASE0-004',
    statusLabel: commitments.status,
  })

  assert.equal(commitmentsViewModel.application.status, 'Submitted')
  assert.equal(commitmentsViewModel.financials.existingDebt.raw, 1053500)
  assert.equal(commitmentsViewModel.financials.grossIncome.raw, 72000)
}

function runUnitDetailOffersGrantAndWorkflowContract() {
  const unitDetailSource = readFile('src/pages/UnitDetail.jsx')
  const clientPortalSource = readFile('src/pages/ClientPortal.jsx')

  assertContains(unitDetailSource, 'onboardingFormData?.formData?.bond_application')
  assertContains(unitDetailSource, 'primaryBondApplicant')
  assertContains(unitDetailSource, 'coBondApplicant')
  assertContains(unitDetailSource, 'selectedBondBanks')

  assertContains(clientPortalSource, "{ key: 'application', label: 'Application' }")
  assertContains(clientPortalSource, "{ key: 'offers', label: 'Offers' }")
  assertContains(clientPortalSource, "{ key: 'grant', label: 'Grant' }")
  assertContains(clientPortalSource, "activeBondApplicationTab === 'offers'")
  assertContains(clientPortalSource, "activeBondApplicationTab === 'grant'")

  const apiSource = readFile('src/lib/api.js')
  const upsertSource = sliceFunction(apiSource, 'async function upsertClientPortalOnboardingForm')
  assert.equal(upsertSource.includes('addBondApplication'), false)
  assert.equal(upsertSource.includes('ensureBondApplicationWorkspaceRecord'), false)
  assert.equal(upsertSource.includes('transaction_bond_applications'), false)
}

runFeatureFlagContract()
runFixtureContract()
runRouteAndCurrentExperienceContract()
runDraftConstructionContract()
runPersistenceAndSubmissionContract()
runViewModelContract()
runUnitDetailOffersGrantAndWorkflowContract()

console.log('Phase 0 guided bond application contracts passed')
