import assert from 'node:assert/strict'
import {
  CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY,
  CANCELLATION_ATTORNEY_PHASE10_RELEASE_GATE_ID,
  CANCELLATION_ATTORNEY_PHASE10_STATUSES,
  buildCancellationAttorneyPhase10BaselineReport,
  buildCancellationAttorneyReleaseCertification,
  validateCancellationAttorneyReleaseCertification,
} from '../cancellationAttorneyModulePhase10.js'
import { buildCancellationPackWorkspace } from '../cancellationAttorneyModulePhase3.js'
import { buildCancellationFiguresRegister } from '../cancellationAttorneyModulePhase5.js'
import { buildCancellationGuaranteeWorkspace } from '../cancellationAttorneyModulePhase6.js'
import {
  buildApprovedCancellationDocumentTemplate,
  buildCancellationDocumentSigningWorkspace,
  listCancellationTemplateControlledDocumentKeys,
} from '../cancellationAttorneyModulePhase7.js'
import { buildCancellationLodgementEvidencePacket } from '../cancellationAttorneyModulePhase8.js'
import { buildCancellationSettlementCloseoutPacket } from '../cancellationAttorneyModulePhase9.js'

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
    if ([
      'workspace',
      'figuresRegister',
      'guaranteeWorkspace',
      'documentSigningWorkspace',
      'lodgementPacket',
      'settlementCloseoutPacket',
      'settlementEvidence',
      'evidence',
      'facts',
      'value',
      'amount',
      'documents',
      'templates',
      'template',
      'body',
      'sections',
      'clauses',
    ].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.equal(CANCELLATION_ATTORNEY_PHASE10_RELEASE_GATE_ID, 'cancellation_attorney_pilot_release_certification')
assert.equal(CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY.readOnlyCertification, true)
assert.equal(CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY.writesExternalSystem, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY.executesSettlementPayment, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY.integratesWithDeedsOffice, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY.generatesLegalInstrument, false)

const templates = listCancellationTemplateControlledDocumentKeys().reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedCancellationDocumentTemplate(documentKey),
}), {})

function buildReadyArtifacts() {
  const workspace = buildCancellationPackWorkspace({
    transaction: { id: 'tx-cancellation-phase10' },
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
    actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
    commandId: 'phase10-figures-register',
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
      amount: settlementAmount,
      requiredAmount: settlementAmount,
      beneficiaryAndWording,
      expectedBeneficiaryAndWording: beneficiaryAndWording,
      acceptanceReviewed: true,
      expiresAt: '2026-08-20',
      evidence: guaranteeEvidence,
    }],
    actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
    commandId: 'phase10-guarantee-workspace',
    generatedAt: '2026-07-15T10:30:00.000Z',
  })
  const documentSigningWorkspace = buildCancellationDocumentSigningWorkspace({
    workspace,
    guaranteeWorkspace,
    templates,
    documents: readyDocumentEvidence,
    actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
    commandId: 'phase10-document-signing-workspace',
    generatedAt: '2026-07-15T11:00:00.000Z',
    asOf: '2026-07-15T11:00:00.000Z',
  })
  const lodgementPacket = buildCancellationLodgementEvidencePacket({
    workspace,
    documentSigningWorkspace,
    packetEvidence: lodgementEvidence,
    actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
    commandId: 'phase10-lodgement-packet',
    generatedAt: '2026-08-05T10:00:00.000Z',
    asOf: '2026-08-05T10:00:00.000Z',
  })
  const settlementCloseoutPacket = buildCancellationSettlementCloseoutPacket({
    workspace,
    figuresRegister,
    lodgementPacket,
    settlementEvidence,
    actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
    commandId: 'phase10-settlement-closeout-packet',
    generatedAt: '2026-08-05T19:00:00.000Z',
    asOf: '2026-08-05T19:00:00.000Z',
  })
  return { workspace, figuresRegister, guaranteeWorkspace, documentSigningWorkspace, lodgementPacket, settlementCloseoutPacket }
}

const readyArtifacts = buildReadyArtifacts()
const readyCertification = buildCancellationAttorneyReleaseCertification({
  ...readyArtifacts,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase10-release-certification-ready',
  generatedAt: '2026-08-05T20:00:00.000Z',
})

assert.equal(readyCertification.version, 'cancellation_attorney_module_phase10_release_certification_v1')
assert.equal(readyCertification.status, CANCELLATION_ATTORNEY_PHASE10_STATUSES.ready)
assert.equal(readyCertification.readyForPilotRelease, true, JSON.stringify(readyCertification.validation.errors, null, 2))
assert.equal(readyCertification.validation.valid, true, JSON.stringify(readyCertification.validation.errors, null, 2))
assert.equal(readyCertification.metrics.closedReleaseBlockerCount, 10)
assert.equal(readyCertification.metrics.openReleaseBlockerCount, 0)
assert.equal(readyCertification.metrics.readyCapabilityCount, readyCertification.metrics.capabilityCount)
assert.equal(readyCertification.metrics.failedCriterionCount, 0)
assert.equal(readyCertification.nextActions.length, 0)
assert.ok(readyCertification.releaseSummary.includes('ready'))
assert.equal(readyCertification.auditEvent.eventType, 'cancellation_attorney_release_certification_completed')
assert.equal(readyCertification.auditEvent.readyForPilotRelease, true)
assert.equal(containsForbiddenAuditPayload(readyCertification.auditEvent), false)
assert.equal(validateCancellationAttorneyReleaseCertification(readyCertification).valid, true)

const closeoutBlockedPacket = buildCancellationSettlementCloseoutPacket({
  workspace: readyArtifacts.workspace,
  figuresRegister: readyArtifacts.figuresRegister,
  lodgementPacket: readyArtifacts.lodgementPacket,
  settlementEvidence: settlementEvidence.map((item) => item.requirementKey === 'closeout_review_evidence' ? { ...item, unresolvedExceptionCount: 2 } : item),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase10-closeout-blocked-packet',
  generatedAt: '2026-08-05T19:10:00.000Z',
  asOf: '2026-08-05T19:10:00.000Z',
})
const closeoutBlockedCertification = buildCancellationAttorneyReleaseCertification({
  ...readyArtifacts,
  settlementCloseoutPacket: closeoutBlockedPacket,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase10-release-certification-closeout-blocked',
  generatedAt: '2026-08-05T20:10:00.000Z',
})
assert.equal(closeoutBlockedCertification.status, CANCELLATION_ATTORNEY_PHASE10_STATUSES.blocked)
assert.equal(closeoutBlockedCertification.readyForPilotRelease, false)
assert.equal(closeoutBlockedCertification.validation.valid, false)
assert.ok(closeoutBlockedCertification.releaseBlockerClosures.find((item) => item.id === 'settlement_closeout_packet_missing').closed === false)
assert.ok(closeoutBlockedCertification.validation.errors.includes('phase9_settlement_closeout_packet_ready_not_met'))
assert.equal(closeoutBlockedCertification.nextActions[0].actionLabel, 'Complete settlement close-out packet')

const operationalBlockedCertification = buildCancellationAttorneyReleaseCertification({
  ...readyArtifacts,
  operationalReport: {
    readyForPhase5: false,
    operationalDocumentCount: 9,
    generatedCount: 8,
    failedCount: 1,
  },
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase10-release-certification-operational-blocked',
  generatedAt: '2026-08-05T20:20:00.000Z',
})
assert.equal(operationalBlockedCertification.readyForPilotRelease, false)
assert.ok(operationalBlockedCertification.releaseBlockerClosures.find((item) => item.id === 'cancellation_operational_generator_missing').closed === false)
assert.ok(operationalBlockedCertification.validation.errors.includes('phase4_operational_generator_ready_not_met'))
assert.ok(operationalBlockedCertification.validation.errors.includes('capability_not_ready:operational_document_drafts_ready'))

const unsafeCertification = buildCancellationAttorneyReleaseCertification({
  ...readyArtifacts,
  controlOverrides: { writesExternalSystem: true, executesSettlementPayment: true },
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase10-release-certification-unsafe',
  generatedAt: '2026-08-05T20:30:00.000Z',
})
assert.equal(unsafeCertification.readyForPilotRelease, false)
assert.equal(unsafeCertification.validation.valid, false)
assert.ok(unsafeCertification.validation.errors.includes('phase10_release_boundary_safe_not_met'))
assert.ok(unsafeCertification.validation.errors.includes('writesExternalSystem_forbidden'))
assert.ok(unsafeCertification.validation.errors.includes('executesSettlementPayment_forbidden'))

const report = buildCancellationAttorneyPhase10BaselineReport({
  ...readyArtifacts,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase10-report',
  generatedAt: '2026-08-05T20:40:00.000Z',
})
assert.equal(report.readyForPilotRelease, true, JSON.stringify(report, null, 2))
assert.equal(report.openReleaseBlockerCount, 0)
assert.equal(report.blockedCapabilityCount, 0)
assert.equal(report.failedCriterionCount, 0)

console.log(`Cancellation attorney module Phase 10 release certification passed (${report.closedReleaseBlockerCount} blockers closed).`)
