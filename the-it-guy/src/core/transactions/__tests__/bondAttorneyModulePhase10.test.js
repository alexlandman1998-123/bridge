import assert from 'node:assert/strict'
import {
  BOND_ATTORNEY_PHASE10_CONTROL_BOUNDARY,
  BOND_ATTORNEY_PHASE10_RELEASE_GATE_ID,
  BOND_ATTORNEY_PHASE10_STATUSES,
  buildBondAttorneyPhase10BaselineReport,
  buildBondAttorneyReleaseCertification,
  validateBondAttorneyReleaseCertification,
} from '../bondAttorneyModulePhase10.js'
import { buildBondPackWorkspace } from '../bondAttorneyModulePhase3.js'
import { buildBondConditionRegister } from '../bondAttorneyModulePhase5.js'
import { buildBondSigningWorkspace } from '../bondAttorneyModulePhase6.js'
import {
  buildApprovedBondLegalTemplate,
  buildBondLegalTemplateGate,
  listBondTemplateControlledDocumentKeys,
} from '../bondAttorneyModulePhase7.js'
import { buildBondLodgementEvidencePacket } from '../bondAttorneyModulePhase8.js'
import { buildBondInboundSignalRegister } from '../bondAttorneyModulePhase9.js'

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

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if ([
      'workspace',
      'conditionRegister',
      'signingWorkspace',
      'legalTemplateGate',
      'lodgementPacket',
      'inboundSignalRegister',
      'signals',
      'payload',
      'evidence',
      'facts',
      'value',
      'templates',
      'template',
      'signers',
      'body',
      'sections',
    ].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.equal(BOND_ATTORNEY_PHASE10_RELEASE_GATE_ID, 'bond_attorney_pilot_release_certification')
assert.equal(BOND_ATTORNEY_PHASE10_CONTROL_BOUNDARY.readOnlyCertification, true)
assert.equal(BOND_ATTORNEY_PHASE10_CONTROL_BOUNDARY.writesExternalSystem, false)
assert.equal(BOND_ATTORNEY_PHASE10_CONTROL_BOUNDARY.submitsToBankPortal, false)
assert.equal(BOND_ATTORNEY_PHASE10_CONTROL_BOUNDARY.mutatesRegistryOutcome, false)
assert.equal(BOND_ATTORNEY_PHASE10_CONTROL_BOUNDARY.generatesLegalInstrument, false)

const templates = listBondTemplateControlledDocumentKeys().reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedBondLegalTemplate(documentKey),
}), {})

function buildReadyArtifacts({ inboundSignals = matchedSignals } = {}) {
  const workspace = buildBondPackWorkspace({
    transaction: { id: 'tx-bond-phase10' },
    evidence: completeEvidence(),
    generatedAt: '2026-07-15T08:00:00.000Z',
  })
  const conditionRegister = buildBondConditionRegister({
    workspace,
    actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
    commandId: 'phase10-condition-register',
    generatedAt: '2026-07-15T10:00:00.000Z',
  })
  const signingWorkspace = buildBondSigningWorkspace({
    workspace,
    conditionRegister,
    signers: [readySigner],
    actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
    commandId: 'phase10-signing-ready',
    generatedAt: '2026-07-15T11:00:00.000Z',
  })
  const legalTemplateGate = buildBondLegalTemplateGate({
    workspace,
    signingWorkspace,
    templates,
    actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
    commandId: 'phase10-template-gate',
    generatedAt: '2026-07-15T12:00:00.000Z',
    asOf: '2026-07-15T12:00:00.000Z',
  })
  const lodgementPacket = buildBondLodgementEvidencePacket({
    workspace,
    legalTemplateGate,
    packetEvidence: completePacketEvidence,
    actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
    commandId: 'phase10-lodgement-packet',
    generatedAt: '2026-08-02T10:00:00.000Z',
    asOf: '2026-08-02T10:00:00.000Z',
  })
  const inboundSignalRegister = buildBondInboundSignalRegister({
    lodgementPacket,
    inboundSignals,
    actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
    commandId: 'phase10-inbound-register',
    generatedAt: '2026-08-02T11:00:00.000Z',
  })
  return { workspace, conditionRegister, signingWorkspace, legalTemplateGate, lodgementPacket, inboundSignalRegister }
}

const readyArtifacts = buildReadyArtifacts()
const readyCertification = buildBondAttorneyReleaseCertification({
  ...readyArtifacts,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase10-release-certification-ready',
  generatedAt: '2026-08-02T12:00:00.000Z',
})

assert.equal(readyCertification.version, 'bond_attorney_module_phase10_release_certification_v1')
assert.equal(readyCertification.status, BOND_ATTORNEY_PHASE10_STATUSES.ready)
assert.equal(readyCertification.readyForPilotRelease, true, JSON.stringify(readyCertification.validation.errors, null, 2))
assert.equal(readyCertification.validation.valid, true, JSON.stringify(readyCertification.validation.errors, null, 2))
assert.equal(readyCertification.metrics.closedReleaseBlockerCount, 7)
assert.equal(readyCertification.metrics.openReleaseBlockerCount, 0)
assert.equal(readyCertification.metrics.readyCapabilityCount, readyCertification.metrics.capabilityCount)
assert.equal(readyCertification.metrics.failedCriterionCount, 0)
assert.equal(readyCertification.nextActions.length, 0)
assert.ok(readyCertification.releaseSummary.includes('ready'))
assert.equal(readyCertification.auditEvent.eventType, 'bond_attorney_release_certification_completed')
assert.equal(readyCertification.auditEvent.readyForPilotRelease, true)
assert.equal(containsForbiddenAuditPayload(readyCertification.auditEvent), false)
assert.equal(validateBondAttorneyReleaseCertification(readyCertification).valid, true)

const noSignalArtifacts = buildReadyArtifacts({ inboundSignals: [] })
const noSignalCertification = buildBondAttorneyReleaseCertification({
  ...noSignalArtifacts,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase10-release-certification-no-signals',
  generatedAt: '2026-08-02T12:00:00.000Z',
})
assert.equal(noSignalCertification.readyForPilotRelease, true)
assert.equal(noSignalCertification.metrics.closedReleaseBlockerCount, 7)
assert.equal(noSignalCertification.capabilities.find((item) => item.key === 'inbound_bank_and_registry_reconciliation_ready').ready, true)

const conflictRegister = buildBondInboundSignalRegister({
  lodgementPacket: readyArtifacts.lodgementPacket,
  inboundSignals: [{ ...matchedSignals[0], sourceEventId: 'phase10-atl-conflict', referenceValue: 'ATL-WRONG' }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase10-inbound-conflict',
  generatedAt: '2026-08-02T11:00:00.000Z',
})
const conflictCertification = buildBondAttorneyReleaseCertification({
  ...readyArtifacts,
  inboundSignalRegister: conflictRegister,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase10-release-certification-conflict',
  generatedAt: '2026-08-02T12:00:00.000Z',
})
assert.equal(conflictCertification.status, BOND_ATTORNEY_PHASE10_STATUSES.blocked)
assert.equal(conflictCertification.readyForPilotRelease, false)
assert.equal(conflictCertification.validation.valid, false)
assert.ok(conflictCertification.releaseBlockerClosures.find((item) => item.id === 'bank_and_deeds_integrations_absent').closed === false)
assert.ok(conflictCertification.validation.errors.includes('phase9_inbound_reconciliation_ready_not_met'))
assert.equal(conflictCertification.nextActions[0].actionLabel, 'Resolve Phase 9 inbound signal reconciliation')

const operationalBlockedCertification = buildBondAttorneyReleaseCertification({
  ...readyArtifacts,
  operationalReport: {
    readyForPhase5: false,
    operationalDocumentCount: 8,
    generatedCount: 7,
    failedCount: 1,
  },
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase10-release-certification-operational-blocked',
  generatedAt: '2026-08-02T12:00:00.000Z',
})
assert.equal(operationalBlockedCertification.readyForPilotRelease, false)
assert.ok(operationalBlockedCertification.releaseBlockerClosures.find((item) => item.id === 'bond_operational_generator_missing').closed === false)
assert.ok(operationalBlockedCertification.validation.errors.includes('phase4_operational_generator_ready_not_met'))
assert.ok(operationalBlockedCertification.validation.errors.includes('capability_not_ready:operational_document_drafts_ready'))

const unsafeCertification = buildBondAttorneyReleaseCertification({
  ...readyArtifacts,
  controlOverrides: { writesExternalSystem: true },
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase10-release-certification-unsafe',
  generatedAt: '2026-08-02T12:00:00.000Z',
})
assert.equal(unsafeCertification.readyForPilotRelease, false)
assert.equal(unsafeCertification.validation.valid, false)
assert.ok(unsafeCertification.validation.errors.includes('phase10_release_boundary_safe_not_met'))
assert.ok(unsafeCertification.validation.errors.includes('writesExternalSystem_forbidden'))

const report = buildBondAttorneyPhase10BaselineReport({
  ...readyArtifacts,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase10-report',
  generatedAt: '2026-08-02T12:30:00.000Z',
})
assert.equal(report.readyForPilotRelease, true, JSON.stringify(report, null, 2))
assert.equal(report.openReleaseBlockerCount, 0)
assert.equal(report.blockedCapabilityCount, 0)
assert.equal(report.failedCriterionCount, 0)

console.log(`Bond attorney module Phase 10 release certification passed (${report.closedReleaseBlockerCount} blockers closed).`)
