import assert from 'node:assert/strict'
import {
  BOND_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID,
  BOND_LEGAL_TEMPLATE_GATE_STATUSES,
  BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY,
  buildApprovedBondLegalTemplate,
  buildBondAttorneyPhase7BaselineReport,
  buildBondLegalTemplateGate,
  getBondLegalTemplateRequiredFactKeys,
  listBondTemplateControlledDocumentKeys,
  validateBondLegalTemplate,
} from '../bondAttorneyModulePhase7.js'
import { buildBondPackWorkspace } from '../bondAttorneyModulePhase3.js'
import { buildBondSigningWorkspace } from '../bondAttorneyModulePhase6.js'

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

const completeEvidence = (bankConditions = readyBankConditions) => ({
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

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['templates', 'template', 'variables', 'clauses', 'facts', 'value', 'signers', 'evidence', 'body', 'sections'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

const templateKeys = listBondTemplateControlledDocumentKeys()
assert.deepEqual(templateKeys, [
  'power_of_attorney_to_pass_mortgage_bond',
  'company_or_trust_authority_resolution',
  'mortgage_bond_draft',
  'banking_mandate_or_debit_order',
])
assert.deepEqual(getBondLegalTemplateRequiredFactKeys('mortgage_bond_draft'), [
  'bank_name',
  'bank_reference',
  'approved_bond_amount',
  'mortgagor_identity_and_capacity',
  'mortgagee_identity',
  'property_legal_description',
  'title_deed_or_deeds_office_reference',
])
assert.equal(BOND_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID, 'legal_instrument_templates_not_approved')
assert.equal(BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY.generatesLegalInstrument, false)
assert.equal(BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY.rendersDocument, false)
assert.equal(BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY.allowsGenericFallback, false)
assert.equal(BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY.submitsToBankPortal, false)

const templates = templateKeys.reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedBondLegalTemplate(documentKey),
}), {})

const mortgageTemplateValidation = validateBondLegalTemplate(templates.mortgage_bond_draft, 'mortgage_bond_draft', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(mortgageTemplateValidation.valid, true, JSON.stringify(mortgageTemplateValidation.errors, null, 2))
assert.equal(mortgageTemplateValidation.template.firmApproval.approvalReference, 'firm-approval-mortgage_bond_draft')
assert.equal(mortgageTemplateValidation.template.bankApproval.approvalReference, 'bank-approval-mortgage_bond_draft')

const bankOnlyTemplate = validateBondLegalTemplate(templates.banking_mandate_or_debit_order, 'banking_mandate_or_debit_order', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(bankOnlyTemplate.valid, true, JSON.stringify(bankOnlyTemplate.errors, null, 2))
assert.equal(bankOnlyTemplate.template.firmApproval.approvalReference, null)
assert.equal(bankOnlyTemplate.template.bankApproval.approvalReference, 'bank-approval-banking_mandate_or_debit_order')

const firmOnlyTemplate = validateBondLegalTemplate(templates.company_or_trust_authority_resolution, 'company_or_trust_authority_resolution', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(firmOnlyTemplate.valid, true, JSON.stringify(firmOnlyTemplate.errors, null, 2))
assert.equal(firmOnlyTemplate.template.firmApproval.approvalReference, 'firm-approval-company_or_trust_authority_resolution')
assert.equal(firmOnlyTemplate.template.bankApproval.approvalReference, null)

const missingBankApproval = buildApprovedBondLegalTemplate('mortgage_bond_draft', {
  bankApproval: { approvedAt: null, approvedBy: {}, approvalReference: '', bankName: '' },
})
const missingBankValidation = validateBondLegalTemplate(missingBankApproval, 'mortgage_bond_draft', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(missingBankValidation.valid, false)
assert.ok(missingBankValidation.errors.includes('bank_template_approval_date_required'))
assert.ok(missingBankValidation.errors.includes('bank_template_approval_reference_required'))
assert.ok(missingBankValidation.errors.includes('bank_template_bank_name_required'))

const genericFallback = buildApprovedBondLegalTemplate('power_of_attorney_to_pass_mortgage_bond', {
  overrides: { genericFallbackAllowed: true },
})
const genericFallbackValidation = validateBondLegalTemplate(genericFallback, 'power_of_attorney_to_pass_mortgage_bond', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(genericFallbackValidation.valid, false)
assert.ok(genericFallbackValidation.errors.includes('generic_template_fallback_forbidden'))

const missingVariable = buildApprovedBondLegalTemplate('mortgage_bond_draft', {
  overrides: { variableKeys: ['bank_name', 'bank_reference'] },
})
const missingVariableValidation = validateBondLegalTemplate(missingVariable, 'mortgage_bond_draft', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(missingVariableValidation.valid, false)
assert.ok(missingVariableValidation.errors.includes('required_variable_missing:approved_bond_amount'))
assert.ok(missingVariableValidation.errors.includes('required_variable_missing:mortgagor_identity_and_capacity'))

const workspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase7' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const signingWorkspace = buildBondSigningWorkspace({
  workspace,
  signers: [readySigner],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase7-signing-ready',
  generatedAt: '2026-07-15T11:00:00.000Z',
})
assert.equal(signingWorkspace.readyForPhase7, true)

const gate = buildBondLegalTemplateGate({
  workspace,
  signingWorkspace,
  templates,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase7-template-gate-1',
  generatedAt: '2026-07-15T12:00:00.000Z',
  asOf: '2026-07-15T12:00:00.000Z',
})
assert.equal(gate.status, BOND_LEGAL_TEMPLATE_GATE_STATUSES.ready, JSON.stringify(gate.bindings, null, 2))
assert.equal(gate.readyForPhase8, true)
assert.equal(gate.templateControlledCount, 4)
assert.equal(gate.readyTemplateCount, 4)
assert.equal(gate.blockedTemplateCount, 0)
assert.equal(gate.legalInstrumentsGenerated, false)
assert.equal(gate.generationCommandsPrepared, false)
assert.ok(gate.bindings.every((binding) => binding.generationAllowed && binding.legalInstrumentGenerated === false))
assert.equal(gate.auditEvent.eventType, 'bond_legal_template_gate_evaluated')
assert.equal(gate.auditEvent.releaseBlockerId, BOND_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID)
assert.equal(gate.auditEvent.readyForPhase8, true)
assert.equal(containsForbiddenAuditPayload(gate.auditEvent), false)

const blockedWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase7-blocked' },
  evidence: completeEvidence(openBankConditions),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const blockedSigningWorkspace = buildBondSigningWorkspace({
  workspace: blockedWorkspace,
  signers: [readySigner],
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase7-signing-blocked',
  generatedAt: '2026-07-15T11:00:00.000Z',
})
assert.equal(blockedSigningWorkspace.readyForPhase7, false)
const blockedGate = buildBondLegalTemplateGate({
  workspace: blockedWorkspace,
  signingWorkspace: blockedSigningWorkspace,
  templates,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase7-template-gate-2',
  generatedAt: '2026-07-15T12:00:00.000Z',
  asOf: '2026-07-15T12:00:00.000Z',
})
assert.equal(blockedGate.status, BOND_LEGAL_TEMPLATE_GATE_STATUSES.blocked)
assert.equal(blockedGate.signingReady, false)
assert.equal(blockedGate.readyForPhase8, false)
assert.ok(blockedGate.signingValidation.errors.includes('condition_gate_not_ready'))
assert.ok(blockedGate.bindings.every((binding) => !binding.generationAllowed))

const incompleteTemplates = { ...templates, mortgage_bond_draft: missingBankApproval }
const templateBlockedGate = buildBondLegalTemplateGate({
  workspace,
  signingWorkspace,
  templates: incompleteTemplates,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase7-template-gate-3',
  generatedAt: '2026-07-15T12:00:00.000Z',
  asOf: '2026-07-15T12:00:00.000Z',
})
assert.equal(templateBlockedGate.status, BOND_LEGAL_TEMPLATE_GATE_STATUSES.blocked)
assert.equal(templateBlockedGate.readyTemplateCount, 3)
assert.equal(templateBlockedGate.blockedTemplateCount, 1)
assert.equal(templateBlockedGate.bindings.find((binding) => binding.documentKey === 'mortgage_bond_draft').generationAllowed, false)

const report = buildBondAttorneyPhase7BaselineReport({
  workspace,
  signingWorkspace,
  templates,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase7-report',
  generatedAt: '2026-07-15T12:30:00.000Z',
  asOf: '2026-07-15T12:30:00.000Z',
})
assert.equal(report.readyForPhase8, true, JSON.stringify(report, null, 2))
assert.equal(report.templateControlledCount, 4)
assert.equal(report.readyTemplateCount, 4)
assert.equal(report.legalInstrumentsGenerated, false)

console.log(`Bond attorney module Phase 7 template governance passed (${report.readyTemplateCount} governed templates).`)
