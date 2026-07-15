import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES as R } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_SIGNING_AUTHORITY_BASES as A,
  CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
  CONVEYANCER_SIGNING_CAPACITY_TYPES as C,
  CONVEYANCER_SIGNING_PARTY_TYPES as P,
  buildConveyancerSigningCapacity,
  getConveyancerSigningCapacityDefinition,
} from '../../../core/documents/conveyancerSigningCapacityModel.js'
import { CONVEYANCER_SIGNING_PLAN_VERSION, buildConveyancerSigningPlan } from '../../../core/documents/conveyancerSigningPlan.js'
import {
  CONVEYANCER_FINANCIAL_LINE_CLASSES as LC,
  CONVEYANCER_FINANCIAL_LINE_STATUSES as LS,
  CONVEYANCER_FINANCIAL_LINE_TYPES as LT,
  CONVEYANCER_FINANCIAL_MODEL_VERSION,
  buildConveyancerFinancialModel,
} from '../../../core/transactions/conveyancerFinancialModel.js'
import { runConveyancerLegalInstrumentSigningPilotScenario } from '../conveyancerLegalInstrumentSigningAssurance.js'
import {
  CONVEYANCER_SIGNING_APPOINTMENT_ATTENDANCE_STATUSES as ATTENDANCE,
  CONVEYANCER_SIGNING_APPOINTMENT_COMMANDS as AC,
  buildConveyancerSigningAppointmentCommand,
  executeConveyancerSigningAppointmentWorkflow,
  startConveyancerSigningAppointmentWorkflow,
} from '../conveyancerSigningAppointmentWorkflow.js'
import {
  CONVEYANCER_SIGNED_PACK_REVIEW_COMMANDS as PC,
  CONVEYANCER_SIGNED_PACK_REVIEW_CONTROLS,
  buildConveyancerSignedPackReviewCommand,
  executeConveyancerSignedPackReview,
  startConveyancerSignedPackReview,
} from '../conveyancerSignedPackReview.js'
import {
  CONVEYANCER_FINANCIAL_RECONCILIATION_COMMANDS as RC,
  CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS,
  buildConveyancerFinancialReconciliationCommand,
  executeConveyancerFinancialReconciliation,
  startConveyancerFinancialReconciliation,
} from '../conveyancerFinancialReconciliation.js'
import {
  CONVEYANCER_FINAL_ACCOUNT_COMMANDS as FC,
  CONVEYANCER_FINAL_ACCOUNT_CONTROLS,
  buildConveyancerFinalAccountCommand,
  executeConveyancerFinalAccount,
  startConveyancerFinalAccount,
} from '../conveyancerFinalAccountWorkflow.js'
import {
  assureConveyancerDSeriesEvidence,
  buildConveyancerDSeriesPilotManifest,
  evaluateConveyancerDSeriesPilot,
  serializeConveyancerDSeriesAssuranceEvidence,
} from '../conveyancerDSeriesAssurance.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }
const NOW = '2026-07-15T15:00:00.000Z'
const HASH = 'd'.repeat(64)
const secretary = { role: R.secretary, userId: 'secretary-d8' }
const accounts = { role: R.accounts, userId: 'accounts-d8' }
const attorney = { role: R.transferAttorney, userId: 'attorney-d8' }
const reviewer = { role: R.transferAttorney, userId: 'reviewer-d8' }
const controls = (items) => Object.fromEntries(items.map((item) => [item.key, true]))

function signingTrack() {
  const pilot = runConveyancerLegalInstrumentSigningPilotScenario({ scenarioId: 'completed_transfer_signing', generatedAt: '2026-07-15T08:00:00.000Z', includeArtifacts: true })
  assert.equal(pilot.passed, true, JSON.stringify(pilot.errors))
  const c7 = structuredClone(pilot.artifacts)
  const document = c7.artifacts.document
  const signer = c7.signing.signerContract[0]
  const definition = getConveyancerSigningCapacityDefinition(C.conveyancer)
  const capacityResult = buildConveyancerSigningCapacity({
    modelVersion: CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION, capacityId: 'capacity:d8', recordVersion: 1,
    planId: document.planId, planVersion: document.planVersion, transactionId: document.transactionId,
    organisationId: document.organisationId, lane: document.lane, partyKey: 'party:d8', partyRole: 'legal_practitioner',
    partyType: P.legalPractitioner, signatoryKey: signer.signerKey, signatoryReferenceHash: signer.signerReferenceHash,
    capacityType: C.conveyancer, authorityBasis: A.professionalAppointment,
    scope: { documentKinds: [document.documentKind], documentKeys: [document.documentKey], powers: ['sign_documents'], effectiveFrom: '2026-07-01T00:00:00.000Z', effectiveUntil: '2026-12-31T23:59:59.000Z' },
    evidence: definition.requiredEvidence.map((requirementKey) => ({ requirementKey, referenceId: `evidence:${requirementKey}`, evidenceHash: HASH, status: 'verified', issuedAt: '2026-07-01T08:00:00.000Z', expiresAt: null, verifiedAt: '2026-07-15T08:09:00.000Z', verifiedBy: attorney, source: 'matter_record' })),
    capturedAt: '2026-07-15T08:08:00.000Z', capturedBy: secretary,
  }, { asOf: '2026-07-15T08:12:00.000Z' })
  assert.equal(capacityResult.ok, true, JSON.stringify(capacityResult.errors))
  const capacity = capacityResult.capacity
  const planResult = buildConveyancerSigningPlan({
    version: CONVEYANCER_SIGNING_PLAN_VERSION, signingPlanId: 'signing-plan:d8', revision: 1, document,
    routingMode: 'parallel', participants: [{ participantKey: 'participant:d8', signerKey: signer.signerKey, documentSignerRole: signer.signerRole, partyKey: capacity.partyKey, partyRole: capacity.partyRole, signerReferenceHash: signer.signerReferenceHash, capacityId: capacity.capacityId, signingOrder: signer.signingOrder, required: signer.required, allowedMethods: ['electronic'] }],
    preparedAt: '2026-07-15T08:10:00.000Z', preparedBy: secretary,
    approval: { approvedAt: '2026-07-15T08:11:00.000Z', approvedBy: attorney, decisionReferenceId: 'approval:d8:plan' },
  }, { capacityRecords: [capacity], asOf: '2026-07-15T08:12:00.000Z' })
  assert.equal(planResult.ok, true, JSON.stringify(planResult.errors))
  const plan = planResult.plan

  const appointmentEvents = []
  const proposed = startConveyancerSigningAppointmentWorkflow({ signingPlan: plan, capacityRecords: [capacity], appointmentId: 'appointment:d8', mode: 'in_person', selectedMethods: { [signer.signerKey]: 'electronic' }, slot: { startsAt: '2026-07-15T08:30:00.000Z', endsAt: '2026-07-15T09:00:00.000Z', timeZone: 'Africa/Johannesburg' }, venue: { type: 'attorney_office', referenceId: 'venue:d8', resourceId: 'room:d8' }, actor: secretary, occurredAt: '2026-07-15T08:13:00.000Z', commandId: 'appointment:start:d8' })
  assert.equal(proposed.ok, true, JSON.stringify(proposed.errors)); appointmentEvents.push(proposed.event)
  const runAppointment = (value, type, actor, payload, occurredAt) => {
    const result = executeConveyancerSigningAppointmentWorkflow({ appointment: value, command: buildConveyancerSigningAppointmentCommand(value, type, payload), actor, occurredAt, capacityRecords: [capacity] })
    assert.equal(result.ok, true, JSON.stringify(result.errors)); appointmentEvents.push(result.event); return result.appointment
  }
  let appointment = runAppointment(proposed.appointment, AC.recordResponse, { role: R.system, userId: 'portal-d8' }, { signerKey: signer.signerKey, response: 'accepted', responseReferenceId: 'rsvp:d8' }, '2026-07-15T08:14:00.000Z')
  appointment = runAppointment(appointment, AC.confirm, secretary, {}, '2026-07-15T08:15:00.000Z')
  appointment = runAppointment(appointment, AC.recordAttendance, secretary, { signerKey: signer.signerKey, attendanceStatus: ATTENDANCE.attended, attendanceReferenceId: 'attendance:d8' }, '2026-07-15T08:30:00.000Z')
  appointment = runAppointment(appointment, AC.complete, attorney, { outcomeReferenceId: 'outcome:d8' }, '2026-07-15T09:00:00.000Z')

  const field = document.renderModel.signingFields[0]
  const inspection = { inspectionId: 'inspection:d8', signedDocumentId: c7.signing.signedDocumentEvidence.signedDocumentId, signedDocumentVersionId: c7.signing.signedDocumentEvidence.signedDocumentVersionId, artifactHash: c7.signing.signedDocumentEvidence.finalArtifactHash, completionCertificateHash: c7.signing.signedDocumentEvidence.completionCertificateHash, pageCount: c7.signing.renderEvidence.pageCount, inspectedAt: '2026-07-15T09:05:00.000Z', inspectedBy: secretary, executionDatesConfirmed: true, legibilityConfirmed: true, unauthorisedAlterationsFound: false, fieldResults: [{ fieldKey: field.fieldKey, fieldType: field.fieldType, signerKey: signer.signerKey, status: 'valid', pageNumber: 3, evidenceReferenceHash: HASH }], originalsEvidence: [] }
  const reviewEvents = []
  const startedReview = startConveyancerSignedPackReview({ signingPlan: plan, capacityRecords: [capacity], signing: c7.signing, appointments: [appointment], inspection, actor: secretary, occurredAt: '2026-07-15T09:06:00.000Z', commandId: 'review:start:d8' })
  assert.equal(startedReview.ok, true, JSON.stringify(startedReview.errors)); reviewEvents.push(startedReview.event)
  const recommended = executeConveyancerSignedPackReview({ review: startedReview.review, command: buildConveyancerSignedPackReviewCommand(startedReview.review, PC.recommendAcceptance, { controls: controls(CONVEYANCER_SIGNED_PACK_REVIEW_CONTROLS), summary: 'Pack checked.' }), actor: attorney, occurredAt: '2026-07-15T09:10:00.000Z' })
  assert.equal(recommended.ok, true, JSON.stringify(recommended.errors)); reviewEvents.push(recommended.event)
  const accepted = executeConveyancerSignedPackReview({ review: recommended.review, command: buildConveyancerSignedPackReviewCommand(recommended.review, PC.accept, { decisionReferenceId: 'review:approval:d8', summary: 'Pack accepted.' }), actor: reviewer, occurredAt: '2026-07-15T09:15:00.000Z' })
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors)); reviewEvents.push(accepted.event)
  return { capacity, plan, appointment, appointmentEvents, review: accepted.review, reviewEvents }
}

function source(type, referenceId) { return { type, referenceId, evidenceHash: HASH, effectiveAt: '2026-07-15T08:00:00.000Z' } }
function financialLine(lineId, lineClass, lineType, amount, overrides = {}) { return { lineId, lineClass, lineType, label: lineId, liableParty: lineClass === LC.sellerDeduction ? 'seller' : 'buyer', recipientParty: lineClass === LC.funding ? 'trust_account' : 'attorney', amount, status: LS.confirmed, source: source(lineClass === LC.funding ? 'bank_confirmation' : 'invoice', `source:${lineId}`), ...overrides } }

function financialTrack() {
  const built = buildConveyancerFinancialModel({
    modelVersion: CONVEYANCER_FINANCIAL_MODEL_VERSION, financialModelId: 'financial-model:d8', revision: 1, planId: 'plan:d8', planVersion: 1, transactionId: 'transaction:d8', organisationId: 'organisation:d8', lane: 'transfer', currency: 'ZAR',
    consideration: { purchasePrice: '1000.00', taxTreatment: 'transfer_duty', source: source('signed_agreement', 'otp:d8') },
    lines: [financialLine('deposit', LC.funding, LT.deposit, '200.00', { status: LS.received, source: source('receipt', 'deposit:d8') }), financialLine('guarantee', LC.funding, LT.guarantee, '800.00', { source: source('guarantee', 'guarantee:d8') }), financialLine('transfer_cost', LC.buyerCharge, LT.professionalFee, '100.00'), financialLine('bond_settlement', LC.sellerDeduction, LT.bondSettlement, '300.00', { recipientParty: 'bank', source: source('bank_confirmation', 'settlement:d8') })],
    preparedAt: '2026-07-15T09:00:00.000Z', preparedBy: accounts, approval: { decisionReferenceId: 'approval:d8:model', summary: 'D5 approved.', approvedAt: '2026-07-15T10:00:00.000Z', approvedBy: attorney },
  }, { asOf: '2026-07-15T10:30:00.000Z' })
  assert.equal(built.ok, true, JSON.stringify(built.errors)); const model = built.model
  const statement = { statementId: 'statement:d8', accountReferenceHash: 'a'.repeat(64), periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-07-15T10:30:00.000Z', openingBalance: '800.00', closingBalance: '0.00', evidenceHash: 'b'.repeat(64), capturedAt: '2026-07-15T11:00:00.000Z', capturedBy: accounts }
  const entry = (entryId, entryKind, direction, amount, character, sourceType = 'trust_statement') => ({ entryId, entryKind, direction, amount, occurredAt: '2026-07-15T10:15:00.000Z', sourceType, sourceReferenceHash: character.repeat(64), evidenceHash: 'e'.repeat(64) })
  const entries = [entry('entry:deposit', 'cash', 'inflow', '200.00', '1'), entry('entry:guarantee', 'instrument', 'inflow', '800.00', '2', 'guarantee'), entry('entry:cost-in', 'cash', 'inflow', '100.00', '3'), entry('entry:cost-out', 'cash', 'outflow', '100.00', '4'), entry('entry:settlement', 'cash', 'outflow', '300.00', '5'), entry('entry:seller', 'cash', 'outflow', '700.00', '6')]
  const pairs = [['deposit', 'entry:deposit', 'line:deposit', '200.00'], ['guarantee', 'entry:guarantee', 'line:guarantee', '800.00'], ['cost-in', 'entry:cost-in', 'line:transfer_cost:collection', '100.00'], ['cost-out', 'entry:cost-out', 'line:transfer_cost:disbursement', '100.00'], ['settlement', 'entry:settlement', 'line:bond_settlement', '300.00'], ['seller', 'entry:seller', 'position:seller_base_proceeds', '700.00']]
  const allocations = pairs.map(([id, entryId, targetId, amount]) => ({ allocationId: `allocation:${id}`, entryId, targetId, amount, evidenceReferenceId: `evidence:${id}` }))
  const reconciliationEvents = []
  const started = startConveyancerFinancialReconciliation({ financialModel: model, statement, entries, allocations, actor: accounts, occurredAt: '2026-07-15T12:00:00.000Z', commandId: 'reconciliation:start:d8' })
  assert.equal(started.ok, true, JSON.stringify(started.errors)); reconciliationEvents.push(started.event)
  const recommended = executeConveyancerFinancialReconciliation({ reconciliation: started.reconciliation, command: buildConveyancerFinancialReconciliationCommand(started.reconciliation, RC.recommend, { controls: controls(CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS), summary: 'Reconciled.' }), actor: accounts, occurredAt: '2026-07-15T12:15:00.000Z' })
  assert.equal(recommended.ok, true, JSON.stringify(recommended.errors)); reconciliationEvents.push(recommended.event)
  const approved = executeConveyancerFinancialReconciliation({ reconciliation: recommended.reconciliation, command: buildConveyancerFinancialReconciliationCommand(recommended.reconciliation, RC.approve, { decisionReferenceId: 'approval:d8:reconciliation', summary: 'D6 approved.' }), actor: attorney, occurredAt: '2026-07-15T12:30:00.000Z' })
  assert.equal(approved.ok, true, JSON.stringify(approved.errors)); reconciliationEvents.push(approved.event)
  const reconciliation = approved.reconciliation

  const finalAccountEvents = []
  const accountStarted = startConveyancerFinalAccount({ financialModel: model, reconciliation, parties: { buyerPartyReferenceHash: 'd'.repeat(64), sellerPartyReferenceHash: 'e'.repeat(64) }, template: { templateKey: 'final_account', templateVersionId: 'final-account-template:v1', templateFingerprint: 'fnv1a_12345678', contentHash: 'c'.repeat(64), outputFormat: 'pdf', locale: 'en-ZA' }, actor: accounts, occurredAt: '2026-07-15T13:00:00.000Z', commandId: 'account:start:d8' })
  assert.equal(accountStarted.ok, true, JSON.stringify(accountStarted.errors)); finalAccountEvents.push(accountStarted.event)
  const accountRecommended = executeConveyancerFinalAccount({ finalAccount: accountStarted.finalAccount, command: buildConveyancerFinalAccountCommand(accountStarted.finalAccount, FC.recommend, { controls: controls(CONVEYANCER_FINAL_ACCOUNT_CONTROLS), summary: 'Accounts balance.' }), actor: accounts, occurredAt: '2026-07-15T13:15:00.000Z' })
  assert.equal(accountRecommended.ok, true, JSON.stringify(accountRecommended.errors)); finalAccountEvents.push(accountRecommended.event)
  const accountApproved = executeConveyancerFinalAccount({ finalAccount: accountRecommended.finalAccount, command: buildConveyancerFinalAccountCommand(accountRecommended.finalAccount, FC.approve, { decisionReferenceId: 'approval:d8:account', summary: 'Final account approved.' }), actor: attorney, occurredAt: '2026-07-15T13:30:00.000Z' })
  assert.equal(accountApproved.ok, true, JSON.stringify(accountApproved.errors)); finalAccountEvents.push(accountApproved.event)
  return { model, reconciliation, reconciliationEvents, finalAccount: accountApproved.finalAccount, finalAccountEvents }
}

function fixture() {
  const signing = signingTrack(); const financial = financialTrack()
  return { asOf: NOW, capacityRecords: [signing.capacity], signingPlans: [signing.plan], appointments: [signing.appointment], appointmentEvents: signing.appointmentEvents, signedPackReviews: [signing.review], signedPackReviewEvents: signing.reviewEvents, financialModels: [financial.model], reconciliations: [financial.reconciliation], reconciliationEvents: financial.reconciliationEvents, finalAccounts: [financial.finalAccount], finalAccountEvents: financial.finalAccountEvents }
}

test('assures a clean D1-D7 evidence chain', () => {
  const result = assureConveyancerDSeriesEvidence(fixture())
  assert.equal(result.decision, 'ready', JSON.stringify(result.findings))
  assert.equal(result.counts.events, 14)
  assert.equal(result.controls.readOnly, true)
  assert.equal(Object.isFrozen(result), true)
})

test('observes a valid non-complete matter state', () => {
  const value = fixture()
  value.appointments = []
  value.appointmentEvents = []
  const proposed = startConveyancerSigningAppointmentWorkflow({ signingPlan: value.signingPlans[0], capacityRecords: value.capacityRecords, appointmentId: 'appointment:observed:d8', mode: 'in_person', selectedMethods: { primary: 'electronic' }, slot: { startsAt: '2026-07-15T16:00:00.000Z', endsAt: '2026-07-15T16:30:00.000Z', timeZone: 'Africa/Johannesburg' }, venue: { type: 'attorney_office', referenceId: 'venue:observed:d8', resourceId: 'room:d8' }, actor: secretary, occurredAt: '2026-07-15T14:00:00.000Z', commandId: 'appointment:observed:d8' })
  assert.equal(proposed.ok, true, JSON.stringify(proposed.errors)); value.appointments = [proposed.appointment]; value.appointmentEvents = [proposed.event]
  const result = assureConveyancerDSeriesEvidence(value)
  assert.equal(result.decision, 'observe', JSON.stringify(result.findings))
  assert.ok(result.findings.some((item) => item.code === 'd3_appointment_not_completed'))
})

test('blocks tampered records and broken exact bindings', () => {
  const value = structuredClone(fixture()); value.financialModels[0].consideration.purchasePriceMinor += 1
  const result = assureConveyancerDSeriesEvidence(value)
  assert.equal(result.decision, 'blocked')
  assert.ok(result.findings.some((item) => item.code === 'd5_contract_invalid'))
})

test('blocks audit gaps, forged authority and side-effect attempts', () => {
  const gap = structuredClone(fixture()); gap.finalAccountEvents.splice(1, 1)
  assert.ok(assureConveyancerDSeriesEvidence(gap).findings.some((item) => item.code === 'd7_audit_chain_invalid'))
  const forged = structuredClone(fixture()); forged.reconciliationEvents[2].performedBy = { role: R.accounts, userId: 'forged-d8' }
  assert.ok(assureConveyancerDSeriesEvidence(forged).findings.find((item) => item.code === 'd6_audit_chain_invalid').details.some((item) => item.includes('authority_invalid')))
  const sideEffect = structuredClone(fixture()); sideEffect.signedPackReviewEvents[1].dispatchPerformed = true
  assert.ok(assureConveyancerDSeriesEvidence(sideEffect).findings.find((item) => item.code === 'd4_audit_chain_invalid').details.some((item) => item.includes('side_effect')))
})

test('uses fail-closed pilot thresholds and an observe band', () => {
  const ready = assureConveyancerDSeriesEvidence(fixture())
  const go = evaluateConveyancerDSeriesPilot({ scenarios: [{ scenarioId: 'clean', assurance: ready }], operationalMetrics: { matterExceptionRate: 0.05 }, thresholds: { maximumAuditGaps: 10 } })
  assert.equal(go.decision, 'go'); assert.equal(go.thresholds.maximumAuditGaps, 0)
  const observe = evaluateConveyancerDSeriesPilot({ scenarios: [{ scenarioId: 'clean', assurance: ready }], operationalMetrics: { matterExceptionRate: 0.2 } })
  assert.equal(observe.decision, 'observe')
  const hold = evaluateConveyancerDSeriesPilot({ scenarios: [{ scenarioId: 'clean', assurance: ready }], operationalMetrics: { bindingFailures: 1 } })
  assert.equal(hold.decision, 'hold')
})

test('builds a guarded pilot manifest and redacted evidence packet', () => {
  const assurance = assureConveyancerDSeriesEvidence(fixture())
  const manifest = buildConveyancerDSeriesPilotManifest({ firmIds: ['firm:d8'], lanes: ['transfer'], maximumMatters: 100, startsAt: '2026-07-16T08:00:00.000Z', endsAt: '2026-07-18T17:00:00.000Z', owners: { assurance: 'a', legal: 'l', financial: 'f', support: 's', rollback: 'r' } })
  assert.equal(manifest.valid, true); assert.equal(manifest.scope.maximumMatters, 25); assert.equal(manifest.controls.databaseWritesEnabled, false)
  const serialized = serializeConveyancerDSeriesAssuranceEvidence({ assurance, manifest })
  assert.equal(serialized.includes('purchasePriceMinor'), false)
  assert.equal(serialized.includes('partyReferenceHash'), false)
  assert.equal(serialized.includes('accountReferenceHash'), false)
})

console.log('D8 D-series assurance tests passed.')
