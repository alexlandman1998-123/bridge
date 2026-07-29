import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BOND_APPLICATION_NORMALIZED_STORAGE_MODE,
  BOND_APPLICATION_PARTICIPANT_ROLES,
  BOND_APPLICATION_PARTICIPANT_STATUSES,
  BOND_APPLICATION_STATUSES,
  BOND_APPLICATION_DECLARATIONS,
  GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG,
  buildApplicationStateFromNormalizedApplication,
  buildJointBondApplicationSubmissionSnapshot,
  buildJointSignerManifest,
  buildNormalizedBondApplicationFromState,
  calculateBondApplicationReviewContextHash,
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
  hashBondApplicationSnapshot,
  loadNormalizedBondApplicationState,
  markBondApplicationParticipantReady,
  projectNormalizedBondApplicationToLegacy,
  resolveBondApplicationDocumentRequirements,
  resolveBondApplicationMode,
  resolveBondApplicationSignerIdentities,
  resolveGuidedBondApplicationParticipantsFlag,
  saveNormalizedBondApplicationSection,
  validateBondApplicationDeclarationContract,
} from '../index.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDirectory, '../../../../..')

function readFile(relativePath) {
  const appPath = path.join(repoRoot, relativePath)
  if (fs.existsSync(appPath)) return fs.readFileSync(appPath, 'utf8')
  return fs.readFileSync(path.join(repoRoot, '..', relativePath), 'utf8')
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

function jointState() {
  let state = createEmptyBondApplicationState()
  state.application.transactionId = 'transaction-phase6'
  state.application.applicantStructure = 'joint'
  state.application.finance.purchasePrice = '2500000'
  state.application.finance.depositAmount = '200000'
  state.application.finance.requestedBondAmount = '2300000'
  state.application.selectedBankIds = ['bank-a']
  state.participants.primaryApplicant.personal.first_name = 'Primary'
  state.participants.primaryApplicant.personal.surname = 'Buyer'
  state.participants.primaryApplicant.personal.identity_number = '9001010000000'
  state.participants.primaryApplicant.contact.email = 'primary@example.test'
  state.participants.primaryApplicant.employment.occupation_status = 'permanent_employee'
  state.participants.primaryApplicant.employment.employer_name = 'Primary Employer'
  state.participants.primaryApplicant.expenses.gross_salary = '65000'
  state.participants.primaryApplicant.bankAccounts = [{ id: 'primary-account', bankName: 'Bank A' }]
  state.participants.primaryApplicant.credit.has_debts = 'no'
  state.participants.coApplicant = cloneBondApplicationValue(state.participants.primaryApplicant)
  state.participants.coApplicant.personal = {}
  state.participants.coApplicant.contact = {}
  state.participants.coApplicant.employment = {}
  state.participants.coApplicant.expenses = {}
  state.participants.coApplicant.bankAccounts = []
  state.participants.coApplicant.credit = {}
  state.participants.coApplicant.personal.first_name = 'Co'
  state.participants.coApplicant.personal.surname = 'Applicant'
  state.participants.coApplicant.personal.identity_number = '9101010000000'
  state.participants.coApplicant.contact.email = 'co@example.test'
  state.participants.coApplicant.employment.occupation_status = 'self_employed'
  state.participants.coApplicant.employment.business_name = 'Co Trading'
  state.participants.coApplicant.expenses.gross_salary = '45000'
  state.participants.coApplicant.bankAccounts = [{ id: 'co-account', bankName: 'Bank B' }]
  state.participants.coApplicant.credit.has_debts = 'no'
  state = setPath(state, 'participants.primaryApplicant.address.residential_address_city', 'Cape Town')
  state = setPath(state, 'participants.coApplicant.address.residential_address_city', 'Johannesburg')
  return state
}

async function runFlagAndModeTests() {
  const defaultFlag = resolveGuidedBondApplicationParticipantsFlag({ env: {}, config: {}, organisation: {}, transaction: {} })
  assert.equal(defaultFlag.enabled, false)
  assert.equal(defaultFlag.key, GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG)
  assert.equal(resolveGuidedBondApplicationParticipantsFlag({ config: { features: { [GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG]: true } } }).enabled, true)
  assert.deepEqual(
    resolveBondApplicationMode({ guidedFlowEnabled: true, participantFlowEnabled: false }).mode,
    'guided_legacy_storage',
  )
  assert.deepEqual(
    resolveBondApplicationMode({
      guidedFlowEnabled: true,
      participantFlowEnabled: true,
      requestedApplicantStructure: 'joint',
    }).mode,
    'guided_normalized_storage',
  )
  assert.equal(
    resolveBondApplicationMode({
      guidedFlowEnabled: true,
      participantFlowEnabled: true,
      requestedApplicantStructure: 'surety',
    }).mode,
    'legacy',
  )
}

async function runNormalizedDomainTests() {
  const normalized = buildNormalizedBondApplicationFromState({
    applicationState: jointState(),
    transactionId: 'transaction-phase6',
    onboardingFormDataId: 'onboarding-phase6',
    includeCoApplicant: true,
  })
  assert.equal(normalized.storageMode, BOND_APPLICATION_NORMALIZED_STORAGE_MODE)
  assert.equal(normalized.status, BOND_APPLICATION_STATUSES.draft)
  assert.equal(normalized.participants.length, 2)
  assert.ok(normalized.participants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant))
  assert.ok(normalized.participants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant))
  assert.ok(normalized.sharedSections.application_finance)
  assert.ok(normalized.participantSections['co_applicant:1']?.employment_income)

  const rebuilt = buildApplicationStateFromNormalizedApplication(normalized)
  assert.equal(rebuilt.participants.primaryApplicant.personal.first_name, 'Primary')
  assert.equal(rebuilt.participants.coApplicant.personal.first_name, 'Co')

  const primaryView = loadNormalizedBondApplicationState({
    normalizedApplication: normalized,
    viewerParticipantKey: 'primary_applicant:1',
    viewerRole: BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
  })
  assert.equal(primaryView.applicationState.participants.coApplicant, null)
  assert.ok(primaryView.safeParticipants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant))

  const coView = loadNormalizedBondApplicationState({
    normalizedApplication: normalized,
    viewerParticipantKey: 'co_applicant:1',
    viewerRole: BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant,
  })
  assert.equal(coView.applicationState.participants.primaryApplicant, null)
  assert.ok(coView.safeParticipants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant))

  const saved = saveNormalizedBondApplicationSection({
    normalizedApplication: normalized,
    participantKey: 'co_applicant:1',
    sectionKey: 'employment_income',
    scope: 'participant',
    expectedSectionVersion: 0,
    answers: { employment: { occupation_status: 'contract_employee', employer_name: 'New Co' } },
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.normalizedApplication.revision, 2)
  const stale = saveNormalizedBondApplicationSection({
    normalizedApplication: saved.normalizedApplication,
    participantKey: 'co_applicant:1',
    sectionKey: 'employment_income',
    scope: 'participant',
    expectedSectionVersion: 0,
    answers: {},
  })
  assert.equal(stale.ok, false)
}

async function runHashReadinessAndProjectionTests() {
  const normalized = buildNormalizedBondApplicationFromState({
    applicationState: jointState(),
    transactionId: 'transaction-phase6',
    onboardingFormDataId: 'onboarding-phase6',
    includeCoApplicant: true,
  })
  const hashA = await calculateBondApplicationReviewContextHash(normalized)
  const navigationOnly = { ...normalized, metadata: { currentScreen: 'documents' } }
  const hashB = await calculateBondApplicationReviewContextHash(navigationOnly)
  assert.equal(hashA, hashB)
  const changedSave = saveNormalizedBondApplicationSection({
    normalizedApplication: normalized,
    participantKey: 'primary_applicant:1',
    sectionKey: 'employment_income',
    scope: 'participant',
    expectedSectionVersion: 0,
    answers: { employment: { occupation_status: 'retired' } },
  })
  assert.equal(changedSave.ok, true)
  const changed = changedSave.normalizedApplication
  const hashC = await calculateBondApplicationReviewContextHash(changed)
  assert.notEqual(hashA, hashC)

  const primaryReady = markBondApplicationParticipantReady({
    normalizedApplication: normalized,
    participantKey: 'primary_applicant:1',
    reviewContextHash: hashA,
    declarationEvidence: [{ key: 'application_information_accuracy', participantRole: 'primary_applicant' }],
  })
  assert.equal(primaryReady.ok, true)
  assert.equal(primaryReady.allReady, false)
  assert.equal(primaryReady.normalizedApplication.participants.find((item) => item.participantKey === 'primary_applicant:1').status, BOND_APPLICATION_PARTICIPANT_STATUSES.readyForSubmission)

  const projection = projectNormalizedBondApplicationToLegacy({ normalizedApplication: normalized })
  assert.equal(projection._meta.normalized_bond_application.storage_mode, BOND_APPLICATION_NORMALIZED_STORAGE_MODE)
  assert.equal(projection.applicant_structure || projection.application?.applicantStructure || projection.summary?.applicant_structure, projection.applicant_structure || projection.application?.applicantStructure || projection.summary?.applicant_structure)
  assert.equal(JSON.stringify(projection).includes('token'), false)
}

async function runDocumentDeclarationAndSnapshotTests() {
  const state = jointState()
  const primaryRequirements = resolveBondApplicationDocumentRequirements({
    applicationState: state,
    participantContext: { participantRole: BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant, participantKey: 'primary_applicant:1' },
  }).activeRequirements
  const coRequirements = resolveBondApplicationDocumentRequirements({
    applicationState: state,
    participantContext: { participantRole: BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant, participantKey: 'co_applicant:1' },
  }).activeRequirements
  assert.ok(primaryRequirements.some((requirement) => requirement.key.startsWith('primary_applicant:1:')))
  assert.ok(coRequirements.some((requirement) => requirement.key.startsWith('co_applicant:1:')))
  assert.ok(!coRequirements.some((requirement) => requirement.key.startsWith('primary_applicant:1:')))

  const declarationValidation = validateBondApplicationDeclarationContract(BOND_APPLICATION_DECLARATIONS)
  assert.equal(declarationValidation.valid, true)
  assert.ok(BOND_APPLICATION_DECLARATIONS.every((item) => item.participantRoles.includes(BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant)))

  const normalized = buildNormalizedBondApplicationFromState({
    applicationState: state,
    transactionId: 'transaction-phase6',
    onboardingFormDataId: 'onboarding-phase6',
    includeCoApplicant: true,
  })
  const signerIdentities = resolveBondApplicationSignerIdentities(state)
  assert.equal(signerIdentities.length, 2)
  const signerManifest = buildJointSignerManifest({ normalizedApplication: normalized, signerIdentities })
  assert.equal(signerManifest.length, 2)
  assert.ok(signerManifest.some((signer) => signer.participantRole === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant))
  const snapshot = buildJointBondApplicationSubmissionSnapshot({
    normalizedApplication: {
      ...normalized,
      participants: normalized.participants.map((participant) => ({
        ...participant,
        declarations: [{ key: 'application_information_accuracy', participantRole: participant.role, accepted: true }],
      })),
    },
    signerManifest,
    submissionVersion: 1,
    reviewContextHash: await calculateBondApplicationReviewContextHash(normalized),
    source: { sourceHash: await hashBondApplicationSnapshot(projectNormalizedBondApplicationToLegacy({ normalizedApplication: normalized })) },
  })
  assert.equal(snapshot.snapshotSchemaVersion, '2')
  assert.equal(snapshot.participants.length, 2)
  assert.equal(snapshot.signerManifest.length, 2)
  assert.equal(JSON.stringify(snapshot).includes('signing_token'), false)
  assert.equal(JSON.stringify(snapshot).includes('portal_token'), false)
}

function runMigrationAndSourceTests() {
  const migration = readFile('supabase/migrations/202607280004_guided_bond_application_phase6_participants.sql')
  assert.ok(migration.includes('create table if not exists public.bond_applications'))
  assert.ok(migration.includes('create table if not exists public.bond_application_participants'))
  assert.ok(migration.includes('create table if not exists public.bond_application_sections'))
  assert.ok(migration.includes('create table if not exists public.bond_application_document_requirements'))
  assert.ok(migration.includes('token_hash'))
  assert.ok(migration.includes('enable row level security'))
  assert.ok(migration.includes('create extension if not exists pgcrypto'))
  assert.ok(migration.includes('bond_application_sections_client_portal_read'))
  assert.ok(migration.includes('bridge_has_bond_application_participant_token_access(ba.id, bond_application_sections.participant_id)'))
  assert.ok(migration.includes('bridge_prevent_bond_submission_snapshot_mutation'))
  assert.equal(migration.includes('bond_application_sureties'), false)
  assert.equal(migration.includes('transaction_bond_applications'), false)

  const apiSource = readFile('src/lib/api.js')
  assert.ok(apiSource.includes('hashBondApplicationParticipantToken'))
  assert.ok(apiSource.includes('inviteClientPortalBondApplicationCoApplicant'))
  assert.ok(apiSource.includes('prepareClientPortalJointBondApplicationSubmission'))
  assert.ok(apiSource.includes("'purchaser_2'"))
  assert.equal(apiSource.includes('bond_application_surety'), false)

  const guidedSource = readFile('src/modules/bond/application/guided/GuidedBondApplication.jsx')
  assert.ok(guidedSource.includes('Invite your co-applicant'))
  assert.ok(guidedSource.includes('participantModeEnabled'))
}

async function run() {
  await runFlagAndModeTests()
  await runNormalizedDomainTests()
  await runHashReadinessAndProjectionTests()
  await runDocumentDeclarationAndSnapshotTests()
  runMigrationAndSourceTests()
  console.log('Phase 6 participant/co-applicant tests passed')
}

run().catch((error) => {
  console.error(error)
  globalThis.process?.exit?.(1)
})
