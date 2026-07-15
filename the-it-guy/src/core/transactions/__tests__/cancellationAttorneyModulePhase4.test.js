import assert from 'node:assert/strict'
import {
  CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY,
  CANCELLATION_OPERATIONAL_DOCUMENT_STATUS,
  buildApprovedCancellationOperationalTemplate,
  buildCancellationAttorneyPhase4BaselineReport,
  generateCancellationOperationalDocument,
  generateCancellationOperationalDocumentPack,
  listCancellationOperationalDocumentKeys,
  validateCancellationOperationalTemplate,
} from '../cancellationAttorneyModulePhase4.js'
import { buildCancellationPackWorkspace } from '../cancellationAttorneyModulePhase3.js'

const verified = (value, overrides = {}) => ({
  value,
  sourceId: overrides.sourceId || 'source-cancellation-pack-1',
  capturedAt: overrides.capturedAt || '2026-07-10T09:00:00.000Z',
  verifiedAt: overrides.verifiedAt || '2026-07-10T10:00:00.000Z',
  verifiedBy: overrides.verifiedBy || { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  expiresAt: overrides.expiresAt || null,
})

const completeEvidence = {
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
  penalty_notice_risk: verified({ status: 'at_risk', reason: 'notice period shorter than settlement assumption' }),
  guarantee_required_amount: verified(1234567.89),
  guarantee_beneficiary_and_wording: verified({ beneficiary: 'FNB Home Loans', wording: 'payable to existing lender on registration' }),
  guarantee_reference: verified('GTY-CAN-2026-11'),
  guarantee_acceptance_status: verified('accepted'),
  seller_cancellation_signing_requirement: verified({ required: true, method: 'wet_ink' }),
  signed_cancellation_document_status: verified('signed_originals_received'),
  lodgement_reference: verified('LOD-CAN-2026-101'),
  lodgement_date: verified('2026-08-02'),
  cancellation_registration_reference: verified('REG-CAN-2026-44'),
  cancellation_registration_date: verified('2026-08-05'),
  settlement_amount: verified(1235000),
  settlement_payment_reference: verified('PAY-CAN-2026-55'),
  closeout_status: verified('complete'),
}

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['renderModel', 'sections', 'body', 'facts', 'value'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

const operationalKeys = listCancellationOperationalDocumentKeys()
assert.deepEqual(operationalKeys, [
  'cancellation_instruction_acknowledgement',
  'seller_existing_bond_information_request',
  'cancellation_figures_request_cover',
  'notice_penalty_risk_summary',
  'cancellation_guarantee_request_cover',
  'guarantee_acceptance_or_variance_note',
  'cancellation_lodgement_readiness_checklist',
  'cancellation_registration_notification',
  'settlement_closeout_report',
])
assert.equal(CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed, false)
assert.equal(CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.signingAllowed, false)
assert.equal(CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.lenderSubmissionAllowed, false)
assert.equal(CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.deedsSubmissionAllowed, false)
assert.equal(CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.settlementExecutionAllowed, false)
assert.equal(CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.registrationMarkingAllowed, false)

const workspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase4' },
  lane: {
    currentStage: 'cancellation_figures_received',
    permissions: { canUpdateStage: true, canRequestDocuments: true },
  },
  evidence: completeEvidence,
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(workspace.canonicalData.readyForCancellationPack, true)

const approvedTemplate = buildApprovedCancellationOperationalTemplate('cancellation_figures_request_cover', {
  approvedBy: { role: 'firm_manager', userId: 'manager-1' },
})
const templateValidation = validateCancellationOperationalTemplate(approvedTemplate, 'cancellation_figures_request_cover')
assert.equal(templateValidation.valid, true, JSON.stringify(templateValidation.errors, null, 2))

const generated = generateCancellationOperationalDocument({
  workspace,
  documentKey: 'cancellation_figures_request_cover',
  template: approvedTemplate,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase4-command-1',
  generatedAt: '2026-07-15T09:00:00.000Z',
  firmBranding: { firmName: 'Pilot Cancellation Attorneys', email: 'cancellations@example.test', phone: '+27110000000' },
})
assert.equal(generated.ok, true, JSON.stringify(generated.errors, null, 2))
assert.equal(generated.document.releaseBlockerId, 'cancellation_operational_generator_missing')
assert.equal(generated.document.status, CANCELLATION_OPERATIONAL_DOCUMENT_STATUS.draftGenerated)
assert.equal(generated.document.reviewRequired, true)
assert.equal(generated.document.finalAllowed, false)
assert.equal(generated.document.signingAllowed, false)
assert.equal(generated.document.dispatchAllowed, false)
assert.equal(generated.document.lenderSubmissionAllowed, false)
assert.equal(generated.document.bankPortalSubmissionAllowed, false)
assert.equal(generated.document.deedsSubmissionAllowed, false)
assert.equal(generated.document.settlementExecutionAllowed, false)
assert.equal(generated.document.registrationMarkingAllowed, false)
assert.equal(generated.document.watermark, 'DRAFT - CANCELLATION ATTORNEY REVIEW REQUIRED')
assert.equal(generated.document.template.locked, true)
assert.equal(generated.document.dataFingerprint, workspace.dataFingerprint)
assert.equal(generated.document.version.dataFingerprint, workspace.dataFingerprint)
assert.equal(generated.document.artifactLink.workspaceId, workspace.workspaceId)
assert.equal(generated.document.artifactLink.documentKey, 'cancellation_figures_request_cover')
assert.equal(generated.document.renderModel.header.firmName, 'Pilot Cancellation Attorneys')
assert.match(generated.document.renderModel.sections[0].body, /FNB/)
assert.match(generated.document.renderModel.sections[0].body, /FNB-HL-2026-001/)
assert.match(generated.document.renderModel.sections[1].body, /does not accept or alter lender figures automatically/)
assert.equal(generated.auditEvent.eventType, 'cancellation_operational_document_generated')
assert.equal(containsForbiddenAuditPayload(generated.auditEvent), false)

const unapprovedTemplate = buildApprovedCancellationOperationalTemplate('cancellation_figures_request_cover', {
  status: 'draft',
  locked: false,
})
const blockedTemplate = generateCancellationOperationalDocument({
  workspace,
  documentKey: 'cancellation_figures_request_cover',
  template: unapprovedTemplate,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase4-command-2',
})
assert.equal(blockedTemplate.ok, false)
assert.equal(blockedTemplate.code, 'cancellation_operational_template_invalid')
assert.ok(blockedTemplate.errors.includes('template_not_approved'))
assert.ok(blockedTemplate.errors.includes('template_wording_not_locked'))

const missingWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase4' },
  evidence: { cancellation_bank: verified('FNB') },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const blockedMissingFacts = generateCancellationOperationalDocument({
  workspace: missingWorkspace,
  documentKey: 'cancellation_figures_request_cover',
  template: approvedTemplate,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase4-command-3',
})
assert.equal(blockedMissingFacts.ok, false)
assert.equal(blockedMissingFacts.code, 'canonical_cancellation_data_not_ready')

const blockedBankDocuments = generateCancellationOperationalDocument({
  workspace,
  documentKey: 'bank_cancellation_documents',
  template: approvedTemplate,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase4-command-4',
})
assert.equal(blockedBankDocuments.ok, false)
assert.equal(blockedBankDocuments.code, 'unsupported_cancellation_operational_document')

const blockedIngestOnly = generateCancellationOperationalDocument({
  workspace,
  documentKey: 'lender_cancellation_instruction',
  template: approvedTemplate,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase4-command-5',
})
assert.equal(blockedIngestOnly.ok, false)
assert.equal(blockedIngestOnly.code, 'unsupported_cancellation_operational_document')

const blockedActor = generateCancellationOperationalDocument({
  workspace,
  documentKey: 'cancellation_figures_request_cover',
  template: approvedTemplate,
  actor: { role: 'seller', userId: 'seller-1' },
  commandId: 'phase4-command-6',
})
assert.equal(blockedActor.ok, false)
assert.equal(blockedActor.code, 'cancellation_operational_actor_not_authorised')

const templates = operationalKeys.reduce((result, documentKey) => ({
  ...result,
  [documentKey]: buildApprovedCancellationOperationalTemplate(documentKey, {
    approvedBy: { role: 'firm_manager', userId: 'manager-1' },
  }),
}), {})
const pack = generateCancellationOperationalDocumentPack({
  workspace,
  templates,
  actor: { role: 'secretary', userId: 'secretary-1' },
  commandIdPrefix: 'phase4-pack',
  generatedAt: '2026-07-15T09:30:00.000Z',
  firmBranding: { firmName: 'Pilot Cancellation Attorneys' },
})
assert.equal(pack.releaseBlockerId, 'cancellation_operational_generator_missing')
assert.equal(pack.documentCount, 9)
assert.equal(pack.generatedCount, 9)
assert.equal(pack.failedCount, 0)
assert.ok(pack.results.every((result) => result.ok && result.document.reviewRequired && !result.document.finalAllowed))
assert.ok(pack.results.every((result) => !result.document.settlementExecutionAllowed && !result.document.registrationMarkingAllowed))

const report = buildCancellationAttorneyPhase4BaselineReport({
  transaction: { id: 'tx-cancellation-phase4' },
  evidence: completeEvidence,
  generatedAt: '2026-07-15T08:00:00.000Z',
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  firmBranding: { firmName: 'Pilot Cancellation Attorneys' },
})
assert.equal(report.readyForPhase5, true, JSON.stringify(report, null, 2))
assert.equal(report.operationalDocumentCount, 9)
assert.equal(report.generatedCount, 9)
assert.equal(report.blockedNonOperational.length, 10)
assert.ok(report.blockedNonOperational.includes('bank_cancellation_documents'))
assert.ok(report.blockedNonOperational.includes('proof_of_settlement'))

console.log(`Cancellation attorney module Phase 4 operational generator passed (${report.generatedCount} draft documents).`)
