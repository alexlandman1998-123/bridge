import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY,
  CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS,
  CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS,
  CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES,
  buildCancellationAttorneyPhase2BaselineReport,
  evaluateCancellationAttorneyDraftInvalidation,
  resolveCancellationAttorneyCanonicalData,
} from '../cancellationAttorneyModulePhase2.js'
import { CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT } from '../cancellationAttorneyModulePhase0.js'
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

const definitionKeys = CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS.map((definition) => definition.key)
assert.deepEqual(
  CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.filter((key) => !definitionKeys.includes(key)),
  [],
  'Phase 2 definitions must cover every Phase 0 cancellation data-contract key.',
)
assert.equal(new Set(definitionKeys).size, definitionKeys.length)
assert.equal(CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS.length, CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.length)
assert.ok(CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS.every((definition) => definition.sourcePaths.length >= 3))
assert.deepEqual(
  Object.values(CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS),
  [
    'existing_bond',
    'instruction',
    'notice',
    'figures',
    'guarantees',
    'signing',
    'lodgement',
    'registration',
    'settlement',
    'closeout',
  ],
)

assert.equal(CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY.canonicalDataOnly, true)
assert.equal(CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY.persistsCanonicalFacts, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY.generatesOperationalDocuments, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY.requestsExternalFiguresAutomatically, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY.acceptsGuaranteeAutomatically, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY.writesExternalSystem, false)
assert.equal(CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY.treatsUnverifiedDataAsDraftSafe, false)

const complete = resolveCancellationAttorneyCanonicalData({
  evidence: completeEvidence,
  resolvedAt: '2026-07-15T08:00:00.000Z',
})

assert.equal(complete.version, 'cancellation_attorney_module_phase2_data_contract_v1')
assert.equal(complete.releaseBlockerId, 'cancellation_data_contract_missing')
assert.equal(complete.readyForDrafting, true, JSON.stringify(complete, null, 2))
assert.equal(complete.readyForCancellationPack, true)
assert.equal(complete.missingFactKeys.length, 0)
assert.equal(complete.unverifiedFactKeys.length, 0)
assert.equal(complete.conflictFactKeys.length, 0)
assert.equal(complete.staleFactKeys.length, 0)
assert.equal(complete.factsByKey.cancellation_bank.status, CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.verified)
assert.equal(complete.factsByKey.cancellation_bank.source.sourcePath, 'evidence.cancellation_bank')
assert.equal(complete.factsByKey.cancellation_figures_expiry_date.expiresFromValue, true)
assert.ok(complete.factsByKey.cancellation_bank.fingerprint.startsWith('fnv1a_'))
assert.ok(complete.dataFingerprint.startsWith('fnv1a_'))

const noGuessing = resolveCancellationAttorneyCanonicalData({
  transaction: {
    seller_has_existing_bond: true,
    cancellation_bank: 'FNB',
    cancellation_figures_amount: 1234567.89,
  },
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(noGuessing.factsByKey.seller_existing_bond_status.status, CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.unverified)
assert.equal(noGuessing.factsByKey.cancellation_bank.status, CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.unverified)
assert.equal(noGuessing.factsByKey.cancellation_bond_account_number.status, CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.missing)
assert.equal(noGuessing.factsByKey.cancellation_bond_account_number.value, null)
assert.ok(noGuessing.missingFactKeys.includes('cancellation_bond_account_number'))

const conflict = resolveCancellationAttorneyCanonicalData({
  transaction: { cancellation_bank: 'ABSA' },
  evidence: { cancellation_bank: verified('FNB') },
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(conflict.factsByKey.cancellation_bank.status, CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.conflict)
assert.deepEqual(conflict.conflictFactKeys, ['cancellation_bank'])
assert.equal(conflict.factsByKey.cancellation_bank.conflicts[0].sourcePath, 'transaction.cancellation_bank')

const stale = resolveCancellationAttorneyCanonicalData({
  evidence: {
    ...completeEvidence,
    cancellation_figures_expiry_date: verified('2026-07-01T00:00:00.000Z', { sourceId: 'expired-figures-1' }),
  },
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(stale.factsByKey.cancellation_figures_expiry_date.status, CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.stale)
assert.deepEqual(stale.staleFactKeys, ['cancellation_figures_expiry_date'])

const unchangedDraft = {
  dataFingerprint: complete.dataFingerprint,
  factFingerprints: complete.factFingerprints,
}
assert.equal(evaluateCancellationAttorneyDraftInvalidation({ draft: unchangedDraft, canonicalData: complete }).invalidated, false)

const changed = resolveCancellationAttorneyCanonicalData({
  evidence: {
    ...completeEvidence,
    cancellation_bond_account_number: verified('FNB-HL-2026-002'),
  },
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
const invalidation = evaluateCancellationAttorneyDraftInvalidation({ draft: unchangedDraft, canonicalData: changed })
assert.equal(invalidation.invalidated, true)
assert.ok(invalidation.changedFactKeys.includes('cancellation_bond_account_number'))
assert.equal(invalidation.reason, 'canonical_cancellation_data_changed')

const unbound = evaluateCancellationAttorneyDraftInvalidation({ draft: {}, canonicalData: complete })
assert.equal(unbound.invalidated, true)
assert.equal(unbound.reason, 'draft_not_bound_to_canonical_cancellation_data')

const report = buildCancellationAttorneyPhase2BaselineReport({
  evidence: completeEvidence,
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(report.readyForPhase3, true, JSON.stringify(report, null, 2))
assert.equal(report.readyForDrafting, true)
assert.equal(report.readyForCancellationPack, true)
assert.equal(report.factDefinitionCount, CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.length)
assert.equal(report.missingDefinitionKeys.length, 0)
assert.equal(report.controls.persistsCanonicalFacts, false)

const cockpit = buildCancellationAttorneyCockpit({
  resolvedAt: '2026-07-15T08:00:00.000Z',
  evidence: completeEvidence,
  lane: {
    currentStage: 'cancellation_figures_received',
    permissions: { canUpdateStage: true, canRequestDocuments: true },
  },
})
assert.equal(cockpit.phase2CanonicalData.version, 'cancellation_attorney_module_phase2_data_contract_v1')
assert.equal(cockpit.phase2CanonicalData.readyForCancellationPack, true)
assert.equal(cockpit.phase2CanonicalData.factsByKey.cancellation_figures_amount.source.sourceId, 'figures-fnb-1')

const cockpitSource = readFileSync(new URL('../attorneyCancellationWorldClassCockpit.js', import.meta.url), 'utf8')
assert.match(cockpitSource, /resolveCancellationAttorneyCanonicalData/)
assert.match(cockpitSource, /phase2CanonicalData/)

console.log(`Cancellation attorney module Phase 2 data contract passed (${report.factDefinitionCount} canonical facts).`)
