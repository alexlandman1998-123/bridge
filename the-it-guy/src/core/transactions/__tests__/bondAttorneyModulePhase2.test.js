import assert from 'node:assert/strict'
import {
  BOND_ATTORNEY_PHASE2_FACT_DEFINITIONS,
  BOND_ATTORNEY_PHASE2_FACT_STATUSES,
  buildBondAttorneyPhase2BaselineReport,
  evaluateBondAttorneyDraftInvalidation,
  resolveBondAttorneyCanonicalData,
} from '../bondAttorneyModulePhase2.js'
import { BOND_ATTORNEY_PHASE0_DATA_CONTRACT } from '../bondAttorneyModulePhase0.js'

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

const definitionKeys = BOND_ATTORNEY_PHASE2_FACT_DEFINITIONS.map((definition) => definition.key)
assert.deepEqual(
  BOND_ATTORNEY_PHASE0_DATA_CONTRACT.filter((key) => !definitionKeys.includes(key)),
  [],
  'Phase 2 definitions must cover every Phase 0 data-contract key.',
)
assert.equal(new Set(definitionKeys).size, definitionKeys.length)
assert.ok(BOND_ATTORNEY_PHASE2_FACT_DEFINITIONS.every((definition) => definition.sourcePaths.length >= 3))

const complete = resolveBondAttorneyCanonicalData({
  evidence: completeEvidence,
  resolvedAt: '2026-07-15T08:00:00.000Z',
})

assert.equal(complete.version, 'bond_attorney_module_phase2_data_contract_v1')
assert.equal(complete.readyForDrafting, true, JSON.stringify(complete, null, 2))
assert.equal(complete.missingFactKeys.length, 0)
assert.equal(complete.unverifiedFactKeys.length, 0)
assert.equal(complete.conflictFactKeys.length, 0)
assert.equal(complete.staleFactKeys.length, 0)
assert.equal(complete.factsByKey.bank_reference.status, BOND_ATTORNEY_PHASE2_FACT_STATUSES.verified)
assert.equal(complete.factsByKey.bank_reference.source.sourcePath, 'evidence.bank_reference')
assert.ok(complete.factsByKey.bank_reference.fingerprint.startsWith('fnv1a_'))
assert.ok(complete.dataFingerprint.startsWith('fnv1a_'))

const noGuessing = resolveBondAttorneyCanonicalData({
  transaction: {
    finance_type: 'bond',
    bank_name: 'Nedbank',
    approved_bond_amount: 1850000,
  },
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(noGuessing.factsByKey.bank_name.status, BOND_ATTORNEY_PHASE2_FACT_STATUSES.unverified)
assert.equal(noGuessing.factsByKey.bank_reference.status, BOND_ATTORNEY_PHASE2_FACT_STATUSES.missing)
assert.equal(noGuessing.factsByKey.bank_reference.value, null)
assert.ok(noGuessing.missingFactKeys.includes('bank_reference'))

const conflict = resolveBondAttorneyCanonicalData({
  transaction: { bank_name: 'FNB' },
  evidence: { bank_name: verified('Nedbank') },
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(conflict.factsByKey.bank_name.status, BOND_ATTORNEY_PHASE2_FACT_STATUSES.conflict)
assert.deepEqual(conflict.conflictFactKeys, ['bank_name'])
assert.equal(conflict.factsByKey.bank_name.conflicts[0].sourcePath, 'transaction.bank_name')

const stale = resolveBondAttorneyCanonicalData({
  evidence: {
    ...completeEvidence,
    approval_to_lodge_reference: verified('ATL-EXPIRED', { expiresAt: '2026-07-01T00:00:00.000Z' }),
  },
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(stale.factsByKey.approval_to_lodge_reference.status, BOND_ATTORNEY_PHASE2_FACT_STATUSES.stale)
assert.deepEqual(stale.staleFactKeys, ['approval_to_lodge_reference'])

const unchangedDraft = {
  dataFingerprint: complete.dataFingerprint,
  factFingerprints: complete.factFingerprints,
}
assert.equal(evaluateBondAttorneyDraftInvalidation({ draft: unchangedDraft, canonicalData: complete }).invalidated, false)

const changed = resolveBondAttorneyCanonicalData({
  evidence: {
    ...completeEvidence,
    bank_reference: verified('NB-2026-002'),
  },
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
const invalidation = evaluateBondAttorneyDraftInvalidation({ draft: unchangedDraft, canonicalData: changed })
assert.equal(invalidation.invalidated, true)
assert.ok(invalidation.changedFactKeys.includes('bank_reference'))
assert.equal(invalidation.reason, 'canonical_bond_data_changed')

const unbound = evaluateBondAttorneyDraftInvalidation({ draft: {}, canonicalData: complete })
assert.equal(unbound.invalidated, true)
assert.equal(unbound.reason, 'draft_not_bound_to_canonical_bond_data')

const report = buildBondAttorneyPhase2BaselineReport({
  evidence: completeEvidence,
  resolvedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(report.readyForPhase3, true, JSON.stringify(report, null, 2))
assert.equal(report.readyForDrafting, true)
assert.equal(report.missingDefinitionKeys.length, 0)

console.log(`Bond attorney module Phase 2 data contract passed (${report.factDefinitionCount} canonical facts).`)
