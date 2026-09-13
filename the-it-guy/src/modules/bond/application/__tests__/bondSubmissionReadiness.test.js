import assert from 'node:assert/strict'
import { createEmptyBondApplicationState, cloneBondApplicationValue, resolveBondApplicationDocumentRequirements, buildBondApplicationDocumentChecklist, resolveBondApplicationDeclarations, buildBondApplicationDeclarationEvidence, buildBondApplicationSubmissionSnapshot, resolveBondApplicationSignerIdentities, validateBondApplicationSubmissionReadiness, buildBondApplicationOriginatorPackManifest, buildNormalizedBondApplicationFromState, buildJointBondApplicationSubmissionSnapshot } from '../index.js'
import { buildBondApplicationViewModel } from '../../utils/bondApplicationViewModel.js'
import { getBondApplicationDocumentBuyerStatus } from '../documents/bondApplicationDocumentStatus.js'
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


const state = completeState()
const declarations = resolveBondApplicationDeclarations({ applicationState: state })
const declarationValues = Object.fromEntries(declarations.map((d) => [d.key, d.required]))
const checklist = completeChecklist(state)
const input = { applicationState: state, documentChecklist: checklist, declarations, declarationValues }
assert.equal(validateBondApplicationSubmissionReadiness(input).status, 'ready_to_sign')
assert.equal(validateBondApplicationSubmissionReadiness({ ...input, stage: 'bank_submission' }).ready, false)
const evidence = buildBondApplicationDeclarationEvidence({ declarations, values: declarationValues })
const snapshot = buildBondApplicationSubmissionSnapshot({ applicationState: state, declarations: evidence, signerIdentity: resolveBondApplicationSignerIdentities(state) })
const submission = { status: 'submitted', signed_at: '2026-09-13T10:00:00Z', snapshot_json: snapshot }
const ready = validateBondApplicationSubmissionReadiness({ ...input, stage: 'bank_submission', submission })
assert.equal(ready.ready, true, JSON.stringify(ready.issues))
assert.equal(ready.label, 'Ready for submission')
const changed = structuredClone(state)
changed.application.finance.requestedBondAmount = '1700000'
assert.ok(validateBondApplicationSubmissionReadiness({ ...input, applicationState: changed, stage: 'bank_submission', submission }).issues.some((i) => i.code === 'signed_version_not_current'))
const missingSignature = { ...submission, status: 'awaiting_signature', signed_at: null }
assert.ok(validateBondApplicationSubmissionReadiness({ ...input, stage: 'bank_submission', submission: missingSignature }).issues.some((i) => i.code === 'signatures_required'))
const unsignedDeclaration = structuredClone(submission)
unsignedDeclaration.snapshot_json.declarations.find((d) => d.required).accepted = false
assert.ok(validateBondApplicationSubmissionReadiness({ ...input, stage: 'bank_submission', submission: unsignedDeclaration }).issues.some((i) => i.code === 'required_declaration'))
const lateDocument = { requirement: { key: 'otp', title: 'Signed OTP', active: true, required: true, requiredBefore: 'required_before_bank_submission' }, complete: false, blocking: false }
const lateChecklist = { items: [...checklist.items, lateDocument] }
assert.equal(validateBondApplicationSubmissionReadiness({ ...input, documentChecklist: lateChecklist }).ready, true)
assert.ok(validateBondApplicationSubmissionReadiness({ ...input, documentChecklist: lateChecklist, stage: 'bank_submission', submission }).issues.some((i) => i.target === 'otp'))
assert.equal(validateBondApplicationSubmissionReadiness({ ...input, latestSaveStatus: 'saving' }).ready, false)
for (const status of ['rejected', 'superseded', 'cancelled', 'replacement_required']) {
  assert.notEqual(getBondApplicationDocumentBuyerStatus({ requirement: { active: true, minimumFileCount: 1, satisfactionMode: 'uploaded' }, matchedDocuments: [{ id: 'file', file_path: 'path', status }] }), 'satisfied')
}
assert.equal(getBondApplicationDocumentBuyerStatus({ requirement: { active: true, minimumFileCount: 1, satisfactionMode: 'uploaded' }, matchedDocuments: [{ id: 'old', status: 'rejected' }, { id: 'replacement', status: 'uploaded' }] }), 'satisfied')
assert.equal(getBondApplicationDocumentBuyerStatus({ requirement: { active: true, minimumFileCount: 1, satisfactionMode: 'accepted' }, matchedDocuments: [{ id: 'file', status: 'uploaded' }] }), 'uploaded_pending_review')
const draftPack = buildBondApplicationOriginatorPackManifest({ applicationState: state, snapshot, brand: { name: 'Originator', logoUrl: 'logo' }, mode: 'originator_ready' })
assert.equal(draftPack.ready, false)
assert.equal(buildBondApplicationOriginatorPackManifest({ applicationState: state, snapshot, brand: { name: 'Originator', logoUrl: 'logo' }, mode: 'originator_ready', readiness: ready }).ready, true)
const badIncome = structuredClone(state)
badIncome.participants.primaryApplicant.employment.has_additional_income = 'yes'
badIncome.participants.primaryApplicant.incomeSources = [{ type: 'invented', sourceName: 'Rent', monthlyAmount: 'abc' }]
// Use step validation to cover the conditionally visible income screen regardless of UI navigation.
const badResult = validateBondApplicationSubmissionReadiness({ ...input, applicationState: badIncome })
assert.ok(badResult.issues.some((i) => i.code === 'number'))
assert.ok(badResult.issues.some((i) => i.code === 'option'))
console.log('Bond submission readiness regression checks passed')

assert.equal(getBondApplicationDocumentBuyerStatus({ requirement: { active: true, minimumFileCount: 1, satisfactionMode: 'uploaded' }, matchedDocuments: [{ id: 'rejected-review', status: 'uploaded', review_status: 'rejected' }] }), 'rejected')

const normalized = buildNormalizedBondApplicationFromState({ applicationState: state })
normalized.activeSubmission = submission
const rows = checklist.items.flatMap((item) => item.documents)
const view = buildBondApplicationViewModel({ transaction: { id: state.application.transactionId }, bondApplication: normalized, documentRows: rows })
assert.equal(view.submissionReadiness.ready, true, JSON.stringify(view.submissionReadiness.issues))
assert.equal(view.application.readinessLabel, 'Ready for submission')
const unverifiedView = buildBondApplicationViewModel({ transaction: { id: state.application.transactionId, completion_percent: 100 }, bondApplication: { ...normalized, activeSubmission: null }, documentRows: rows })
assert.notEqual(unverifiedView.application.readinessLabel, 'Ready for submission')
assert.ok(unverifiedView.readinessItems.some((item) => item.key.startsWith('signatures_required')))

const jointState = structuredClone(state)
jointState.application.applicantStructure = 'joint'
jointState.participants.coApplicant = structuredClone(state.participants.primaryApplicant)
jointState.participants.coApplicant.contact.email = 'co@example.test'
const jointRequirements = resolveBondApplicationDocumentRequirements({ applicationState: jointState, includeAllParticipants: true }).activeRequirements
const coId = jointRequirements.find((r) => r.scope === 'participant' && r.participantRole === 'co_applicant' && r.title.includes('Identity'))
assert.ok(coId)
const primaryOnly = buildBondApplicationDocumentChecklist({ activeRequirements: [coId], existingDocuments: [{ id: 'primary-id', document_type: coId.canonicalDocumentType, status: 'uploaded', uploaded_by_role: 'client' }] })
assert.equal(primaryOnly.items[0].complete, false)
const coUpload = buildBondApplicationDocumentChecklist({ activeRequirements: [coId], existingDocuments: [{ id: 'co-id', document_type: coId.canonicalDocumentType, status: 'accepted', uploaded_by_role: 'co_applicant' }] })
assert.equal(coUpload.items[0].complete, true)
const negativeIncome = structuredClone(badIncome)
negativeIncome.participants.primaryApplicant.incomeSources[0] = { type: 'rental_income', sourceName: 'Rent', monthlyAmount: -1 }
assert.ok(validateBondApplicationSubmissionReadiness({ ...input, applicationState: negativeIncome }).issues.some((i) => i.code === 'negative_amount'))

const replacementChecklist = buildBondApplicationDocumentChecklist({ activeRequirements: [{ key: 'identity', title: 'ID', active: true, required: true, requiredBefore: 'required_before_signature', satisfactionMode: 'uploaded', minimumFileCount: 1, matching: { canonicalTypes: ['id'] } }], existingDocuments: [{ id: 'old', document_type: 'id', status: 'rejected' }, { id: 'new', document_type: 'id', status: 'uploaded' }] })
assert.equal(replacementChecklist.items[0].complete, true)
assert.equal(replacementChecklist.items[0].uploadedCount, 1)

// Joint snapshots use normalized section names; final downloads must compare them correctly.
const jointBundle = buildNormalizedBondApplicationFromState({ applicationState: jointState })
const jointEvidence = Object.fromEntries(jointBundle.participants.map((participant) => [participant.participantKey, buildBondApplicationDeclarationEvidence({ declarations: resolveBondApplicationDeclarations({ applicationState: jointState, participantRole: participant.role }), values: declarationValues, participantRole: participant.role, participantKey: participant.participantKey })]))
const jointSnapshot = buildJointBondApplicationSubmissionSnapshot({ normalizedApplication: jointBundle, declarationsByParticipant: jointEvidence, signerManifest: resolveBondApplicationSignerIdentities(jointState) })
const jointSubmission = { status: 'submitted', signed_at: '2026-09-13T10:00:00Z', snapshot_json: jointSnapshot, declarations_json: Object.values(jointEvidence).flat() }
const jointReady = validateBondApplicationSubmissionReadiness({ ...input, applicationState: jointState, stage: 'bank_submission', submission: jointSubmission })
assert.equal(jointReady.ready, true, JSON.stringify(jointReady.issues))
