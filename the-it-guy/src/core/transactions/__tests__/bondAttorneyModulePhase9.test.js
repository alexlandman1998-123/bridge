import assert from 'node:assert/strict'
import {
  BOND_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID,
  BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY,
  BOND_INBOUND_SIGNAL_RECONCILIATION_OUTCOMES,
  buildBondAttorneyPhase9BaselineReport,
  buildBondInboundSignalNextActions,
  buildBondInboundSignalRegister,
  validateBondInboundSignalRegister,
} from '../bondAttorneyModulePhase9.js'
import { buildBondPackWorkspace } from '../bondAttorneyModulePhase3.js'
import { buildBondSigningWorkspace } from '../bondAttorneyModulePhase6.js'
import {
  buildApprovedBondLegalTemplate,
  buildBondLegalTemplateGate,
  listBondTemplateControlledDocumentKeys,
} from '../bondAttorneyModulePhase7.js'
import { buildBondLodgementEvidencePacket } from '../bondAttorneyModulePhase8.js'

const verified = (value, overrides = {}) => ({
  value,
  sourceId: overrides.sourceId || 'source-bank-pack-1',
  capturedAt: overrides.capturedAt || '2026-07-10T09:00:00.000Z',
  verifiedAt: overrides.verifiedAt || '2026-07-10T10:00:00.000Z',
  verifiedBy: overrides.verifiedBy || { role: 'bond_attorney', userId: 'bond-attorney-1' },
  expiresAt: overrides.expiresAt || null,
})

const readyBankConditions = [
  {
    key: 'insurance',
    type: 'insurance',
    label: 'Homeowners insurance confirmation',
    ownerRole: 'buyer',
    dueDate: '2026-07-18',
    status: 'satisfied',
    bankBlocking: true,
    evidenceRequirements: [{ key: 'insurance_confirmation', type: 'document', requiresApproval: true }],
    evidence: [{ requirementKey: 'insurance_confirmation', status: 'approved', referenceId: 'doc-insurance-1', capturedAt: '2026-07-11T09:00:00.000Z', reviewedAt: '2026-07-11T10:00:00.000Z' }],
  },
  {
    key: 'debit_order_mandate',
    type: 'debit_order',
    label: 'Debit-order mandate',
    ownerRole: 'bank',
    dueDate: '2026-07-16',
    status: 'satisfied',
    bankBlocking: true,
    evidence: [{ requirementKey: 'debit_order_mandate', status: 'approved', referenceId: 'doc-debit-order-1', capturedAt: '2026-07-12T09:00:00.000Z', reviewedAt: '2026-07-12T10:00:00.000Z' }],
  },
]

const completeEvidence = () => ({
  bank_name: verified('Nedbank'),
  bank_reference: verified('NB-2026-001'),
  approved_bond_amount: verified(1850000),
  mortgagor_identity_and_capacity: verified({ name: 'Alex Buyer', capacity: 'individual mortgagor' }),
  mortgagee_identity: verified({ name: 'Nedbank Limited', registrationNumber: '1951/000009/06' }),
  property_legal_description: verified('Erf 1234 Cape Town, City of Cape Town'),
  title_deed_or_deeds_office_reference: verified('T12345/2021'),
  buyer_marital_or_entity_authority: verified({ status: 'unmarried', authority: 'self' }),
  bank_conditions: verified(readyBankConditions),
  guarantee_values_and_expiry: verified([{ amount: 1850000, expiresAt: '2026-09-30', guaranteeReference: 'GUA-2026-1' }]),
  signing_method_and_signed_pack_status: verified({ method: 'wet_ink', status: 'scheduled' }),
  bank_submission_reference: verified('BANK-SUB-77'),
  approval_to_lodge_reference: verified('ATL-2026-22'),
  lodgement_reference: verified('LODGE-2026-101'),
  registration_date: verified('2026-08-02'),
})

const identityVerified = { requirementKey: 'identity_verified', status: 'verified', referenceId: 'doc-id-1', capturedAt: '2026-07-12T09:00:00.000Z', verifiedAt: '2026-07-12T10:00:00.000Z', verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' } }
const signedPackVerified = { requirementKey: 'signed_bond_pack', status: 'verified', referenceId: 'doc-signed-pack-1', artifactHash: 'signed-pack-hash-1', capturedAt: '2026-07-15T09:00:00.000Z', verifiedAt: '2026-07-15T09:30:00.000Z', verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' } }
const originalReceived = { requirementKey: 'original_signed_pack_received', status: 'verified', referenceId: 'vault-original-1', capturedAt: '2026-07-15T10:00:00.000Z', verifiedAt: '2026-07-15T10:30:00.000Z', verifiedBy: { role: 'secretary', userId: 'secretary-1' } }
const witnessAttestation = { requirementKey: 'witness_attestation', status: 'verified', referenceId: 'doc-witness-1', capturedAt: '2026-07-15T10:00:00.000Z', verifiedAt: '2026-07-15T10:30:00.000Z', verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' } }

const readySigner = {
  signerKey: 'primary_mortgagor',
  signerRole: 'mortgagor',
  partyRole: 'mortgagor',
  capacityType: 'self',
  selectedMethod: 'wet_ink',
  originalRequired: true,
  witnessRequired: true,
  evidence: [identityVerified, signedPackVerified, originalReceived, witnessAttestation],
}

const completePacketEvidence = [
  {
    requirementKey: 'bank_approval_to_lodge',
    status: 'verified',
    sourceType: 'bank_portal_upload',
    referenceId: 'doc-atl-1',
    externalReference: 'ATL-2026-22',
    capturedAt: '2026-07-16T08:00:00.000Z',
    verifiedAt: '2026-07-16T09:00:00.000Z',
    verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  },
  {
    requirementKey: 'guarantee_evidence',
    status: 'verified',
    sourceType: 'transfer_attorney_confirmation',
    referenceId: 'doc-guarantee-1',
    externalReference: 'GUA-2026-1',
    capturedAt: '2026-07-17T08:00:00.000Z',
    verifiedAt: '2026-07-17T09:00:00.000Z',
    verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  },
  {
    requirementKey: 'lodgement_evidence',
    status: 'verified',
    sourceType: 'attorney_upload',
    referenceId: 'doc-lodgement-1',
    externalReference: 'LODGE-2026-101',
    capturedAt: '2026-07-30T08:00:00.000Z',
    verifiedAt: '2026-07-30T09:00:00.000Z',
    verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  },
  {
    requirementKey: 'deeds_registration_evidence',
    status: 'verified',
    sourceType: 'deeds_office_notice',
    referenceId: 'doc-deeds-1',
    externalReference: 'DEEDS-REG-2026-55',
    capturedAt: '2026-08-02T08:00:00.000Z',
    verifiedAt: '2026-08-02T09:00:00.000Z',
    verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  },
]

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['signals', 'payload', 'evidence', 'facts', 'value', 'templates', 'template', 'signers', 'body', 'sections'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.equal(BOND_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID, 'bank_and_deeds_integrations_absent')
assert.equal(BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.manualEvidenceRemainsPrimary, true)
assert.equal(BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.inboundSignalsOptional, true)
assert.equal(BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.autoOverwriteManualEvidence, false)
assert.equal(BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.submitsToBankPortal, false)
assert.equal(BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.mutatesRegistryOutcome, false)

const templates = listBondTemplateControlledDocumentKeys().reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedBondLegalTemplate(documentKey),
}), {})

const workspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase9' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const signingWorkspace = buildBondSigningWorkspace({
  workspace,
  signers: [readySigner],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-signing-ready',
  generatedAt: '2026-07-15T11:00:00.000Z',
})
const legalTemplateGate = buildBondLegalTemplateGate({
  workspace,
  signingWorkspace,
  templates,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-template-gate',
  generatedAt: '2026-07-15T12:00:00.000Z',
  asOf: '2026-07-15T12:00:00.000Z',
})
const lodgementPacket = buildBondLodgementEvidencePacket({
  workspace,
  legalTemplateGate,
  packetEvidence: completePacketEvidence,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-lodgement-packet',
  generatedAt: '2026-08-02T10:00:00.000Z',
  asOf: '2026-08-02T10:00:00.000Z',
})
assert.equal(lodgementPacket.readyForPhase9, true)

const noSignalRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: [],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-0',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(noSignalRegister.validation.valid, true, JSON.stringify(noSignalRegister.validation.errors, null, 2))
assert.equal(noSignalRegister.readyForRelease, true)
assert.equal(noSignalRegister.metrics.signalCount, 0)
assert.equal(noSignalRegister.nextActions.length, 0)

const matchedSignals = [
  {
    sourceEventId: 'bank-atl-event-1',
    sourceType: 'bank_portal_api',
    signalType: 'bank_approval_to_lodge',
    referenceValue: 'ATL-2026-22',
    eventAt: '2026-07-16T10:00:00.000Z',
    receivedAt: '2026-07-16T10:01:00.000Z',
    signatureVerified: true,
  },
  {
    sourceEventId: 'bank-guarantee-event-1',
    sourceType: 'bank_secure_email',
    signalType: 'guarantee_issued',
    referenceValue: 'GUA-2026-1',
    eventAt: '2026-07-17T10:00:00.000Z',
    receivedAt: '2026-07-17T10:01:00.000Z',
    signatureVerified: true,
  },
  {
    sourceEventId: 'lodgement-event-1',
    sourceType: 'trusted_middleware',
    signalType: 'lodgement_confirmed',
    referenceValue: 'LODGE-2026-101',
    eventAt: '2026-07-30T10:00:00.000Z',
    receivedAt: '2026-07-30T10:01:00.000Z',
    signatureVerified: true,
  },
  {
    sourceEventId: 'deeds-registration-event-1',
    sourceType: 'deeds_office_feed',
    signalType: 'registration_confirmed',
    referenceValue: 'DEEDS-REG-2026-55',
    registrationDate: '2026-08-02',
    eventAt: '2026-08-02T10:00:00.000Z',
    receivedAt: '2026-08-02T10:01:00.000Z',
    signatureVerified: true,
  },
]

const matchedRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: matchedSignals,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-1',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(matchedRegister.validation.valid, true, JSON.stringify(matchedRegister.validation.errors, null, 2))
assert.equal(matchedRegister.readyForRelease, true)
assert.equal(matchedRegister.metrics.signalCount, 4)
assert.equal(matchedRegister.metrics.matchedCount, 4)
assert.equal(matchedRegister.metrics.blockingCount, 0)
assert.ok(matchedRegister.results.every((result) => result.outcome === BOND_INBOUND_SIGNAL_RECONCILIATION_OUTCOMES.matched))
assert.equal(matchedRegister.auditEvent.eventType, 'bond_inbound_signal_reconciliation_completed')
assert.equal(matchedRegister.auditEvent.releaseBlockerId, BOND_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID)
assert.equal(matchedRegister.auditEvent.readyForRelease, true)
assert.equal(containsForbiddenAuditPayload(matchedRegister.auditEvent), false)

const registrationReferenceConflictRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: [{ ...matchedSignals[3], sourceEventId: 'deeds-registration-conflict-1', referenceValue: 'DEEDS-WRONG' }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-registration-reference-conflict',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(registrationReferenceConflictRegister.validation.valid, false)
assert.equal(registrationReferenceConflictRegister.readyForRelease, false)
assert.equal(registrationReferenceConflictRegister.metrics.conflictCount, 1)
assert.ok(registrationReferenceConflictRegister.validation.errors.includes(`${registrationReferenceConflictRegister.results[0].signal.signalId}:reference_mismatch`))

const duplicateRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: [...matchedSignals, { ...matchedSignals[0] }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-2',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(duplicateRegister.validation.valid, true, JSON.stringify(duplicateRegister.validation.errors, null, 2))
assert.equal(duplicateRegister.readyForRelease, true)
assert.equal(duplicateRegister.metrics.duplicateCount, 1)
assert.ok(duplicateRegister.validation.warnings.some((warning) => warning.endsWith(':duplicate')))

const conflictRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: [{ ...matchedSignals[0], sourceEventId: 'bank-atl-conflict-1', referenceValue: 'ATL-WRONG' }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-3',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(conflictRegister.validation.valid, false)
assert.equal(conflictRegister.readyForRelease, false)
assert.equal(conflictRegister.metrics.conflictCount, 1)
assert.ok(conflictRegister.validation.errors.includes(`${conflictRegister.results[0].signal.signalId}:reference_mismatch`))
assert.equal(buildBondInboundSignalNextActions(conflictRegister)[0].actionLabel, 'Resolve inbound signal conflict')

const rejectionRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: [{
    sourceEventId: 'deeds-rejection-1',
    sourceType: 'deeds_office_feed',
    signalType: 'deeds_rejection',
    referenceValue: 'DEEDS-REJ-1',
    eventAt: '2026-08-02T10:00:00.000Z',
    receivedAt: '2026-08-02T10:01:00.000Z',
    signatureVerified: true,
  }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-4',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(rejectionRegister.validation.valid, false)
assert.equal(rejectionRegister.readyForRelease, false)
assert.equal(rejectionRegister.metrics.conflictCount, 1)
assert.ok(rejectionRegister.validation.errors.some((error) => error.endsWith(':deeds_rejection_conflicts_with_registered_packet')))

const untrustedRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: [{ ...matchedSignals[0], sourceEventId: 'untrusted-1', sourceType: 'manual_backfill', signatureVerified: false }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-5',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(untrustedRegister.validation.valid, false)
assert.equal(untrustedRegister.readyForRelease, false)
assert.equal(untrustedRegister.metrics.untrustedCount, 1)
assert.ok(untrustedRegister.validation.errors.some((error) => error.endsWith(':signal_source_not_trusted')))
assert.ok(untrustedRegister.validation.errors.some((error) => error.endsWith(':signal_signature_not_verified')))

const staleRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: [{ ...matchedSignals[0], sourceEventId: 'stale-1', eventAt: '2026-07-16T08:30:00.000Z', receivedAt: '2026-07-16T08:31:00.000Z' }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-6',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(staleRegister.validation.valid, true, JSON.stringify(staleRegister.validation.errors, null, 2))
assert.equal(staleRegister.readyForRelease, true)
assert.equal(staleRegister.metrics.staleCount, 1)
assert.equal(staleRegister.nextActions[0].actionLabel, 'Review stale inbound signal')

const unsupportedRegister = buildBondInboundSignalRegister({
  lodgementPacket,
  inboundSignals: [{
    sourceEventId: 'unknown-1',
    sourceType: 'bank_portal_api',
    signalType: 'bank_balance_update',
    eventAt: '2026-08-02T10:00:00.000Z',
    receivedAt: '2026-08-02T10:01:00.000Z',
    signatureVerified: true,
  }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-7',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(unsupportedRegister.validation.valid, false)
assert.equal(unsupportedRegister.metrics.unsupportedCount, 1)
assert.equal(unsupportedRegister.nextActions[0].actionLabel, 'Map or ignore unsupported inbound signal')

const packetBlockedRegister = buildBondInboundSignalRegister({
  lodgementPacket: { ...lodgementPacket, readyForPhase9: false },
  inboundSignals: matchedSignals,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-register-8',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
assert.equal(packetBlockedRegister.validation.valid, false)
assert.ok(packetBlockedRegister.validation.errors.includes('phase8_packet_not_ready'))
assert.equal(packetBlockedRegister.nextActions[0].actionLabel, 'Complete Phase 8 manual evidence packet')
assert.equal(validateBondInboundSignalRegister(packetBlockedRegister).valid, false)

const report = buildBondAttorneyPhase9BaselineReport({
  lodgementPacket,
  inboundSignals: matchedSignals,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase9-report',
  generatedAt: '2026-08-02T11:30:00.000Z',
})
assert.equal(report.readyForRelease, true, JSON.stringify(report, null, 2))
assert.equal(report.signalCount, 4)
assert.equal(report.matchedCount, 4)
assert.equal(report.blockingCount, 0)

console.log(`Bond attorney module Phase 9 inbound signal reconciliation passed (${report.matchedCount} matched signals).`)
