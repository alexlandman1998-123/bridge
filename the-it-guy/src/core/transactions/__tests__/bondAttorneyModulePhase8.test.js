import assert from 'node:assert/strict'
import {
  BOND_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID,
  BOND_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS,
  BOND_LODGEMENT_PACKET_STATUSES,
  BOND_LODGEMENT_REGISTRATION_BOUNDARY,
  buildBondAttorneyPhase8BaselineReport,
  buildBondLodgementEvidenceNextActions,
  buildBondLodgementEvidencePacket,
  listBondLodgementEvidenceRequirementKeys,
  validateBondLodgementEvidencePacket,
} from '../bondAttorneyModulePhase8.js'
import { buildBondPackWorkspace } from '../bondAttorneyModulePhase3.js'
import { buildBondSigningWorkspace } from '../bondAttorneyModulePhase6.js'
import {
  buildApprovedBondLegalTemplate,
  buildBondLegalTemplateGate,
  listBondTemplateControlledDocumentKeys,
} from '../bondAttorneyModulePhase7.js'

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

const completeEvidence = (overrides = {}) => ({
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
  ...overrides,
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
    if (['evidence', 'facts', 'value', 'templates', 'template', 'signers', 'body', 'sections'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.deepEqual(listBondLodgementEvidenceRequirementKeys(), [
  'bank_approval_to_lodge',
  'guarantee_evidence',
  'lodgement_evidence',
  'deeds_registration_evidence',
])
assert.equal(BOND_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID, 'lodgement_registration_evidence_not_packet_bound')
assert.equal(BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesBankApproval, false)
assert.equal(BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesDeedsOutcome, false)
assert.equal(BOND_LODGEMENT_REGISTRATION_BOUNDARY.submitsToBankPortal, false)
assert.equal(BOND_LODGEMENT_REGISTRATION_BOUNDARY.integratesWithDeedsOffice, false)

const templates = listBondTemplateControlledDocumentKeys().reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedBondLegalTemplate(documentKey),
}), {})

const workspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase8' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const signingWorkspace = buildBondSigningWorkspace({
  workspace,
  signers: [readySigner],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-signing-ready',
  generatedAt: '2026-07-15T11:00:00.000Z',
})
const legalTemplateGate = buildBondLegalTemplateGate({
  workspace,
  signingWorkspace,
  templates,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-template-gate',
  generatedAt: '2026-07-15T12:00:00.000Z',
  asOf: '2026-07-15T12:00:00.000Z',
})
assert.equal(legalTemplateGate.readyForPhase8, true)

const packet = buildBondLodgementEvidencePacket({
  workspace,
  legalTemplateGate,
  packetEvidence: completePacketEvidence,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-packet-1',
  generatedAt: '2026-08-02T10:00:00.000Z',
  asOf: '2026-08-02T10:00:00.000Z',
})
assert.equal(packet.validation.valid, true, JSON.stringify(packet.validation.errors, null, 2))
assert.equal(packet.status, BOND_LODGEMENT_PACKET_STATUSES.registered)
assert.equal(packet.readyForPhase9, true)
assert.equal(packet.metrics.requirementCount, 4)
assert.equal(packet.metrics.satisfiedCount, 4)
assert.equal(packet.metrics.missingEvidenceCount, 0)
assert.equal(packet.records.find((record) => record.requirementKey === BOND_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS.deedsRegistrationEvidence).satisfied, true)
assert.equal(packet.records.find((record) => record.requirementKey === BOND_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS.bankApprovalToLodge).evidence.externalReference, 'ATL-2026-22')
assert.equal(packet.nextActions.length, 0)
assert.equal(packet.auditEvent.eventType, 'bond_lodgement_registration_evidence_packet_bound')
assert.equal(packet.auditEvent.releaseBlockerId, BOND_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID)
assert.equal(packet.auditEvent.readyForPhase9, true)
assert.equal(containsForbiddenAuditPayload(packet.auditEvent), false)

const missingRegistrationPacket = buildBondLodgementEvidencePacket({
  workspace,
  legalTemplateGate,
  packetEvidence: completePacketEvidence.filter((item) => item.requirementKey !== 'deeds_registration_evidence'),
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-packet-2',
  generatedAt: '2026-08-02T10:00:00.000Z',
  asOf: '2026-08-02T10:00:00.000Z',
})
assert.equal(missingRegistrationPacket.validation.valid, false)
assert.equal(missingRegistrationPacket.readyForPhase9, false)
assert.equal(missingRegistrationPacket.metrics.missingEvidenceCount, 1)
assert.ok(missingRegistrationPacket.validation.errors.includes('deeds_registration_evidence:packet_evidence_missing'))
assert.equal(buildBondLodgementEvidenceNextActions(missingRegistrationPacket)[0].actionLabel, 'Attach Registration evidence and Deeds Office outcome')

const stageOnlyPacket = buildBondLodgementEvidencePacket({
  workspace,
  legalTemplateGate,
  packetEvidence: completePacketEvidence.map((item) => item.requirementKey === 'deeds_registration_evidence' ? { ...item, sourceType: 'stage_only' } : item),
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-packet-3',
  generatedAt: '2026-08-02T10:00:00.000Z',
  asOf: '2026-08-02T10:00:00.000Z',
})
assert.equal(stageOnlyPacket.validation.valid, false)
assert.equal(stageOnlyPacket.metrics.stageOnlyEvidenceCount, 1)
assert.ok(stageOnlyPacket.validation.errors.includes('deeds_registration_evidence:packet_evidence_source_forbidden:stage_only'))
assert.equal(stageOnlyPacket.nextActions[0].actionLabel, 'Replace stage-only/system evidence with real evidence')

const expiredGuaranteeWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase8-expired' },
  evidence: completeEvidence({
    guarantee_values_and_expiry: verified([{ amount: 1850000, expiresAt: '2026-07-01', guaranteeReference: 'GUA-2026-old' }]),
  }),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const expiredGuaranteePacket = buildBondLodgementEvidencePacket({
  workspace: expiredGuaranteeWorkspace,
  legalTemplateGate,
  packetEvidence: completePacketEvidence,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-packet-4',
  generatedAt: '2026-08-02T10:00:00.000Z',
  asOf: '2026-08-02T10:00:00.000Z',
})
assert.equal(expiredGuaranteePacket.validation.valid, false)
assert.equal(expiredGuaranteePacket.metrics.guaranteeExpiredCount, 1)
assert.ok(expiredGuaranteePacket.validation.errors.some((error) => error.startsWith('guarantee_evidence:guarantee_expired:')))

const missingFactWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase8-missing-fact' },
  evidence: { ...completeEvidence(), registration_date: undefined },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const missingFactPacket = buildBondLodgementEvidencePacket({
  workspace: missingFactWorkspace,
  legalTemplateGate,
  packetEvidence: completePacketEvidence,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-packet-5',
  generatedAt: '2026-08-02T10:00:00.000Z',
  asOf: '2026-08-02T10:00:00.000Z',
})
assert.equal(missingFactPacket.validation.valid, false)
assert.ok(missingFactPacket.validation.errors.includes('deeds_registration_evidence:canonical_fact_not_verified:registration_date'))
assert.equal(missingFactPacket.metrics.canonicalFactGapCount, 1)

const phase7BlockedPacket = buildBondLodgementEvidencePacket({
  workspace,
  legalTemplateGate: { readyForPhase8: false, status: 'blocked' },
  packetEvidence: completePacketEvidence,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-packet-6',
  generatedAt: '2026-08-02T10:00:00.000Z',
  asOf: '2026-08-02T10:00:00.000Z',
})
assert.equal(phase7BlockedPacket.validation.valid, false)
assert.ok(phase7BlockedPacket.validation.errors.includes('phase7_gate_not_ready'))
assert.equal(phase7BlockedPacket.nextActions[0].actionLabel, 'Clear Phase 7 governed-template gate')
assert.equal(validateBondLodgementEvidencePacket(phase7BlockedPacket).valid, false)

const report = buildBondAttorneyPhase8BaselineReport({
  workspace,
  legalTemplateGate,
  packetEvidence: completePacketEvidence,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase8-report',
  generatedAt: '2026-08-02T10:30:00.000Z',
  asOf: '2026-08-02T10:30:00.000Z',
})
assert.equal(report.readyForPhase9, true, JSON.stringify(report, null, 2))
assert.equal(report.requirementCount, 4)
assert.equal(report.satisfiedCount, 4)
assert.equal(report.missingEvidenceCount, 0)

console.log(`Bond attorney module Phase 8 lodgement evidence packet passed (${report.satisfiedCount} evidence records).`)
