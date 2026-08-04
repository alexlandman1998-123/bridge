import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'


import {
  BOND_APPLICATION_CHANGE_REQUEST_EFFECTS,
  BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES,
  BOND_APPLICATION_CHANGE_REQUEST_STATUSES,
  BOND_APPLICATION_DECLARATIONS,
  BOND_APPLICATION_NORMALIZED_SCHEMA_VERSION,
  BOND_APPLICATION_PARTICIPANT_ROLES,
  BOND_APPLICATION_PARTICIPANT_STATUSES,
  BOND_APPLICATION_PHASE7_MAXIMUM_ACTIVE_SURETIES,
  BOND_APPLICATION_SURETY_DECLARATION_BLOCKER,
  BOND_APPLICATION_SURETY_DECLARATIONS_APPROVED,
  BOND_APPLICATION_STATUSES,
  buildJointBondApplicationSubmissionSnapshot,
  buildJointSignerManifest,
  buildNormalizedBondApplicationFromState,
  createBondApplicationChangeRequest,
  createEmptyBondApplicationState,
  createSuretyParticipant,
  filterChangeRequestForParticipant,
  loadNormalizedBondApplicationState,
  openBondApplicationRevision,
  replaceSuretyParticipant,
  resolveBondApplicationCapabilities,
  resolveBondApplicationDocumentRequirements,
  resolveBondApplicationFlow,
  resolveChangeRequestEffect,
  resolveGuidedBondApplicationChangeRequestsFlag,
  resolveGuidedBondApplicationSuretiesFlag,
  reviewChangeRequestItem,
  saveNormalizedBondApplicationSection,
  serializeRevisionEditScope,
  submitParticipantCorrections,
  supersedeBondApplicationSubmission,
  validateBondApplicationDeclarationAcceptance,
  validateSuretyCapacity,
  withdrawBondApplicationParticipant,
} from '../index.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDirectory, '../../../../..')

function readFile(relativePath) {
  const appPath = path.join(repoRoot, relativePath)
  if (fs.existsSync(appPath)) return fs.readFileSync(appPath, 'utf8')
  return fs.readFileSync(path.join(repoRoot, '..', relativePath), 'utf8')
}

function baseStateWithSurety() {
  const state = createEmptyBondApplicationState()
  state.application.transactionId = 'transaction-phase7'
  state.application.applicantStructure = 'sole'
  state.application.requiresSurety = 'yes'
  state.application.finance.purchasePrice = '2000000'
  state.application.finance.requestedBondAmount = '1800000'
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
  state.participants.sureties = [{
    personal: {
      first_name: 'Sam',
      surname: 'Surety',
      identity_number: '8001010000000',
    },
    contact: {
      email: 'surety@example.test',
    },
    employment: {
      occupation_status: 'permanent_employee',
      employer_name: 'Surety Employer',
    },
    financialPosition: {
      net_asset_position: 'positive',
    },
    bankAccounts: [{ id: 'surety-account', bankName: 'Bank S' }],
    credit: {
      has_debts: 'no',
    },
    relationshipToApplicant: 'family_member',
  }]
  return state
}

function normalizedWithSurety() {
  return buildNormalizedBondApplicationFromState({
    applicationState: baseStateWithSurety(),
    transactionId: 'transaction-phase7',
    onboardingFormDataId: 'onboarding-phase7',
  })
}

function runFlagTests() {
  assert.equal(resolveGuidedBondApplicationSuretiesFlag({ env: {}, config: {}, organisation: {}, transaction: {} }).enabled, false)
  assert.equal(resolveGuidedBondApplicationChangeRequestsFlag({ env: {}, config: {}, organisation: {}, transaction: {} }).enabled, false)
  assert.deepEqual(resolveBondApplicationCapabilities({
    guidedV2: true,
    participantsV1: false,
    suretiesV1: true,
    changeRequestsV1: true,
  }), {
    guidedV2: true,
    participantsV1: false,
    suretiesV1: false,
    changeRequestsV1: false,
    maximumActiveSureties: BOND_APPLICATION_PHASE7_MAXIMUM_ACTIVE_SURETIES,
  })
  assert.equal(resolveBondApplicationCapabilities({
    guidedV2: true,
    participantsV1: true,
    suretiesV1: true,
    changeRequestsV1: true,
  }).suretiesV1, true)
}

function runSuretyDomainPrivacyTests() {
  const normalized = normalizedWithSurety()
  assert.equal(BOND_APPLICATION_NORMALIZED_SCHEMA_VERSION, 'phase-7-v1')
  assert.ok(normalized.participants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety))
  assert.ok(normalized.participantSections['surety:1']?.financial_position)

  const primaryView = loadNormalizedBondApplicationState({
    normalizedApplication: normalized,
    viewerParticipantKey: 'primary_applicant:1',
    viewerRole: BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
  })
  assert.equal(primaryView.applicationState.participants.sureties.length, 0)
  assert.ok(primaryView.safeParticipants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety))

  const suretyView = loadNormalizedBondApplicationState({
    normalizedApplication: normalized,
    viewerParticipantKey: 'surety:1',
    viewerRole: BOND_APPLICATION_PARTICIPANT_ROLES.surety,
  })
  assert.equal(suretyView.applicationState.participants.primaryApplicant, null)
  assert.equal(suretyView.applicationState.participants.coApplicant, null)
  assert.equal(suretyView.applicationState.participants.sureties[0].personal.first_name, 'Sam')
  assert.equal(JSON.stringify(suretyView).includes('primary-account'), false)

  assert.equal(validateSuretyCapacity({ normalizedApplication: normalized, maximumActiveSureties: 1 }).valid, false)
  const created = createSuretyParticipant({
    normalizedApplication: buildNormalizedBondApplicationFromState({ applicationState: createEmptyBondApplicationState() }),
    displayName: 'New Surety',
    email: 'new.surety@example.test',
  })
  assert.equal(created.ok, true)
  assert.equal(created.participant.role, BOND_APPLICATION_PARTICIPANT_ROLES.surety)

  const withdrawn = withdrawBondApplicationParticipant({
    normalizedApplication: normalized,
    participantKey: 'surety:1',
  })
  assert.equal(withdrawn.ok, true)
  assert.equal(withdrawn.normalizedApplication.participants.find((item) => item.participantKey === 'surety:1').status, BOND_APPLICATION_PARTICIPANT_STATUSES.withdrawn)

  const replaced = replaceSuretyParticipant({
    normalizedApplication: withdrawn.normalizedApplication,
    previousParticipantKey: 'surety:1',
    replacement: {
      displayName: 'Replacement Surety',
      email: 'replacement@example.test',
    },
  })
  assert.equal(replaced.ok, true)
  assert.ok(replaced.normalizedApplication.participants.some((participant) => participant.participantKey === 'surety:2'))
}

function runSuretyFlowDocumentDeclarationTests() {
  const state = baseStateWithSurety()
  const suretyFlow = resolveBondApplicationFlow({
    applicationState: state,
    participantContext: {
      participantRole: BOND_APPLICATION_PARTICIPANT_ROLES.surety,
      participantKey: 'surety:1',
      participantPath: 'participants.sureties.0',
      canEditShared: false,
      canManageParticipants: false,
    },
  })
  assert.equal(suretyFlow.steps.some((step) => step.key === 'applicants'), false)
  assert.equal(suretyFlow.steps.some((step) => step.key === 'your_application'), false)

  const customSuretyRules = [{
    key: 'bond_application_surety_identity',
    ruleSetVersion: 'phase-7-test',
    scope: 'participant',
    participantRole: 'surety',
    canonicalDocumentType: 'buyer_id_document',
    title: 'Surety identity document',
    visibleWhen: true,
    requiredWhen: true,
    requiredBefore: 'required_before_signature',
    satisfactionMode: 'uploaded',
    minimumFileCount: 1,
  }]
  const documents = resolveBondApplicationDocumentRequirements({
    applicationState: state,
    documentRuleContract: customSuretyRules,
    participantContext: {
      participantRole: 'surety',
      participantKey: 'surety:1',
      participantPath: 'participants.sureties.0',
    },
  })
  assert.equal(documents.requiredRequirements[0].key, 'surety:1:bond_application_surety_identity')
  assert.equal(documents.requiredRequirements[0].participantRole, 'surety')

  assert.equal(BOND_APPLICATION_SURETY_DECLARATIONS_APPROVED, false)
  const suretyDeclarations = validateBondApplicationDeclarationAcceptance({
    declarations: BOND_APPLICATION_DECLARATIONS.filter((declaration) => (declaration.participantRoles || []).includes('surety')),
    values: {},
    participantRole: 'surety',
  })
  assert.equal(suretyDeclarations.valid, false)
  assert.equal(suretyDeclarations.issues[0].code, BOND_APPLICATION_SURETY_DECLARATION_BLOCKER.code)
}

function runChangeRequestRevisionTests() {
  const normalized = {
    ...normalizedWithSurety(),
    id: 'application-phase7',
    activeSubmissionId: 'submission-v1',
  }
  assert.equal(resolveChangeRequestEffect({
    targetType: 'document_requirement',
    targetScope: 'participant_documents',
  }).effect, BOND_APPLICATION_CHANGE_REQUEST_EFFECTS.supplementalOnly)
  assert.equal(resolveChangeRequestEffect({
    targetType: 'field',
    fieldPath: 'participants.primaryApplicant.employment.employer_name',
  }).effect, BOND_APPLICATION_CHANGE_REQUEST_EFFECTS.newSubmissionRequired)

  const request = createBondApplicationChangeRequest({
    normalizedApplication: normalized,
    requestedBy: 'originator-user',
    buyerVisibleSummary: 'Please update the requested details.',
    internalSummary: 'Internal review note',
    items: [
      {
        id: 'primary-income',
        participantKey: 'primary_applicant:1',
        participantId: 'primary-participant-id',
        targetScope: 'primary_applicant',
        targetType: 'field',
        sectionKey: 'employment_income',
        fieldPath: 'participants.primaryApplicant.employment.employer_name',
        buyerInstruction: 'Please confirm your employer name.',
        internalNote: 'Do not expose this note.',
      },
      {
        id: 'surety-doc',
        participantKey: 'surety:1',
        participantId: 'surety-participant-id',
        targetScope: 'participant_documents',
        targetType: 'document_requirement',
        documentRequirementKey: 'surety:1:identity',
        buyerInstruction: 'Please upload your identity document.',
      },
    ],
  })
  assert.equal(request.status, BOND_APPLICATION_CHANGE_REQUEST_STATUSES.sent)
  assert.equal(request.requiresNewSubmission, true)

  const primaryRequest = filterChangeRequestForParticipant({
    changeRequest: request,
    viewerParticipantKey: 'primary_applicant:1',
    viewerRole: BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
  })
  assert.equal(primaryRequest.items.length, 1)
  assert.equal(JSON.stringify(primaryRequest).includes('Do not expose'), false)

  const suretyRequest = filterChangeRequestForParticipant({
    changeRequest: request,
    viewerParticipantKey: 'surety:1',
    viewerRole: BOND_APPLICATION_PARTICIPANT_ROLES.surety,
  })
  assert.equal(suretyRequest.items.length, 1)
  assert.equal(suretyRequest.items[0].participantKey, 'surety:1')

  const opened = openBondApplicationRevision({
    normalizedApplication: normalized,
    changeRequest: request,
    baseSubmission: { id: 'submission-v1' },
    expectedActiveSubmissionId: 'submission-v1',
  })
  assert.equal(opened.ok, true)
  assert.equal(opened.normalizedApplication.status, BOND_APPLICATION_STATUSES.changesRequested)
  assert.equal(opened.normalizedApplication.revision, normalized.revision + 1)
  assert.deepEqual(opened.editScope['primary_applicant:1'].sections, ['employment_income'])

  const outOfScopeSave = saveNormalizedBondApplicationSection({
    normalizedApplication: opened.normalizedApplication,
    participantKey: 'primary_applicant:1',
    sectionKey: 'accounts_assets',
    answers: {},
    expectedSectionVersion: 0,
  })
  assert.equal(outOfScopeSave.ok, false)
  assert.equal(outOfScopeSave.reason, 'section_outside_revision_scope')

  const inScopeSave = saveNormalizedBondApplicationSection({
    normalizedApplication: opened.normalizedApplication,
    participantKey: 'primary_applicant:1',
    sectionKey: 'employment_income',
    answers: { employment: { employer_name: 'Correct Employer' } },
    expectedSectionVersion: 0,
  })
  assert.equal(inScopeSave.ok, true)

  const submitted = submitParticipantCorrections({ changeRequest: request, participantKey: 'primary_applicant:1' })
  assert.equal(submitted.ok, true)
  assert.equal(submitted.changeRequest.items.find((item) => item.id === 'primary-income').status, BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.awaitingReview)

  const reviewed = reviewChangeRequestItem({
    changeRequest: submitted.changeRequest,
    itemId: 'primary-income',
    action: 'accept',
    reviewedBy: 'originator-user',
  })
  assert.equal(reviewed.ok, true)
  assert.equal(reviewed.changeRequest.items.find((item) => item.id === 'primary-income').status, BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.accepted)

  const serialized = serializeRevisionEditScope(opened.editScope)
  assert.deepEqual(serialized['primary_applicant:1'].sections, ['employment_income'])
}

function runSnapshotSigningLineageTests() {
  const normalized = normalizedWithSurety()
  const signerManifest = buildJointSignerManifest({ normalizedApplication: normalized })
  assert.ok(signerManifest.some((signer) => signer.participantRole === 'surety'))
  assert.ok(signerManifest.find((signer) => signer.participantRole === 'surety').documentAssignments.includes('surety_undertaking'))

  const snapshot = buildJointBondApplicationSubmissionSnapshot({
    normalizedApplication: normalized,
    signerManifest,
    signingPackageManifest: [{
      documentRole: 'surety_undertaking',
      requiredSignerParticipantKeys: ['surety:1'],
    }],
    documentManifest: [{
      participantKey: 'surety:1',
      requirementKey: 'surety:1:identity',
    }],
  })
  assert.equal(snapshot.snapshotSchemaVersion, '3')
  assert.ok(snapshot.participants.some((participant) => participant.role === 'surety'))
  assert.equal(JSON.stringify(snapshot).includes('token'), false)
  assert.equal(JSON.stringify(snapshot).includes('internalNote'), false)

  const lineage = supersedeBondApplicationSubmission({
    previousSubmission: { id: 'submission-v1', status: 'submitted' },
    newSubmission: { id: 'submission-v2', status: 'submitted' },
    changeRequestId: 'change-request-1',
  })
  assert.equal(lineage.ok, true)
  assert.equal(lineage.previousSubmission.status, 'superseded')
  assert.equal(lineage.newSubmission.supersedesSubmissionId, 'submission-v1')
  assert.equal(lineage.newSubmission.revisionChangeRequestId, 'change-request-1')
}

function runMigrationBoundaryTests() {
  const migration = readFile('../supabase/migrations/202607280005_guided_bond_application_phase7_sureties_revisions.sql')
  assert.ok(migration.includes('bond_application_change_requests'))
  assert.ok(migration.includes('bond_application_change_request_items'))
  assert.ok(migration.includes("role in ('primary_applicant', 'co_applicant', 'surety')"))
  assert.ok(migration.includes('supersedes_submission_id'))
  assert.ok(migration.includes('transaction_bond_application_submission_documents'))
  assert.equal(migration.includes('transaction_bond_applications'), false)
  assert.equal(migration.toLowerCase().includes('ooba'), false)
  assert.equal(migration.toLowerCase().includes('bank-specific'), false)
}

async function main() {
  runFlagTests()
  runSuretyDomainPrivacyTests()
  runSuretyFlowDocumentDeclarationTests()
  runChangeRequestRevisionTests()
  runSnapshotSigningLineageTests()
  runMigrationBoundaryTests()
  console.log('Phase 7 sureties, change requests and revisions tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
