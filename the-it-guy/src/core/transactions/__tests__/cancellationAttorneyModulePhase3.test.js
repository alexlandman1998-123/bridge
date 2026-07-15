import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CANCELLATION_PACK_DRAFT_WATERMARK,
  CANCELLATION_PACK_WORKSPACE_STATUSES as S,
  buildCancellationAttorneyPhase3BaselineReport,
  buildCancellationPackWorkspace,
  buildCancellationPackWorkspaceAuditEvent,
  canTransitionCancellationPackWorkspaceStatus,
  prepareCancellationPackDraftVersion,
  validateCancellationPackWorkspace,
} from '../cancellationAttorneyModulePhase3.js'
import { resolveCancellationAttorneyCanonicalData } from '../cancellationAttorneyModulePhase2.js'
import { buildCancellationAttorneyCockpit } from '../attorneyCancellationWorldClassCockpit.js'

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

function containsForbiddenPayloadKey(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['facts', 'resolved', 'content', 'body', 'value'].includes(String(key))) return true
    return containsForbiddenPayloadKey(nested)
  })
}

const notStarted = buildCancellationPackWorkspace({ generatedAt: '2026-07-15T08:00:00.000Z' })
assert.equal(notStarted.status, S.notStarted)
assert.equal(notStarted.releaseBlockerId, 'cancellation_pack_workspace_missing')
assert.equal(notStarted.counts.itemCount, 19)
assert.equal(notStarted.counts.blockedItemCount, 19)
assert.equal(notStarted.counts.documentRequirementCount >= 10, true)
assert.equal(notStarted.controls.noSilentRegeneration, true)
assert.equal(notStarted.controls.sourceEvidenceOnlyForBankOutcomes, true)
assert.equal(notStarted.controls.noExternalSettlementExecution, true)
assert.equal(notStarted.controls.noStageOnlyRegistration, true)

const missing = buildCancellationPackWorkspace({
  evidence: { cancellation_bank: verified('FNB') },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(missing.status, S.missingInfo)
assert.ok(missing.canonicalData.missingFactKeys.includes('cancellation_bond_account_number'))
assert.equal(missing.packItems.find((item) => item.id === 'cancellation_figures_request_cover').generationState, 'missing_verified_facts')

const ready = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase3' },
  lane: {
    currentStage: 'cancellation_figures_received',
    permissions: { canUpdateStage: true, canRequestDocuments: true },
  },
  evidence: completeEvidence,
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(ready.status, S.readyToPrepare)
assert.equal(ready.canonicalData.readyForCancellationPack, true)
assert.equal(ready.counts.readyItemCount, 19)
assert.equal(ready.counts.operationalDraftItemCount, 9)
assert.equal(ready.counts.templateControlledItemCount, 4)
assert.equal(ready.counts.evidenceItemCount, 6)
assert.equal(ready.packItems.find((item) => item.id === 'cancellation_figures_request_cover').generationState, 'ready_for_phase4_generator')
assert.equal(ready.packItems.find((item) => item.id === 'bank_cancellation_documents').generationState, 'waiting_for_governed_template')
assert.equal(ready.packItems.find((item) => item.id === 'lender_cancellation_instruction').generationState, 'source_evidence_verified')
assert.equal(ready.packItems.find((item) => item.id === 'proof_of_settlement').evidenceState, 'source_evidence_verified')
assert.ok(ready.documentCoverage.richRequirementIdsNotOnStages.includes('proof_of_settlement'))
assert.equal(validateCancellationPackWorkspace(ready).valid, true)

const blockedDraft = prepareCancellationPackDraftVersion({
  workspace: missing,
  templateVersionId: 'template-v1',
  contentHash: 'content-hash-1',
  commandId: 'command-1',
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
})
assert.equal(blockedDraft.ok, false)
assert.ok(blockedDraft.errors.includes('canonical_data_not_ready'))

const noSilentDraft = prepareCancellationPackDraftVersion({
  workspace: ready,
  templateVersionId: 'template-v1',
  contentHash: 'content-hash-1',
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
})
assert.equal(noSilentDraft.ok, false)
assert.ok(noSilentDraft.errors.includes('generation_command_required'))

const draft = prepareCancellationPackDraftVersion({
  workspace: ready,
  templateVersionId: 'template-v1',
  templateFingerprint: 'template-fingerprint-v1',
  contentHash: 'content-hash-1',
  commandId: 'command-1',
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(draft.ok, true)
assert.equal(draft.version.status, S.draftPrepared)
assert.equal(draft.version.watermark, CANCELLATION_PACK_DRAFT_WATERMARK)
assert.equal(draft.version.contentImmutable, true)
assert.equal(draft.version.dataFingerprint, ready.dataFingerprint)
assert.equal(draft.auditEvent.eventType, 'cancellation_pack_draft_prepared')
assert.equal(containsForbiddenPayloadKey(draft.auditEvent), false)

const withDraft = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase3' },
  evidence: completeEvidence,
  versions: [draft.version],
  generatedAt: '2026-07-15T10:00:00.000Z',
})
assert.equal(withDraft.status, S.draftPrepared)
assert.equal(validateCancellationPackWorkspace(withDraft).valid, true)

assert.deepEqual(canTransitionCancellationPackWorkspaceStatus({ from: S.readyToPrepare, to: S.draftPrepared, workspace: ready }), { allowed: true, reason: 'transition_allowed' })
assert.deepEqual(canTransitionCancellationPackWorkspaceStatus({ from: S.draftPrepared, to: S.approved, workspace: withDraft }), { allowed: false, reason: 'transition_not_allowed' })

const reviewWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase3' },
  evidence: completeEvidence,
  versions: [{ ...draft.version, status: S.attorneyReview }],
  generatedAt: '2026-07-15T10:00:00.000Z',
})
assert.deepEqual(canTransitionCancellationPackWorkspaceStatus({ from: S.attorneyReview, to: S.approved, workspace: reviewWorkspace }), { allowed: true, reason: 'transition_allowed' })
assert.deepEqual(canTransitionCancellationPackWorkspaceStatus({ from: S.attorneyReview, to: S.superseded, workspace: reviewWorkspace }), { allowed: false, reason: 'transition_reason_required' })
assert.deepEqual(canTransitionCancellationPackWorkspaceStatus({ from: S.attorneyReview, to: S.superseded, workspace: reviewWorkspace, reason: 'Lender issued amended cancellation figures.' }), { allowed: true, reason: 'transition_allowed' })

const changedCanonicalData = resolveCancellationAttorneyCanonicalData({
  evidence: { ...completeEvidence, cancellation_bond_account_number: verified('FNB-HL-2026-002') },
  resolvedAt: '2026-07-15T11:00:00.000Z',
})
const invalidatedWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase3' },
  canonicalData: changedCanonicalData,
  versions: [draft.version],
  generatedAt: '2026-07-15T11:00:00.000Z',
})
assert.equal(invalidatedWorkspace.requiresRegeneration, true)
assert.equal(invalidatedWorkspace.status, S.readyToPrepare)
assert.ok(invalidatedWorkspace.draftInvalidation.changedFactKeys.includes('cancellation_bond_account_number'))

const audit = buildCancellationPackWorkspaceAuditEvent({
  workspace: invalidatedWorkspace,
  eventType: 'cancellation pack data changed',
  actor: { role: 'system', userId: 'system' },
  version: draft.version,
  reason: 'Canonical cancellation account number changed.',
  commandId: 'audit-command-1',
  occurredAt: '2026-07-15T12:00:00.000Z',
})
assert.equal(audit.eventType, 'cancellation_pack_data_changed')
assert.equal(audit.versionBinding.watermark, CANCELLATION_PACK_DRAFT_WATERMARK)
assert.equal(containsForbiddenPayloadKey(audit), false)

const cockpit = buildCancellationAttorneyCockpit({
  resolvedAt: '2026-07-15T08:00:00.000Z',
  evidence: completeEvidence,
  lane: {
    currentStage: 'cancellation_figures_received',
    permissions: { canUpdateStage: true, canRequestDocuments: true },
  },
})
assert.equal(cockpit.phase3PackWorkspace.version, 'cancellation_attorney_module_phase3_pack_workspace_v1')
assert.equal(cockpit.phase3PackWorkspace.status, S.readyToPrepare)
assert.equal(cockpit.phase3PackWorkspace.counts.itemCount, 19)

const cockpitSource = readFileSync(new URL('../attorneyCancellationWorldClassCockpit.js', import.meta.url), 'utf8')
assert.match(cockpitSource, /buildCancellationPackWorkspace/)
assert.match(cockpitSource, /phase3PackWorkspace/)

const report = buildCancellationAttorneyPhase3BaselineReport({
  transaction: { id: 'tx-cancellation-phase3' },
  evidence: completeEvidence,
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(report.readyForPhase4, true, JSON.stringify(report, null, 2))
assert.equal(report.statusCount, 16)
assert.equal(report.packItemCount, 19)
assert.equal(report.documentRequirementCount >= 10, true)

console.log(`Cancellation attorney module Phase 3 pack workspace passed (${report.packItemCount} pack items).`)
