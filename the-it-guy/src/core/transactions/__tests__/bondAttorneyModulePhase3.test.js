import assert from 'node:assert/strict'
import {
  BOND_PACK_DRAFT_WATERMARK,
  BOND_PACK_WORKSPACE_STATUSES as S,
  buildBondAttorneyPhase3BaselineReport,
  buildBondPackWorkspace,
  buildBondPackWorkspaceAuditEvent,
  canTransitionBondPackWorkspaceStatus,
  prepareBondPackDraftVersion,
  validateBondPackWorkspace,
} from '../bondAttorneyModulePhase3.js'
import { resolveBondAttorneyCanonicalData } from '../bondAttorneyModulePhase2.js'

const verified = (value, overrides = {}) => ({
  value,
  sourceId: overrides.sourceId || 'source-bank-pack-1',
  capturedAt: overrides.capturedAt || '2026-07-10T09:00:00.000Z',
  verifiedAt: overrides.verifiedAt || '2026-07-10T10:00:00.000Z',
  verifiedBy: overrides.verifiedBy || { role: 'bond_attorney', userId: 'bond-attorney-1' },
  expiresAt: overrides.expiresAt || null,
})

const completeEvidence = {
  bank_name: verified('Nedbank'),
  bank_reference: verified('NB-2026-001'),
  approved_bond_amount: verified(1850000),
  mortgagor_identity_and_capacity: verified({ name: 'Alex Buyer', capacity: 'individual mortgagor' }),
  mortgagee_identity: verified({ name: 'Nedbank Limited', registrationNumber: '1951/000009/06' }),
  property_legal_description: verified('Erf 1234 Cape Town, City of Cape Town'),
  title_deed_or_deeds_office_reference: verified('T12345/2021'),
  buyer_marital_or_entity_authority: verified({ status: 'unmarried', authority: 'self' }),
  bank_conditions: verified([{ key: 'insurance', owner: 'buyer', status: 'satisfied' }]),
  guarantee_values_and_expiry: verified([{ amount: 1850000, expiresAt: '2026-09-30' }]),
  signing_method_and_signed_pack_status: verified({ method: 'wet_ink', status: 'signed_originals_received' }),
  bank_submission_reference: verified('BANK-SUB-77'),
  approval_to_lodge_reference: verified('ATL-2026-22'),
  lodgement_reference: verified('LODGE-2026-101'),
  registration_date: verified('2026-08-02'),
}

function containsForbiddenPayloadKey(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['facts', 'resolved', 'content', 'body', 'value'].includes(String(key))) return true
    return containsForbiddenPayloadKey(nested)
  })
}

const notStarted = buildBondPackWorkspace({ generatedAt: '2026-07-15T08:00:00.000Z' })
assert.equal(notStarted.status, S.notStarted)
assert.equal(notStarted.counts.itemCount, 16)
assert.equal(notStarted.counts.blockedItemCount, 16)
assert.equal(notStarted.controls.noSilentRegeneration, true)

const missing = buildBondPackWorkspace({
  evidence: { bank_name: verified('Nedbank') },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(missing.status, S.missingInfo)
assert.ok(missing.canonicalData.missingFactKeys.includes('bank_reference'))

const ready = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase3' },
  evidence: completeEvidence,
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(ready.status, S.readyToDraft)
assert.equal(ready.canonicalData.readyForDrafting, true)
assert.equal(ready.counts.readyItemCount, 16)
assert.equal(ready.packItems.find((item) => item.id === 'mortgage_bond_draft').generationState, 'waiting_for_governed_template')
assert.equal(ready.packItems.find((item) => item.id === 'instruction_acknowledgement').generationState, 'ready_for_phase4_generator')
assert.equal(ready.packItems.find((item) => item.id === 'bond_instruction').generationState, 'source_evidence_required')
assert.equal(validateBondPackWorkspace(ready).valid, true)

const blockedDraft = prepareBondPackDraftVersion({
  workspace: missing,
  templateVersionId: 'template-v1',
  contentHash: 'content-hash-1',
  commandId: 'command-1',
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
})
assert.equal(blockedDraft.ok, false)
assert.ok(blockedDraft.errors.includes('canonical_data_not_ready'))

const noSilentDraft = prepareBondPackDraftVersion({
  workspace: ready,
  templateVersionId: 'template-v1',
  contentHash: 'content-hash-1',
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
})
assert.equal(noSilentDraft.ok, false)
assert.ok(noSilentDraft.errors.includes('generation_command_required'))

const draft = prepareBondPackDraftVersion({
  workspace: ready,
  templateVersionId: 'template-v1',
  templateFingerprint: 'template-fingerprint-v1',
  contentHash: 'content-hash-1',
  commandId: 'command-1',
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(draft.ok, true)
assert.equal(draft.version.status, S.draftGenerated)
assert.equal(draft.version.watermark, BOND_PACK_DRAFT_WATERMARK)
assert.equal(draft.version.contentImmutable, true)
assert.equal(draft.version.dataFingerprint, ready.dataFingerprint)
assert.equal(draft.version.signingAllowed, undefined)
assert.equal(draft.auditEvent.eventType, 'bond_pack_draft_prepared')
assert.equal(containsForbiddenPayloadKey(draft.auditEvent), false)

const withDraft = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase3' },
  evidence: completeEvidence,
  versions: [draft.version],
  generatedAt: '2026-07-15T10:00:00.000Z',
})
assert.equal(withDraft.status, S.draftGenerated)
assert.equal(validateBondPackWorkspace(withDraft).valid, true)

assert.deepEqual(canTransitionBondPackWorkspaceStatus({ from: S.readyToDraft, to: S.draftGenerated, workspace: ready }), { allowed: true, reason: 'transition_allowed' })
assert.deepEqual(canTransitionBondPackWorkspaceStatus({ from: S.draftGenerated, to: S.approved, workspace: withDraft }), { allowed: false, reason: 'transition_not_allowed' })

const reviewWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase3' },
  evidence: completeEvidence,
  versions: [{ ...draft.version, status: S.attorneyReview }],
  generatedAt: '2026-07-15T10:00:00.000Z',
})
assert.deepEqual(canTransitionBondPackWorkspaceStatus({ from: S.attorneyReview, to: S.approved, workspace: reviewWorkspace }), { allowed: true, reason: 'transition_allowed' })
assert.deepEqual(canTransitionBondPackWorkspaceStatus({ from: S.attorneyReview, to: S.superseded, workspace: reviewWorkspace }), { allowed: false, reason: 'transition_reason_required' })
assert.deepEqual(canTransitionBondPackWorkspaceStatus({ from: S.attorneyReview, to: S.superseded, workspace: reviewWorkspace, reason: 'Bank issued amended instruction.' }), { allowed: true, reason: 'transition_allowed' })

const changedCanonicalData = resolveBondAttorneyCanonicalData({
  evidence: { ...completeEvidence, bank_reference: verified('NB-2026-002') },
  resolvedAt: '2026-07-15T11:00:00.000Z',
})
const invalidatedWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase3' },
  canonicalData: changedCanonicalData,
  versions: [draft.version],
  generatedAt: '2026-07-15T11:00:00.000Z',
})
assert.equal(invalidatedWorkspace.requiresRegeneration, true)
assert.equal(invalidatedWorkspace.status, S.readyToDraft)
assert.ok(invalidatedWorkspace.draftInvalidation.changedFactKeys.includes('bank_reference'))

const audit = buildBondPackWorkspaceAuditEvent({
  workspace: invalidatedWorkspace,
  eventType: 'bond pack data changed',
  actor: { role: 'system', userId: 'system' },
  version: draft.version,
  reason: 'Canonical bank reference changed.',
  commandId: 'audit-command-1',
  occurredAt: '2026-07-15T12:00:00.000Z',
})
assert.equal(audit.eventType, 'bond_pack_data_changed')
assert.equal(audit.versionBinding.watermark, BOND_PACK_DRAFT_WATERMARK)
assert.equal(containsForbiddenPayloadKey(audit), false)

const report = buildBondAttorneyPhase3BaselineReport({
  transaction: { id: 'tx-bond-phase3' },
  evidence: completeEvidence,
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(report.readyForPhase4, true, JSON.stringify(report, null, 2))
assert.equal(report.statusCount, 13)
assert.equal(report.packItemCount, 16)

console.log(`Bond attorney module Phase 3 pack workspace passed (${report.packItemCount} pack items).`)
