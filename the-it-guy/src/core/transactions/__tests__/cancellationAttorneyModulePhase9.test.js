import assert from 'node:assert/strict'
import {
  CANCELLATION_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID,
  CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY,
  CANCELLATION_SETTLEMENT_PACKET_STATUSES,
  CANCELLATION_SETTLEMENT_REQUIREMENT_KEYS,
  buildCancellationAttorneyPhase9BaselineReport,
  buildCancellationSettlementCloseoutNextActions,
  buildCancellationSettlementCloseoutPacket,
  listCancellationSettlementRequirementKeys,
  validateCancellationSettlementCloseoutPacket,
} from '../cancellationAttorneyModulePhase9.js'
import { buildCancellationPackWorkspace } from '../cancellationAttorneyModulePhase3.js'
import { buildCancellationFiguresRegister } from '../cancellationAttorneyModulePhase5.js'
import { buildCancellationGuaranteeWorkspace } from '../cancellationAttorneyModulePhase6.js'
import {
  buildApprovedCancellationDocumentTemplate,
  buildCancellationDocumentSigningWorkspace,
  listCancellationTemplateControlledDocumentKeys,
} from '../cancellationAttorneyModulePhase7.js'
import { buildCancellationLodgementEvidencePacket } from '../cancellationAttorneyModulePhase8.js'

const settlementAmount = 1234567.89

const verified = (value, overrides = {}) => ({
  value,
  sourceId: overrides.sourceId || 'source-cancellation-pack-1',
  capturedAt: overrides.capturedAt || '2026-07-10T09:00:00.000Z',
  verifiedAt: overrides.verifiedAt || '2026-07-10T10:00:00.000Z',
  verifiedBy: overrides.verifiedBy || { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  expiresAt: overrides.expiresAt || null,
})

const beneficiaryAndWording = Object.freeze({
  beneficiary: 'FNB Home Loans',
  wording: 'payable to existing lender on registration',
})

const completeEvidence = (overrides = {}) => ({
  seller_existing_bond_status: verified('existing_bond_confirmed'),
  cancellation_bank: verified('FNB'),
  cancellation_bond_account_number: verified('FNB-HL-2026-001'),
  lender_instruction_reference: verified('FNB-CAN-2026-77'),
  cancellation_instruction_received_at: verified('2026-07-10'),
  notice_period_status: verified('notice_served'),
  notice_date: verified('2026-05-01'),
  cancellation_figures_amount: verified(settlementAmount, { sourceId: 'figures-fnb-1', expiresAt: '2026-08-15T00:00:00.000Z' }),
  cancellation_figures_expiry_date: verified('2026-08-15T00:00:00.000Z', { sourceId: 'figures-fnb-1' }),
  daily_interest_amount: verified(0, { sourceId: 'figures-fnb-1' }),
  penalty_notice_risk: verified('none'),
  guarantee_required_amount: verified(settlementAmount),
  guarantee_beneficiary_and_wording: verified(beneficiaryAndWording),
  guarantee_reference: verified('GTY-CAN-2026-11'),
  guarantee_acceptance_status: verified('accepted'),
  seller_cancellation_signing_requirement: verified({ required: true, method: 'wet_ink', originalRequired: true }),
  signed_cancellation_document_status: verified('signed_originals_received'),
  lodgement_reference: verified('LOD-CAN-2026-101'),
  lodgement_date: verified('2026-08-02'),
  cancellation_registration_reference: verified('REG-CAN-2026-44'),
  cancellation_registration_date: verified('2026-08-05'),
  settlement_amount: verified(settlementAmount),
  settlement_payment_reference: verified('PAY-CAN-2026-55'),
  closeout_status: verified('complete'),
  ...overrides,
})

const guaranteeEvidence = [
  { requirementKey: 'guarantee_document', status: 'verified', referenceId: 'doc-guarantee-1', artifactHash: 'hash-guarantee-1', capturedAt: '2026-07-14T09:00:00.000Z', verifiedAt: '2026-07-14T10:00:00.000Z' },
  { requirementKey: 'wording_review', status: 'verified', referenceId: 'decision-wording-1', capturedAt: '2026-07-14T10:00:00.000Z', verifiedAt: '2026-07-14T11:00:00.000Z' },
  { requirementKey: 'cancellation_acceptance_decision', status: 'verified', referenceId: 'decision-acceptance-1', capturedAt: '2026-07-14T11:00:00.000Z', verifiedAt: '2026-07-14T12:00:00.000Z' },
]

const readyDocumentEvidence = [
  {
    documentKey: 'bank_cancellation_documents',
    evidence: [
      { requirementKey: 'governed_template_binding', status: 'verified', referenceId: 'template-bank-cancellation-v1' },
      { requirementKey: 'bank_cancellation_document_prepared', status: 'verified', referenceId: 'doc-bank-cancellation-1' },
    ],
  },
  {
    documentKey: 'cancellation_consent',
    evidence: [
      { requirementKey: 'seller_signature', status: 'verified', referenceId: 'signature-consent-1' },
      { requirementKey: 'original_signed_document', status: 'verified', referenceId: 'vault-consent-original-1' },
    ],
  },
  {
    documentKey: 'bond_discharge_or_cancellation_instrument',
    evidence: [
      { requirementKey: 'governed_template_binding', status: 'verified', referenceId: 'template-discharge-v1' },
      { requirementKey: 'seller_signature', status: 'verified', referenceId: 'signature-discharge-1' },
    ],
  },
  {
    documentKey: 'seller_authority_resolution_for_cancellation',
    evidence: [
      { requirementKey: 'seller_authority_evidence', status: 'waived', reason: 'Individual seller pilot; no separate authority resolution required.' },
    ],
  },
]

const lodgementEvidence = [
  {
    requirementKey: 'simultaneous_lodgement_readiness_evidence',
    status: 'verified',
    sourceType: 'transfer_attorney_confirmation',
    referenceId: 'doc-simultaneous-lodgement-ready-1',
    externalReference: 'TRANSFER-LODGE-READY-2026-1',
    capturedAt: '2026-08-01T08:00:00.000Z',
    verifiedAt: '2026-08-01T09:00:00.000Z',
    verifiedBy: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  },
  {
    requirementKey: 'lodgement_evidence',
    status: 'verified',
    sourceType: 'cancellation_attorney_upload',
    referenceId: 'doc-cancellation-lodgement-1',
    externalReference: 'LOD-CAN-2026-101',
    capturedAt: '2026-08-02T08:00:00.000Z',
    verifiedAt: '2026-08-02T09:00:00.000Z',
    verifiedBy: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  },
  {
    requirementKey: 'cancellation_registration_evidence',
    status: 'verified',
    sourceType: 'deeds_office_notice',
    referenceId: 'doc-cancellation-registration-1',
    externalReference: 'REG-CAN-2026-44',
    capturedAt: '2026-08-05T08:00:00.000Z',
    verifiedAt: '2026-08-05T09:00:00.000Z',
    verifiedBy: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  },
]

const settlementEvidence = [
  {
    requirementKey: 'settlement_payment_evidence',
    status: 'verified',
    sourceType: 'proof_of_payment_upload',
    referenceId: 'doc-proof-of-settlement-1',
    externalReference: 'PAY-CAN-2026-55',
    paymentReference: 'PAY-CAN-2026-55',
    amount: settlementAmount,
    paidAt: '2026-08-05T12:00:00.000Z',
    capturedAt: '2026-08-05T13:00:00.000Z',
    verifiedAt: '2026-08-05T14:00:00.000Z',
    verifiedBy: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  },
  {
    requirementKey: 'lender_settlement_confirmation',
    status: 'verified',
    sourceType: 'existing_lender_email',
    referenceId: 'doc-lender-settlement-confirmation-1',
    externalReference: 'PAY-CAN-2026-55',
    paymentReference: 'PAY-CAN-2026-55',
    registrationReference: 'REG-CAN-2026-44',
    capturedAt: '2026-08-05T15:00:00.000Z',
    verifiedAt: '2026-08-05T16:00:00.000Z',
    verifiedBy: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  },
  {
    requirementKey: 'closeout_review_evidence',
    status: 'verified',
    sourceType: 'cancellation_attorney_upload',
    referenceId: 'doc-settlement-closeout-report-1',
    externalReference: 'CLOSEOUT-CAN-2026-1',
    unresolvedExceptionCount: 0,
    capturedAt: '2026-08-05T17:00:00.000Z',
    verifiedAt: '2026-08-05T18:00:00.000Z',
    verifiedBy: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  },
]

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['settlementEvidence', 'evidence', 'facts', 'value', 'amount', 'documents', 'templates', 'template', 'body', 'sections', 'clauses'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.deepEqual(listCancellationSettlementRequirementKeys(), [
  'settlement_payment_evidence',
  'lender_settlement_confirmation',
  'closeout_review_evidence',
])
assert.equal(CANCELLATION_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID, 'settlement_closeout_packet_missing')
assert.equal(CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.executesSettlementPayment, false)
assert.equal(CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.synthesizesPaymentConfirmation, false)
assert.equal(CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.synthesizesLenderDischarge, false)
assert.equal(CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.marksCloseoutFromStageOnly, false)
assert.equal(CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.mutatesMatter, false)

const templates = listCancellationTemplateControlledDocumentKeys().reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedCancellationDocumentTemplate(documentKey),
}), {})

const workspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase9' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const figuresRegister = buildCancellationFiguresRegister({
  workspace,
  settlementDate: '2026-08-05',
  figures: [{
    figureId: 'figures-ready-1',
    status: 'verified',
    amount: settlementAmount,
    expiryDate: '2026-08-15',
    dailyInterestAmount: 0,
    penaltyNoticeRisk: 'none',
    penaltyReviewed: true,
    guaranteeRequiredAmount: settlementAmount,
    guaranteeBeneficiaryAndWording: beneficiaryAndWording,
    sourceReference: 'figures-fnb-1',
  }],
  generatedAt: '2026-07-15T09:00:00.000Z',
  asOf: '2026-07-15T09:00:00.000Z',
})
assert.equal(figuresRegister.readyForPhase6, true)

const guaranteeWorkspace = buildCancellationGuaranteeWorkspace({
  workspace,
  figuresRegister,
  guarantees: [{
    guaranteeId: 'guarantee-ready-1',
    reference: 'GTY-CAN-2026-11',
    status: 'accepted',
    amount: settlementAmount,
    requiredAmount: settlementAmount,
    beneficiaryAndWording,
    expectedBeneficiaryAndWording: beneficiaryAndWording,
    acceptanceReviewed: true,
    expiresAt: '2026-08-20',
    evidence: guaranteeEvidence,
  }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-guarantee-ready',
  generatedAt: '2026-07-15T10:30:00.000Z',
})
const documentSigningWorkspace = buildCancellationDocumentSigningWorkspace({
  workspace,
  guaranteeWorkspace,
  templates,
  documents: readyDocumentEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-document-signing-ready',
  generatedAt: '2026-07-15T11:00:00.000Z',
  asOf: '2026-07-15T11:00:00.000Z',
})
assert.equal(documentSigningWorkspace.readyForPhase8, true)

const lodgementPacket = buildCancellationLodgementEvidencePacket({
  workspace,
  documentSigningWorkspace,
  packetEvidence: lodgementEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-lodgement-packet',
  generatedAt: '2026-08-05T10:00:00.000Z',
  asOf: '2026-08-05T10:00:00.000Z',
})
assert.equal(lodgementPacket.readyForPhase9, true)

const packet = buildCancellationSettlementCloseoutPacket({
  workspace,
  figuresRegister,
  lodgementPacket,
  settlementEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-1',
  generatedAt: '2026-08-05T19:00:00.000Z',
  asOf: '2026-08-05T19:00:00.000Z',
})
assert.equal(packet.validation.valid, true, JSON.stringify(packet.validation.errors, null, 2))
assert.equal(packet.status, CANCELLATION_SETTLEMENT_PACKET_STATUSES.closed)
assert.equal(packet.readyForPhase10, true)
assert.equal(packet.metrics.requirementCount, 3)
assert.equal(packet.metrics.satisfiedCount, 3)
assert.equal(packet.metrics.amountMismatchCount, 0)
assert.equal(packet.records.find((record) => record.requirementKey === CANCELLATION_SETTLEMENT_REQUIREMENT_KEYS.settlementPaymentEvidence).satisfied, true)
assert.equal(packet.nextActions.length, 0)
assert.equal(packet.auditEvent.eventType, 'cancellation_settlement_closeout_packet_prepared')
assert.equal(packet.auditEvent.releaseBlockerId, CANCELLATION_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID)
assert.equal(packet.auditEvent.readyForPhase10, true)
assert.equal(containsForbiddenAuditPayload(packet.auditEvent), false)

const missingSettlementProofPacket = buildCancellationSettlementCloseoutPacket({
  workspace,
  figuresRegister,
  lodgementPacket,
  settlementEvidence: settlementEvidence.filter((item) => item.requirementKey !== 'settlement_payment_evidence'),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-2',
  generatedAt: '2026-08-05T19:10:00.000Z',
  asOf: '2026-08-05T19:10:00.000Z',
})
assert.equal(missingSettlementProofPacket.validation.valid, false)
assert.equal(missingSettlementProofPacket.readyForPhase10, false)
assert.equal(missingSettlementProofPacket.metrics.missingEvidenceCount, 1)
assert.ok(missingSettlementProofPacket.validation.errors.includes('settlement_payment_evidence:settlement_evidence_missing'))
assert.equal(buildCancellationSettlementCloseoutNextActions(missingSettlementProofPacket)[0].actionLabel, 'Attach Settlement payment proof')

const amountMismatchPacket = buildCancellationSettlementCloseoutPacket({
  workspace,
  figuresRegister,
  lodgementPacket,
  settlementEvidence: settlementEvidence.map((item) => item.requirementKey === 'settlement_payment_evidence' ? { ...item, amount: 1200000 } : item),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-3',
  generatedAt: '2026-08-05T19:20:00.000Z',
  asOf: '2026-08-05T19:20:00.000Z',
})
assert.equal(amountMismatchPacket.validation.valid, false)
assert.equal(amountMismatchPacket.metrics.amountMismatchCount, 1)
assert.ok(amountMismatchPacket.validation.errors.includes('settlement_payment_evidence:settlement_proof_amount_mismatch_fact'))
assert.equal(amountMismatchPacket.nextActions[0].actionLabel, 'Reconcile settlement amount to cancellation figures')

const figuresMismatchWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase9-figures-mismatch' },
  evidence: completeEvidence({ settlement_amount: verified(1200000) }),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const figuresMismatchPacket = buildCancellationSettlementCloseoutPacket({
  workspace: figuresMismatchWorkspace,
  figuresRegister,
  lodgementPacket,
  settlementEvidence: settlementEvidence.map((item) => item.requirementKey === 'settlement_payment_evidence' ? { ...item, amount: 1200000 } : item),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-4',
  generatedAt: '2026-08-05T19:30:00.000Z',
  asOf: '2026-08-05T19:30:00.000Z',
})
assert.equal(figuresMismatchPacket.validation.valid, false)
assert.ok(figuresMismatchPacket.validation.errors.includes('settlement_payment_evidence:settlement_amount_mismatch_figures'))

const stageOnlyCloseoutPacket = buildCancellationSettlementCloseoutPacket({
  workspace,
  figuresRegister,
  lodgementPacket,
  settlementEvidence: settlementEvidence.map((item) => item.requirementKey === 'closeout_review_evidence' ? { ...item, sourceType: 'stage_only' } : item),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-5',
  generatedAt: '2026-08-05T19:40:00.000Z',
  asOf: '2026-08-05T19:40:00.000Z',
})
assert.equal(stageOnlyCloseoutPacket.validation.valid, false)
assert.equal(stageOnlyCloseoutPacket.metrics.stageOnlyEvidenceCount, 1)
assert.ok(stageOnlyCloseoutPacket.validation.errors.includes('closeout_review_evidence:settlement_evidence_source_forbidden:stage_only'))
assert.equal(stageOnlyCloseoutPacket.nextActions[0].actionLabel, 'Replace stage-only/system settlement evidence')

const unresolvedExceptionsPacket = buildCancellationSettlementCloseoutPacket({
  workspace,
  figuresRegister,
  lodgementPacket,
  settlementEvidence: settlementEvidence.map((item) => item.requirementKey === 'closeout_review_evidence' ? { ...item, unresolvedExceptionCount: 2 } : item),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-6',
  generatedAt: '2026-08-05T19:50:00.000Z',
  asOf: '2026-08-05T19:50:00.000Z',
})
assert.equal(unresolvedExceptionsPacket.validation.valid, false)
assert.equal(unresolvedExceptionsPacket.metrics.unresolvedExceptionCount, 1)
assert.ok(unresolvedExceptionsPacket.validation.errors.includes('closeout_review_evidence:unresolved_closeout_exceptions'))
assert.equal(unresolvedExceptionsPacket.nextActions[0].actionLabel, 'Clear close-out exceptions')

const phase8BlockedPacket = buildCancellationSettlementCloseoutPacket({
  workspace,
  figuresRegister,
  lodgementPacket: { ...lodgementPacket, readyForPhase9: false },
  settlementEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-7',
  generatedAt: '2026-08-05T20:00:00.000Z',
  asOf: '2026-08-05T20:00:00.000Z',
})
assert.equal(phase8BlockedPacket.validation.valid, false)
assert.ok(phase8BlockedPacket.validation.errors.includes('phase8_packet_not_ready'))
assert.equal(phase8BlockedPacket.nextActions[0].actionLabel, 'Complete Phase 8 lodgement/registration evidence packet')
assert.equal(validateCancellationSettlementCloseoutPacket(phase8BlockedPacket).valid, false)

const figuresBlockedPacket = buildCancellationSettlementCloseoutPacket({
  workspace,
  figuresRegister: { ...figuresRegister, readyForPhase6: false },
  lodgementPacket,
  settlementEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-8',
  generatedAt: '2026-08-05T20:10:00.000Z',
  asOf: '2026-08-05T20:10:00.000Z',
})
assert.equal(figuresBlockedPacket.validation.valid, false)
assert.ok(figuresBlockedPacket.validation.errors.includes('figures_register_not_ready'))
assert.equal(figuresBlockedPacket.nextActions[0].actionLabel, 'Clear cancellation figures register before close-out')

const missingCloseoutFactWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase9-missing-closeout' },
  evidence: completeEvidence({ closeout_status: undefined }),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const missingCloseoutFactPacket = buildCancellationSettlementCloseoutPacket({
  workspace: missingCloseoutFactWorkspace,
  figuresRegister,
  lodgementPacket,
  settlementEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-settlement-closeout-9',
  generatedAt: '2026-08-05T20:20:00.000Z',
  asOf: '2026-08-05T20:20:00.000Z',
})
assert.equal(missingCloseoutFactPacket.validation.valid, false)
assert.ok(missingCloseoutFactPacket.validation.errors.includes('closeout_review_evidence:canonical_fact_not_verified:closeout_status'))
assert.equal(missingCloseoutFactPacket.metrics.canonicalFactGapCount, 1)

const report = buildCancellationAttorneyPhase9BaselineReport({
  workspace,
  figuresRegister,
  lodgementPacket,
  settlementEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase9-report',
  generatedAt: '2026-08-05T20:30:00.000Z',
  asOf: '2026-08-05T20:30:00.000Z',
})
assert.equal(report.readyForPhase10, true, JSON.stringify(report, null, 2))
assert.equal(report.requirementCount, 3)
assert.equal(report.satisfiedCount, 3)
assert.equal(report.amountMismatchCount, 0)

console.log(`Cancellation attorney module Phase 9 settlement close-out packet passed (${report.satisfiedCount} evidence records).`)
