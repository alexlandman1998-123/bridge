import assert from 'node:assert/strict'
import {
  CANCELLATION_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID,
  CANCELLATION_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS,
  CANCELLATION_LODGEMENT_PACKET_STATUSES,
  CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY,
  buildCancellationAttorneyPhase8BaselineReport,
  buildCancellationLodgementEvidenceNextActions,
  buildCancellationLodgementEvidencePacket,
  listCancellationLodgementEvidenceRequirementKeys,
  validateCancellationLodgementEvidencePacket,
} from '../cancellationAttorneyModulePhase8.js'
import { buildCancellationPackWorkspace } from '../cancellationAttorneyModulePhase3.js'
import { buildCancellationFiguresRegister } from '../cancellationAttorneyModulePhase5.js'
import { buildCancellationGuaranteeWorkspace } from '../cancellationAttorneyModulePhase6.js'
import {
  buildApprovedCancellationDocumentTemplate,
  buildCancellationDocumentSigningWorkspace,
  listCancellationTemplateControlledDocumentKeys,
} from '../cancellationAttorneyModulePhase7.js'

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
  cancellation_figures_amount: verified(1234567.89, { sourceId: 'figures-fnb-1', expiresAt: '2026-08-15T00:00:00.000Z' }),
  cancellation_figures_expiry_date: verified('2026-08-15T00:00:00.000Z', { sourceId: 'figures-fnb-1' }),
  daily_interest_amount: verified(345.67, { sourceId: 'figures-fnb-1' }),
  penalty_notice_risk: verified('none'),
  guarantee_required_amount: verified(1234567.89),
  guarantee_beneficiary_and_wording: verified(beneficiaryAndWording),
  guarantee_reference: verified('GTY-CAN-2026-11'),
  guarantee_acceptance_status: verified('accepted'),
  seller_cancellation_signing_requirement: verified({ required: true, method: 'wet_ink', originalRequired: true }),
  signed_cancellation_document_status: verified('signed_originals_received'),
  lodgement_reference: verified('LOD-CAN-2026-101'),
  lodgement_date: verified('2026-08-02'),
  cancellation_registration_reference: verified('REG-CAN-2026-44'),
  cancellation_registration_date: verified('2026-08-05'),
  settlement_amount: verified(1235000),
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

const completePacketEvidence = [
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

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['evidence', 'facts', 'value', 'documents', 'templates', 'template', 'body', 'sections', 'clauses'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.deepEqual(listCancellationLodgementEvidenceRequirementKeys(), [
  'simultaneous_lodgement_readiness_evidence',
  'lodgement_evidence',
  'cancellation_registration_evidence',
])
assert.equal(CANCELLATION_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID, 'cancellation_lodgement_registration_evidence_not_packet_bound')
assert.equal(CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.marksRegistrationFromStageOnly, false)
assert.equal(CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesLodgementOutcome, false)
assert.equal(CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesRegistrationOutcome, false)
assert.equal(CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.integratesWithDeedsOffice, false)
assert.equal(CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.mutatesMatter, false)

const templates = listCancellationTemplateControlledDocumentKeys().reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedCancellationDocumentTemplate(documentKey),
}), {})

const workspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase8' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const figuresRegister = buildCancellationFiguresRegister({
  workspace,
  settlementDate: '2026-08-10',
  figures: [{
    figureId: 'figures-ready-1',
    status: 'verified',
    amount: 1234567.89,
    expiryDate: '2026-08-15',
    dailyInterestAmount: 345.67,
    penaltyNoticeRisk: 'none',
    penaltyReviewed: true,
    guaranteeRequiredAmount: 1234567.89,
    guaranteeBeneficiaryAndWording: beneficiaryAndWording,
    sourceReference: 'figures-fnb-1',
  }],
  generatedAt: '2026-07-15T09:00:00.000Z',
  asOf: '2026-07-15T09:00:00.000Z',
})
const guaranteeWorkspace = buildCancellationGuaranteeWorkspace({
  workspace,
  figuresRegister,
  guarantees: [{
    guaranteeId: 'guarantee-ready-1',
    reference: 'GTY-CAN-2026-11',
    status: 'accepted',
    amount: 1234567.89,
    requiredAmount: 1234567.89,
    beneficiaryAndWording,
    expectedBeneficiaryAndWording: beneficiaryAndWording,
    acceptanceReviewed: true,
    expiresAt: '2026-08-20',
    evidence: guaranteeEvidence,
  }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-guarantee-ready',
  generatedAt: '2026-07-15T10:30:00.000Z',
})
const documentSigningWorkspace = buildCancellationDocumentSigningWorkspace({
  workspace,
  guaranteeWorkspace,
  templates,
  documents: readyDocumentEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-document-signing-ready',
  generatedAt: '2026-07-15T11:00:00.000Z',
  asOf: '2026-07-15T11:00:00.000Z',
})
assert.equal(documentSigningWorkspace.readyForPhase8, true)

const packet = buildCancellationLodgementEvidencePacket({
  workspace,
  documentSigningWorkspace,
  packetEvidence: completePacketEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-packet-1',
  generatedAt: '2026-08-05T10:00:00.000Z',
  asOf: '2026-08-05T10:00:00.000Z',
})
assert.equal(packet.validation.valid, true, JSON.stringify(packet.validation.errors, null, 2))
assert.equal(packet.status, CANCELLATION_LODGEMENT_PACKET_STATUSES.registered)
assert.equal(packet.readyForPhase9, true)
assert.equal(packet.metrics.requirementCount, 3)
assert.equal(packet.metrics.satisfiedCount, 3)
assert.equal(packet.metrics.missingEvidenceCount, 0)
assert.equal(packet.records.find((record) => record.requirementKey === CANCELLATION_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS.cancellationRegistrationEvidence).satisfied, true)
assert.equal(packet.records.find((record) => record.requirementKey === CANCELLATION_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS.lodgementEvidence).evidence.externalReference, 'LOD-CAN-2026-101')
assert.equal(packet.nextActions.length, 0)
assert.equal(packet.auditEvent.eventType, 'cancellation_lodgement_registration_evidence_packet_bound')
assert.equal(packet.auditEvent.releaseBlockerId, CANCELLATION_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID)
assert.equal(packet.auditEvent.readyForPhase9, true)
assert.equal(containsForbiddenAuditPayload(packet.auditEvent), false)

const missingRegistrationPacket = buildCancellationLodgementEvidencePacket({
  workspace,
  documentSigningWorkspace,
  packetEvidence: completePacketEvidence.filter((item) => item.requirementKey !== 'cancellation_registration_evidence'),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-packet-2',
  generatedAt: '2026-08-05T10:00:00.000Z',
  asOf: '2026-08-05T10:00:00.000Z',
})
assert.equal(missingRegistrationPacket.validation.valid, false)
assert.equal(missingRegistrationPacket.readyForPhase9, false)
assert.equal(missingRegistrationPacket.metrics.missingEvidenceCount, 1)
assert.ok(missingRegistrationPacket.validation.errors.includes('cancellation_registration_evidence:packet_evidence_missing'))
assert.equal(buildCancellationLodgementEvidenceNextActions(missingRegistrationPacket)[0].actionLabel, 'Attach Cancellation registration/discharge evidence')

const stageOnlyPacket = buildCancellationLodgementEvidencePacket({
  workspace,
  documentSigningWorkspace,
  packetEvidence: completePacketEvidence.map((item) => item.requirementKey === 'cancellation_registration_evidence' ? { ...item, sourceType: 'stage_only' } : item),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-packet-3',
  generatedAt: '2026-08-05T10:00:00.000Z',
  asOf: '2026-08-05T10:00:00.000Z',
})
assert.equal(stageOnlyPacket.validation.valid, false)
assert.equal(stageOnlyPacket.metrics.stageOnlyEvidenceCount, 1)
assert.ok(stageOnlyPacket.validation.errors.includes('cancellation_registration_evidence:packet_evidence_source_forbidden:stage_only'))
assert.equal(stageOnlyPacket.nextActions[0].actionLabel, 'Replace stage-only/system evidence with real evidence')

const futureRegistrationWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase8-future' },
  evidence: completeEvidence({ cancellation_registration_date: verified('2026-08-30') }),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const futureRegistrationPacket = buildCancellationLodgementEvidencePacket({
  workspace: futureRegistrationWorkspace,
  documentSigningWorkspace,
  packetEvidence: completePacketEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-packet-4',
  generatedAt: '2026-08-05T10:00:00.000Z',
  asOf: '2026-08-05T10:00:00.000Z',
})
assert.equal(futureRegistrationPacket.validation.valid, false)
assert.equal(futureRegistrationPacket.metrics.futureDateCount, 1)
assert.ok(futureRegistrationPacket.validation.errors.includes('cancellation_registration_evidence:registration_date_future'))

const missingFactWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase8-missing-fact' },
  evidence: completeEvidence({ lodgement_date: undefined }),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const missingFactPacket = buildCancellationLodgementEvidencePacket({
  workspace: missingFactWorkspace,
  documentSigningWorkspace,
  packetEvidence: completePacketEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-packet-5',
  generatedAt: '2026-08-05T10:00:00.000Z',
  asOf: '2026-08-05T10:00:00.000Z',
})
assert.equal(missingFactPacket.validation.valid, false)
assert.ok(missingFactPacket.validation.errors.includes('lodgement_evidence:canonical_fact_not_verified:lodgement_date'))
assert.equal(missingFactPacket.metrics.canonicalFactGapCount, 1)

const expiredFiguresWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase8-expired-figures' },
  evidence: completeEvidence({
    cancellation_figures_expiry_date: verified('2026-07-01T00:00:00.000Z', { sourceId: 'figures-expired-1' }),
  }),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const expiredFiguresPacket = buildCancellationLodgementEvidencePacket({
  workspace: expiredFiguresWorkspace,
  documentSigningWorkspace,
  packetEvidence: completePacketEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-packet-6',
  generatedAt: '2026-08-05T10:00:00.000Z',
  asOf: '2026-08-05T10:00:00.000Z',
})
assert.equal(expiredFiguresPacket.validation.valid, false)
assert.equal(expiredFiguresPacket.metrics.figuresExpiredCount, 2)
assert.ok(expiredFiguresPacket.validation.errors.some((error) => error.startsWith('lodgement_evidence:figures_expired_before_lodgement:')))

const phase7BlockedPacket = buildCancellationLodgementEvidencePacket({
  workspace,
  documentSigningWorkspace: { readyForPhase8: false, status: 'blocked' },
  packetEvidence: completePacketEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-packet-7',
  generatedAt: '2026-08-05T10:00:00.000Z',
  asOf: '2026-08-05T10:00:00.000Z',
})
assert.equal(phase7BlockedPacket.validation.valid, false)
assert.ok(phase7BlockedPacket.validation.errors.includes('phase7_gate_not_ready'))
assert.equal(phase7BlockedPacket.nextActions[0].actionLabel, 'Clear Phase 7 document/signing workspace')
assert.equal(validateCancellationLodgementEvidencePacket(phase7BlockedPacket).valid, false)

const report = buildCancellationAttorneyPhase8BaselineReport({
  workspace,
  documentSigningWorkspace,
  packetEvidence: completePacketEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase8-report',
  generatedAt: '2026-08-05T10:30:00.000Z',
  asOf: '2026-08-05T10:30:00.000Z',
})
assert.equal(report.readyForPhase9, true, JSON.stringify(report, null, 2))
assert.equal(report.requirementCount, 3)
assert.equal(report.satisfiedCount, 3)
assert.equal(report.missingEvidenceCount, 0)

console.log(`Cancellation attorney module Phase 8 lodgement evidence packet passed (${report.satisfiedCount} evidence records).`)
