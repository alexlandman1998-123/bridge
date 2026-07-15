import assert from 'node:assert/strict'
import {
  BOND_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID,
  BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY,
  BOND_SIGNING_WORKSPACE_STATUSES,
  BOND_SIGNER_STATUSES,
  BOND_SIGNING_REQUIREMENT_KEYS,
  buildBondAttorneyPhase6BaselineReport,
  buildBondSigningNextActions,
  buildBondSigningWorkspace,
  validateBondSigningWorkspace,
} from '../bondAttorneyModulePhase6.js'
import { buildBondPackWorkspace } from '../bondAttorneyModulePhase3.js'

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

const openBankConditions = [
  {
    key: 'debit_order_mandate',
    type: 'debit_order',
    label: 'Debit-order mandate',
    ownerRole: 'bank',
    dueDate: '2026-07-16',
    status: 'open',
    bankBlocking: true,
  },
]

const completeEvidence = (bankConditions = readyBankConditions, signing = { method: 'wet_ink', status: 'scheduled' }) => ({
  bank_name: verified('Nedbank'),
  bank_reference: verified('NB-2026-001'),
  approved_bond_amount: verified(1850000),
  mortgagor_identity_and_capacity: verified({ name: 'Alex Buyer', capacity: 'individual mortgagor' }),
  mortgagee_identity: verified({ name: 'Nedbank Limited', registrationNumber: '1951/000009/06' }),
  property_legal_description: verified('Erf 1234 Cape Town, City of Cape Town'),
  title_deed_or_deeds_office_reference: verified('T12345/2021'),
  buyer_marital_or_entity_authority: verified({ status: 'unmarried', authority: 'self' }),
  bank_conditions: verified(bankConditions),
  guarantee_values_and_expiry: verified([{ amount: 1850000, expiresAt: '2026-09-30' }]),
  signing_method_and_signed_pack_status: verified(signing),
  bank_submission_reference: verified('BANK-SUB-77'),
  approval_to_lodge_reference: verified('ATL-2026-22'),
  lodgement_reference: verified('LODGE-2026-101'),
  registration_date: verified('2026-08-02'),
})

const identityVerified = { requirementKey: 'identity_verified', status: 'verified', referenceId: 'doc-id-1', capturedAt: '2026-07-12T09:00:00.000Z', verifiedAt: '2026-07-12T10:00:00.000Z', verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' } }
const signedPackVerified = { requirementKey: 'signed_bond_pack', status: 'verified', referenceId: 'doc-signed-pack-1', artifactHash: 'signed-pack-hash-1', capturedAt: '2026-07-15T09:00:00.000Z', verifiedAt: '2026-07-15T09:30:00.000Z', verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' } }
const originalReceived = { requirementKey: 'original_signed_pack_received', status: 'verified', referenceId: 'vault-original-1', capturedAt: '2026-07-15T10:00:00.000Z', verifiedAt: '2026-07-15T10:30:00.000Z', verifiedBy: { role: 'secretary', userId: 'secretary-1' } }
const witnessAttestation = { requirementKey: 'witness_attestation', status: 'verified', referenceId: 'doc-witness-1', capturedAt: '2026-07-15T10:00:00.000Z', verifiedAt: '2026-07-15T10:30:00.000Z', verifiedBy: { role: 'bond_attorney', userId: 'bond-attorney-1' } }

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['signers', 'evidence', 'facts', 'value', 'renderModel', 'body', 'sections'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.equal(BOND_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID, 'signing_workspace_missing')
assert.equal(BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY.generatesLegalInstrument, false)
assert.equal(BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY.createsSigningProviderEnvelope, false)
assert.equal(BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY.capturesLiveSignature, false)
assert.equal(BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY.submitsToBankPortal, false)

const workspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase6' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(workspace.canonicalData.readyForDrafting, true)

const missingOriginalWorkspace = buildBondSigningWorkspace({
  workspace,
  signers: [{
    signerKey: 'primary_mortgagor',
    signerRole: 'mortgagor',
    partyRole: 'mortgagor',
    capacityType: 'self',
    selectedMethod: 'wet_ink',
    originalRequired: true,
    witnessRequired: true,
    evidence: [identityVerified, signedPackVerified],
  }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase6-signing-1',
  generatedAt: '2026-07-15T11:00:00.000Z',
})
assert.equal(missingOriginalWorkspace.validation.valid, true, JSON.stringify(missingOriginalWorkspace.validation.errors, null, 2))
assert.equal(missingOriginalWorkspace.conditionGate.ready, true)
assert.equal(missingOriginalWorkspace.status, BOND_SIGNING_WORKSPACE_STATUSES.prepared)
assert.equal(missingOriginalWorkspace.readyForPhase7, true)
assert.equal(missingOriginalWorkspace.readyForBankSubmission, false)
assert.equal(missingOriginalWorkspace.metrics.requiredSignerCount, 1)
assert.equal(missingOriginalWorkspace.metrics.capacityReadyCount, 1)
assert.equal(missingOriginalWorkspace.metrics.signedRequiredCount, 0)
assert.equal(missingOriginalWorkspace.metrics.missingOriginalCount, 1)
assert.equal(missingOriginalWorkspace.metrics.signatureEvidenceGapCount, 2)

const primarySigner = missingOriginalWorkspace.signers[0]
assert.equal(primarySigner.status, BOND_SIGNER_STATUSES.partiallySigned)
assert.equal(primarySigner.evidenceContract.preSigningGaps.length, 0)
assert.ok(primarySigner.evidenceContract.signatureGaps.includes(BOND_SIGNING_REQUIREMENT_KEYS.originalSignedPackReceived))
assert.ok(primarySigner.evidenceContract.signatureGaps.includes(BOND_SIGNING_REQUIREMENT_KEYS.witnessAttestation))

const originalNextActions = buildBondSigningNextActions(missingOriginalWorkspace)
assert.equal(originalNextActions[0].actionLabel, 'Receive original wet-ink bond pack')
assert.equal(missingOriginalWorkspace.checklistModel.rows[0].nextAction, 'Receive original wet-ink bond pack')
assert.equal(missingOriginalWorkspace.auditEvent.eventType, 'bond_signing_workspace_prepared')
assert.equal(missingOriginalWorkspace.auditEvent.releaseBlockerId, BOND_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID)
assert.equal(containsForbiddenAuditPayload(missingOriginalWorkspace.auditEvent), false)

const completeSigningWorkspace = buildBondSigningWorkspace({
  workspace,
  signers: [{
    signerKey: 'primary_mortgagor',
    signerRole: 'mortgagor',
    partyRole: 'mortgagor',
    capacityType: 'self',
    selectedMethod: 'wet_ink',
    originalRequired: true,
    witnessRequired: true,
    evidence: [identityVerified, signedPackVerified, originalReceived, witnessAttestation],
  }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase6-signing-2',
  generatedAt: '2026-07-15T11:30:00.000Z',
})
assert.equal(completeSigningWorkspace.validation.valid, true, JSON.stringify(completeSigningWorkspace.validation.errors, null, 2))
assert.equal(completeSigningWorkspace.status, BOND_SIGNING_WORKSPACE_STATUSES.fullySigned)
assert.equal(completeSigningWorkspace.signers[0].status, BOND_SIGNER_STATUSES.signed)
assert.equal(completeSigningWorkspace.readyForPhase7, true)
assert.equal(completeSigningWorkspace.readyForBankSubmission, true)
assert.equal(completeSigningWorkspace.nextActions.length, 0)

const representativeWorkspace = buildBondSigningWorkspace({
  workspace,
  signers: [{
    signerKey: 'buyer_representative',
    signerRole: 'mortgagor_representative',
    partyRole: 'mortgagor',
    capacityType: 'attorney_under_power',
    selectedMethod: 'wet_ink',
    evidence: [identityVerified],
  }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase6-signing-3',
  generatedAt: '2026-07-15T11:45:00.000Z',
})
assert.equal(representativeWorkspace.validation.valid, true, JSON.stringify(representativeWorkspace.validation.errors, null, 2))
assert.equal(representativeWorkspace.readyForPhase7, false)
assert.equal(representativeWorkspace.status, BOND_SIGNING_WORKSPACE_STATUSES.blocked)
assert.ok(representativeWorkspace.validation.warnings.includes('signer_capacity_gap:buyer_representative:capacity_authority'))
assert.equal(representativeWorkspace.nextActions[0].actionLabel, 'Verify signer identity and capacity')

const blockedConditionWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase6-blocked' },
  evidence: completeEvidence(openBankConditions),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const conditionBlockedSigning = buildBondSigningWorkspace({
  workspace: blockedConditionWorkspace,
  signers: [{
    signerKey: 'primary_mortgagor',
    signerRole: 'mortgagor',
    partyRole: 'mortgagor',
    capacityType: 'self',
    selectedMethod: 'wet_ink',
    evidence: [identityVerified, signedPackVerified, originalReceived, witnessAttestation],
  }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase6-signing-4',
  generatedAt: '2026-07-15T12:00:00.000Z',
})
assert.equal(conditionBlockedSigning.validation.valid, false)
assert.ok(conditionBlockedSigning.validation.errors.includes('condition_gate_not_ready'))
assert.equal(conditionBlockedSigning.readyForPhase7, false)
assert.equal(conditionBlockedSigning.nextActions[0].actionLabel, 'Resolve bank conditions before signing')
assert.equal(validateBondSigningWorkspace(conditionBlockedSigning).valid, false)

const report = buildBondAttorneyPhase6BaselineReport({
  transaction: { id: 'tx-bond-phase6-report' },
  evidence: completeEvidence(),
  signers: [{
    signerKey: 'primary_mortgagor',
    signerRole: 'mortgagor',
    partyRole: 'mortgagor',
    capacityType: 'self',
    selectedMethod: 'wet_ink',
    originalRequired: true,
    witnessRequired: true,
    evidence: [identityVerified, signedPackVerified, originalReceived, witnessAttestation],
  }],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase6-report',
  generatedAt: '2026-07-15T12:30:00.000Z',
})
assert.equal(report.readyForPhase7, true, JSON.stringify(report, null, 2))
assert.equal(report.readyForBankSubmission, true)
assert.equal(report.signerCount, 1)
assert.equal(report.missingOriginalCount, 0)

console.log(`Bond attorney module Phase 6 signing workspace passed (${report.signerCount} signer).`)
