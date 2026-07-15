import assert from 'node:assert/strict'
import {
  CANCELLATION_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID,
  CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY,
  CANCELLATION_DOCUMENT_SIGNING_ITEM_STATUSES,
  CANCELLATION_DOCUMENT_SIGNING_WORKSPACE_STATUSES,
  buildApprovedCancellationDocumentTemplate,
  buildCancellationAttorneyPhase7BaselineReport,
  buildCancellationDocumentSigningNextActions,
  buildCancellationDocumentSigningWorkspace,
  getCancellationDocumentTemplateRequiredFactKeys,
  listCancellationTemplateControlledDocumentKeys,
  validateCancellationDocumentSigningWorkspace,
  validateCancellationDocumentTemplate,
} from '../cancellationAttorneyModulePhase7.js'
import { buildCancellationPackWorkspace } from '../cancellationAttorneyModulePhase3.js'
import { buildCancellationFiguresRegister } from '../cancellationAttorneyModulePhase5.js'
import { buildCancellationGuaranteeWorkspace } from '../cancellationAttorneyModulePhase6.js'

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

const completeEvidence = ({
  expiryDate = '2026-08-15T00:00:00.000Z',
  penaltyRisk = 'none',
  guaranteeAmount = 1234567.89,
  guaranteeStatus = 'accepted',
  signingStatus = 'signed_originals_received',
} = {}) => ({
  seller_existing_bond_status: verified('existing_bond_confirmed'),
  cancellation_bank: verified('FNB'),
  cancellation_bond_account_number: verified('FNB-HL-2026-001'),
  lender_instruction_reference: verified('FNB-CAN-2026-77'),
  cancellation_instruction_received_at: verified('2026-07-10'),
  notice_period_status: verified('notice_served'),
  notice_date: verified('2026-05-01'),
  cancellation_figures_amount: verified(1234567.89, { sourceId: 'figures-fnb-1', expiresAt: expiryDate }),
  cancellation_figures_expiry_date: verified(expiryDate, { sourceId: 'figures-fnb-1' }),
  daily_interest_amount: verified(345.67, { sourceId: 'figures-fnb-1' }),
  penalty_notice_risk: verified(penaltyRisk),
  guarantee_required_amount: verified(guaranteeAmount),
  guarantee_beneficiary_and_wording: verified(beneficiaryAndWording),
  guarantee_reference: verified('GTY-CAN-2026-11'),
  guarantee_acceptance_status: verified(guaranteeStatus),
  seller_cancellation_signing_requirement: verified({ required: true, method: 'wet_ink', originalRequired: true }),
  signed_cancellation_document_status: verified(signingStatus),
  lodgement_reference: verified('LOD-CAN-2026-101'),
  lodgement_date: verified('2026-08-02'),
  cancellation_registration_reference: verified('REG-CAN-2026-44'),
  cancellation_registration_date: verified('2026-08-05'),
  settlement_amount: verified(1235000),
  settlement_payment_reference: verified('PAY-CAN-2026-55'),
  closeout_status: verified('complete'),
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

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['documents', 'evidence', 'facts', 'value', 'renderModel', 'body', 'sections', 'clauses'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.equal(CANCELLATION_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID, 'cancellation_document_signing_workspace_missing')
assert.equal(CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY.generatesLegalInstrument, false)
assert.equal(CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY.createsSigningProviderEnvelope, false)
assert.equal(CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY.capturesLiveSignature, false)
assert.equal(CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY.lodgesAtDeedsOffice, false)
assert.equal(CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY.mutatesMatter, false)

const templateKeys = listCancellationTemplateControlledDocumentKeys()
assert.deepEqual(templateKeys, [
  'bank_cancellation_documents',
  'cancellation_consent',
  'bond_discharge_or_cancellation_instrument',
  'seller_authority_resolution_for_cancellation',
])
assert.deepEqual(getCancellationDocumentTemplateRequiredFactKeys('bank_cancellation_documents'), [
  'cancellation_bank',
  'cancellation_bond_account_number',
  'lender_instruction_reference',
  'guarantee_acceptance_status',
])

const templates = templateKeys.reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedCancellationDocumentTemplate(documentKey),
}), {})

const bankTemplateValidation = validateCancellationDocumentTemplate(templates.bank_cancellation_documents, 'bank_cancellation_documents', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(bankTemplateValidation.valid, true, JSON.stringify(bankTemplateValidation.errors, null, 2))
assert.equal(bankTemplateValidation.template.bankApproval.approvalReference, 'bank-approval-bank_cancellation_documents')
assert.equal(bankTemplateValidation.template.firmApproval.approvalReference, null)

const consentTemplateValidation = validateCancellationDocumentTemplate(templates.cancellation_consent, 'cancellation_consent', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(consentTemplateValidation.valid, true, JSON.stringify(consentTemplateValidation.errors, null, 2))
assert.equal(consentTemplateValidation.template.bankApproval.approvalReference, 'bank-approval-cancellation_consent')
assert.equal(consentTemplateValidation.template.firmApproval.approvalReference, 'firm-approval-cancellation_consent')

const genericFallback = buildApprovedCancellationDocumentTemplate('cancellation_consent', {
  overrides: { genericFallbackAllowed: true },
})
const genericFallbackValidation = validateCancellationDocumentTemplate(genericFallback, 'cancellation_consent', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(genericFallbackValidation.valid, false)
assert.ok(genericFallbackValidation.errors.includes('generic_template_fallback_forbidden'))

const missingVariable = buildApprovedCancellationDocumentTemplate('bank_cancellation_documents', {
  overrides: { variableKeys: ['cancellation_bank'] },
})
const missingVariableValidation = validateCancellationDocumentTemplate(missingVariable, 'bank_cancellation_documents', {
  asOf: '2026-07-15T10:00:00.000Z',
})
assert.equal(missingVariableValidation.valid, false)
assert.ok(missingVariableValidation.errors.includes('required_variable_missing:cancellation_bond_account_number'))
assert.ok(missingVariableValidation.errors.includes('required_variable_missing:lender_instruction_reference'))

const packWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase7' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const figuresRegister = buildCancellationFiguresRegister({
  workspace: packWorkspace,
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
  workspace: packWorkspace,
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
  commandId: 'phase7-guarantee-ready',
  generatedAt: '2026-07-15T10:30:00.000Z',
})
assert.equal(guaranteeWorkspace.readyForPhase7, true)

const signingWorkspace = buildCancellationDocumentSigningWorkspace({
  workspace: packWorkspace,
  guaranteeWorkspace,
  templates,
  documents: readyDocumentEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase7-document-signing-1',
  generatedAt: '2026-07-15T11:00:00.000Z',
  asOf: '2026-07-15T11:00:00.000Z',
})
assert.equal(signingWorkspace.validation.valid, true, JSON.stringify(signingWorkspace.validation.errors, null, 2))
assert.equal(signingWorkspace.status, CANCELLATION_DOCUMENT_SIGNING_WORKSPACE_STATUSES.readyForLodgement)
assert.equal(signingWorkspace.readyForPhase8, true)
assert.equal(signingWorkspace.metrics.readyDocumentCount, 4)
assert.equal(signingWorkspace.metrics.waivedDocumentCount, 1)
assert.equal(signingWorkspace.metrics.legalInstrumentGeneratedCount, 0)
assert.equal(signingWorkspace.metrics.signingPacketCreatedCount, 0)
assert.equal(signingWorkspace.nextActions.length, 0)
assert.equal(signingWorkspace.documents.find((document) => document.documentKey === 'seller_authority_resolution_for_cancellation').status, CANCELLATION_DOCUMENT_SIGNING_ITEM_STATUSES.waived)
assert.equal(signingWorkspace.auditEvent.eventType, 'cancellation_document_signing_workspace_prepared')
assert.equal(signingWorkspace.auditEvent.releaseBlockerId, CANCELLATION_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID)
assert.equal(signingWorkspace.auditEvent.readyForPhase8, true)
assert.equal(containsForbiddenAuditPayload(signingWorkspace.auditEvent), false)

const missingSignatureWorkspace = buildCancellationDocumentSigningWorkspace({
  workspace: packWorkspace,
  guaranteeWorkspace,
  templates,
  documents: readyDocumentEvidence.map((document) => document.documentKey === 'cancellation_consent'
    ? { ...document, evidence: [{ requirementKey: 'seller_signature', status: 'verified', referenceId: 'signature-consent-1' }] }
    : document),
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase7-document-signing-2',
  generatedAt: '2026-07-15T11:15:00.000Z',
  asOf: '2026-07-15T11:15:00.000Z',
})
assert.equal(missingSignatureWorkspace.validation.valid, true, JSON.stringify(missingSignatureWorkspace.validation.errors, null, 2))
assert.equal(missingSignatureWorkspace.status, CANCELLATION_DOCUMENT_SIGNING_WORKSPACE_STATUSES.partiallySigned)
assert.equal(missingSignatureWorkspace.readyForPhase8, false)
assert.equal(missingSignatureWorkspace.metrics.signatureGapCount, 1)
assert.ok(missingSignatureWorkspace.validation.warnings.includes('document_signature_gap:cancellation_consent:original_signed_document'))
assert.equal(buildCancellationDocumentSigningNextActions(missingSignatureWorkspace)[0].actionLabel, 'Capture seller signing evidence')
assert.equal(missingSignatureWorkspace.checklistModel.rows.find((row) => row.documentKey === 'cancellation_consent').nextAction, 'Capture seller signing evidence')

const missingBankApproval = buildApprovedCancellationDocumentTemplate('bank_cancellation_documents', {
  bankApproval: { approvedAt: null, approvedBy: {}, approvalReference: '', bankName: '' },
})
const templateBlockedWorkspace = buildCancellationDocumentSigningWorkspace({
  workspace: packWorkspace,
  guaranteeWorkspace,
  templates: { ...templates, bank_cancellation_documents: missingBankApproval },
  documents: readyDocumentEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase7-document-signing-3',
  generatedAt: '2026-07-15T11:30:00.000Z',
  asOf: '2026-07-15T11:30:00.000Z',
})
assert.equal(templateBlockedWorkspace.validation.valid, false)
assert.ok(templateBlockedWorkspace.validation.errors.includes('governed_template_not_ready:bank_cancellation_documents'))
assert.ok(templateBlockedWorkspace.validation.errors.includes('template:bank_cancellation_documents:bank_template_approval_date_required'))
assert.equal(templateBlockedWorkspace.readyForPhase8, false)

const blockedGuaranteeWorkspace = buildCancellationGuaranteeWorkspace({
  workspace: packWorkspace,
  figuresRegister,
  guarantees: [{
    guaranteeId: 'guarantee-blocked',
    reference: 'GTY-CAN-2026-11',
    status: 'received',
    amount: 1200000,
    requiredAmount: 1234567.89,
    beneficiaryAndWording: { beneficiary: 'Wrong Bank', wording: 'incorrect wording' },
    expectedBeneficiaryAndWording: beneficiaryAndWording,
    evidence: [{ requirementKey: 'guarantee_document', status: 'verified', referenceId: 'doc-guarantee-1' }],
  }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase7-guarantee-blocked',
  generatedAt: '2026-07-15T10:40:00.000Z',
})
const guaranteeBlockedSigning = buildCancellationDocumentSigningWorkspace({
  workspace: packWorkspace,
  guaranteeWorkspace: blockedGuaranteeWorkspace,
  templates,
  documents: readyDocumentEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase7-document-signing-4',
  generatedAt: '2026-07-15T11:45:00.000Z',
  asOf: '2026-07-15T11:45:00.000Z',
})
assert.equal(guaranteeBlockedSigning.validation.valid, false)
assert.ok(guaranteeBlockedSigning.validation.errors.includes('guarantee_gate_not_ready'))
assert.equal(guaranteeBlockedSigning.readyForPhase8, false)
assert.equal(guaranteeBlockedSigning.nextActions[0].actionLabel, 'Clear guarantee workspace before cancellation signing')
assert.equal(validateCancellationDocumentSigningWorkspace(guaranteeBlockedSigning).valid, false)

const missingFactPack = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase7-missing' },
  evidence: { cancellation_bank: verified('FNB') },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const missingFactSigning = buildCancellationDocumentSigningWorkspace({
  workspace: missingFactPack,
  guaranteeWorkspace,
  templates,
  documents: readyDocumentEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase7-document-signing-5',
  generatedAt: '2026-07-15T12:00:00.000Z',
  asOf: '2026-07-15T12:00:00.000Z',
})
assert.equal(missingFactSigning.validation.valid, false)
assert.ok(missingFactSigning.validation.errors.includes('seller_cancellation_signing_requirement_fact_not_verified'))
assert.ok(missingFactSigning.validation.errors.includes('signed_cancellation_document_status_fact_not_verified'))

const report = buildCancellationAttorneyPhase7BaselineReport({
  workspace: packWorkspace,
  guaranteeWorkspace,
  templates,
  documents: readyDocumentEvidence,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase7-report',
  generatedAt: '2026-07-15T12:30:00.000Z',
  asOf: '2026-07-15T12:30:00.000Z',
})
assert.equal(report.readyForPhase8, true, JSON.stringify(report, null, 2))
assert.equal(report.templateControlledCount, 4)
assert.equal(report.readyDocumentCount, 4)
assert.equal(report.legalInstrumentsGenerated, false)
assert.equal(report.signingPacketsCreated, false)

console.log(`Cancellation attorney module Phase 7 document/signing workspace passed (${report.readyDocumentCount} ready documents).`)
