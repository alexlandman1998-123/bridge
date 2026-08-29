import assert from 'node:assert/strict'

import {
  BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION,
  buildBondApplicationParticipantEntityCompleteness,
  buildApplicationStateFromNormalizedApplication,
  createEmptyBondApplicationState,
  fromLegacyBondApplication,
  toLegacyBondApplication,
  validateBondApplicationSubmissionReadiness,
} from '../index.js'

function participant(firstName = 'Nomsa') {
  return {
    personal: { first_name: firstName, surname: 'Dlamini', id_number: '9001010000000' },
    contact: { email: `${firstName.toLowerCase()}@example.test` },
    employment: { employment_type: 'permanent', gross_salary: '45000' },
    incomeSources: [],
    expenses: {},
  }
}

function completeCompanyState() {
  const state = createEmptyBondApplicationState()
  state.application.applicantStructure = 'joint'
  state.participants.coApplicant = participant('Thabo')
  state.application.buyerEntity = {
    ...state.application.buyerEntity,
    entityType: 'company',
    name: 'Example Property (Pty) Ltd',
    registrationNumber: '2026/123456/07',
    company: {
      directors: [{ name: 'Nomsa Dlamini', idNumber: '9001010000000' }],
      shareholders: [{ name: 'Nomsa Dlamini', percentage: 100 }],
      authorisedSignatories: [{ name: 'Nomsa Dlamini' }],
      resolution: { confirmed: true, documentId: 'document-resolution' },
    },
    trust: state.application.buyerEntity.trust,
  }
  return state
}

assert.equal(BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION, 'phase-4-v1')

const sole = createEmptyBondApplicationState()
sole.application.applicantStructure = 'sole'
assert.equal(buildBondApplicationParticipantEntityCompleteness(sole).complete, true)

const missingJoint = createEmptyBondApplicationState()
missingJoint.application.applicantStructure = 'joint'
assert.ok(buildBondApplicationParticipantEntityCompleteness(missingJoint).blockingIssues.some((item) => item.code === 'co_applicant_required'))

const company = completeCompanyState()
assert.equal(buildBondApplicationParticipantEntityCompleteness(company).complete, true)
company.application.buyerEntity.company.shareholders = []
assert.ok(buildBondApplicationParticipantEntityCompleteness(company).blockingIssues.some((item) => item.code === 'company_shareholding_required'))

const trust = createEmptyBondApplicationState()
trust.application.buyerEntity = {
  ...trust.application.buyerEntity,
  entityType: 'trust',
  name: 'Dlamini Family Trust',
  registrationNumber: 'IT1234/2026',
  trust: {
    trustees: [{ name: 'Nomsa Dlamini', identityNumber: '9001010000000' }],
    beneficialOwners: [],
    authorisedSignatories: [{ name: 'Nomsa Dlamini' }],
    lettersOfAuthority: { documentId: 'loa-document' },
    trustDeed: { documentId: 'deed-document' },
    resolution: { confirmed: true },
  },
}
assert.equal(buildBondApplicationParticipantEntityCompleteness(trust).complete, true)
trust.application.buyerEntity.trust.lettersOfAuthority = {}
assert.ok(buildBondApplicationParticipantEntityCompleteness(trust).blockingIssues.some((item) => item.code === 'trust_letters_of_authority_required'))

const surety = createEmptyBondApplicationState()
surety.application.applicantStructure = 'surety'
assert.ok(buildBondApplicationParticipantEntityCompleteness(surety).blockingIssues.some((item) => item.code === 'surety_required'))
surety.participants.sureties = [participant('Lerato')]
assert.equal(buildBondApplicationParticipantEntityCompleteness(surety).complete, true)

const legacy = {
  summary: {
    buyer_entity_type: 'company',
    buyer_entity_name: 'Round Trip (Pty) Ltd',
    buyer_entity_registration_number: '2026/654321/07',
  },
  company: {
    director_names: [{ name: 'Director One', id_number: '8001010000000' }],
    shareholding_structure: [{ name: 'Shareholder One', percentage: 100 }],
    authorised_signatories: [{ name: 'Director One' }],
    resolution_document: { document_id: 'resolution-1' },
  },
}
const mapped = fromLegacyBondApplication(legacy)
assert.deepEqual(mapped.application.buyerEntity.company.directors, legacy.company.director_names)
assert.deepEqual(toLegacyBondApplication(mapped).company.shareholding_structure, legacy.company.shareholding_structure)

const normalizedState = buildApplicationStateFromNormalizedApplication({
  sharedSections: {
    applicant_structure: { applicantStructure: 'joint' },
    buyer_entity: createEmptyBondApplicationState().application.buyerEntity,
  },
  participants: [],
  participantSections: {},
})
assert.ok(normalizedState.participantEntityCompleteness.blockingIssues.some((item) => item.code === 'co_applicant_required'))

const readinessState = completeCompanyState()
readinessState.application.buyerEntity.company.resolution = {}
readinessState.participantEntityCompleteness = buildBondApplicationParticipantEntityCompleteness(readinessState)
const readiness = validateBondApplicationSubmissionReadiness({
  applicationState: readinessState,
  documentChecklist: { requirements: [], matches: [] },
  selectedBankIds: ['bank-1'],
  signerIdentity: { participantRole: 'primary_applicant', fullName: 'Nomsa Dlamini', email: 'nomsa@example.test' },
  latestSaveStatus: 'saved',
  requireSelectedBank: false,
})
assert.ok(readiness.issues.some((item) => item.category === 'participant_entity' && item.code === 'company_resolution_required'))

console.log('Phase 4 participant and entity completeness passed')
