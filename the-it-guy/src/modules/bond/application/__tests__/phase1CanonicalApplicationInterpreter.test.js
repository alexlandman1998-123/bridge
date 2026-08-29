import assert from 'node:assert/strict'

import {
  BOND_APPLICATION_INTERPRETER_VERSION,
  buildBondApplicationState,
  cloneBondApplicationValue,
  interpretBondApplicationState,
  resolveBondApplicationDocumentRequirements,
  validateBondApplicationSubmissionReadiness,
} from '../index.js'
import { legacyBondApplicationFixtures } from '../__fixtures__/legacyBondApplicationFixtures.js'

const permanentPortal = cloneBondApplicationValue(legacyBondApplicationFixtures.solePermanentEmployee.portal)
const permanentState = buildBondApplicationState(permanentPortal)

assert.equal(permanentState.interpretation.version, BOND_APPLICATION_INTERPRETER_VERSION)
assert.equal(permanentState.interpretation.status, 'trusted')
assert.equal(permanentState.interpretation.decisions.applicantStructure, 'sole')
assert.equal(permanentState.interpretation.decisions.buyerEntityType, 'individual')
assert.equal(permanentState.interpretation.decisions.primaryEmploymentType, 'permanent')
assert.equal(permanentState.participants.primaryApplicant.employment.occupation_status, 'permanent_employee')
assert.match(permanentState.interpretation.decisionFingerprint, /^phase-1-v1:[a-f0-9]{8}$/)
assert.equal(permanentState.interpretation.lineage.purchasePrice.sourceKey, 'saved_bond_application')

const repeatInterpretation = interpretBondApplicationState({
  applicationState: permanentState,
  rawApplication: permanentState.compatibility.legacyBase,
  prefillMetadata: permanentState.compatibility.legacyBase.prefill_metadata,
})
assert.equal(repeatInterpretation.decisionFingerprint, permanentState.interpretation.decisionFingerprint)
assert.deepEqual(repeatInterpretation.decisions, permanentState.interpretation.decisions)

const aliasState = cloneBondApplicationValue(permanentState)
aliasState.interpretation = undefined
aliasState.application.applicantStructure = 'single'
aliasState.application.buyerEntity.entityType = 'natural person'
aliasState.application.intent = 'bond'
aliasState.participants.primaryApplicant.employment.occupation_status = 'full time employed'
aliasState.compatibility.legacyBase = {}
const aliasStateSnapshot = cloneBondApplicationValue(aliasState)
const aliasInterpretation = interpretBondApplicationState({ applicationState: aliasState, rawApplication: {} })
assert.equal(aliasInterpretation.status, 'trusted')
assert.equal(aliasInterpretation.decisions.applicantStructure, 'sole')
assert.equal(aliasInterpretation.decisions.buyerEntityType, 'individual')
assert.equal(aliasInterpretation.decisions.primaryEmploymentType, 'permanent')
assert.deepEqual(aliasState, aliasStateSnapshot)

const unsupportedState = cloneBondApplicationValue(permanentState)
unsupportedState.interpretation = undefined
unsupportedState.compatibility.legacyBase.summary.buyer_entity_type = 'stokvel_collective'
unsupportedState.compatibility.legacyBase.employment.primary.occupation_status = 'crypto_yield_farmer'
const unsupported = interpretBondApplicationState({
  applicationState: unsupportedState,
  rawApplication: unsupportedState.compatibility.legacyBase,
})
assert.equal(unsupported.status, 'review_blocked')
assert.equal(unsupported.trusted, false)
assert.ok(unsupported.blockingIssues.some((item) => item.code === 'unsupported_buyer_entity_type'))
assert.ok(unsupported.blockingIssues.some((item) => item.code === 'unsupported_primary_employment_type'))
assert.equal(unsupported.applicationState.application.buyerEntity.entityType, null)
const unsupportedDocuments = resolveBondApplicationDocumentRequirements({
  applicationState: unsupported.applicationState,
})
assert.equal(unsupportedDocuments.interpretationTrusted, false)
assert.equal(unsupportedDocuments.decisionFingerprint, unsupported.decisionFingerprint)
assert.ok(unsupportedDocuments.diagnostics.some((item) => item.source === 'canonical_application_interpreter'))

const jointPortal = cloneBondApplicationValue(legacyBondApplicationFixtures.jointApplication.portal)
const jointState = buildBondApplicationState(jointPortal)
assert.equal(jointState.interpretation.decisions.applicantStructure, 'joint')
assert.equal(jointState.interpretation.decisions.participants.coApplicantCount, 1)
assert.equal(jointState.interpretation.decisions.coApplicantEmploymentType, 'contract')

const missingCoApplicant = cloneBondApplicationValue(jointState)
missingCoApplicant.participants.coApplicant = null
const missingCoApplicantInterpretation = interpretBondApplicationState({
  applicationState: missingCoApplicant,
  rawApplication: {
    ...missingCoApplicant.compatibility.legacyBase,
    applicants: missingCoApplicant.compatibility.legacyBase.applicants.filter((item) => item.key !== 'co_applicant'),
  },
})
assert.ok(missingCoApplicantInterpretation.blockingIssues.some((item) => item.code === 'co_applicant_missing'))

const submissionReadiness = validateBondApplicationSubmissionReadiness({
  applicationState: unsupported.applicationState,
  documentChecklist: { items: [] },
  selectedBankIds: ['bank-1'],
  signerIdentity: { fullName: 'Test Applicant', email: 'test@example.com', participantRole: 'primary_applicant' },
  declarations: [],
  declarationValues: {},
  latestSaveStatus: 'saved',
})
assert.equal(submissionReadiness.ready, false)
assert.ok(submissionReadiness.issues.some((item) => item.category === 'interpretation'))

console.log('Phase 1 canonical bond application interpreter passed')
