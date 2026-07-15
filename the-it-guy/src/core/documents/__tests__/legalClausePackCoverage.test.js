import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyLegalClausePackCoverageRuntimePolicy,
  buildLegalClausePackCoverage,
  listPublishableLegalClausePackKeys,
  resolveSectionClausePackKeys,
  resolveSectionClauseApproval,
} from '../legalClausePackCoverage.js'
import { SOUTH_AFRICAN_LEGAL_CLAUSE_STARTERS } from '../southAfricanLegalClauseLibrary.js'

function approvedSection(packKey) {
  return {
    section_key: packKey,
    legal_text: `Approved wording for ${packKey}`,
    condition_json: { rule: { field: 'legal_active_clause_packs', operator: 'contains', value: packKey } },
    metadata_json: {
      clause_pack_keys: [packKey],
      governance: {
        locked: true,
        approval_status: 'approved',
        approved_at: '2026-07-14T12:00:00.000Z',
        approved_by_role: 'transferring_attorney',
      },
    },
  }
}

test('recognises pack identity from section metadata and visibility conditions', () => {
  assert.deepEqual(resolveSectionClausePackKeys(approvedSection('property_estate_hoa_pack')), ['property_estate_hoa_pack'])
})

test('requires approval, an audit record and a lock for governed wording', () => {
  assert.equal(resolveSectionClauseApproval(approvedSection('existing_lease_pack')).approved, true)
  assert.equal(resolveSectionClauseApproval({
    ...approvedSection('existing_lease_pack'),
    metadata_json: { governance: { approval_status: 'approved', locked: false } },
  }).approved, false)
})

test('reports missing and review-required packs for a governed template', () => {
  const coverage = buildLegalClausePackCoverage({
    template: { governance_version: 1, status: 'approved', sections: [
      approvedSection('property_estate_hoa_pack'),
      {
        section_key: 'existing_lease_pack',
        legal_text: 'Draft lease wording',
        metadata_json: { governance: { approval_status: 'attorney_review', locked: false } },
      },
    ] },
    requiredPackKeys: ['property_estate_hoa_pack', 'existing_lease_pack', 'deposit_trust_pack'],
    allowLegacy: false,
  })

  assert.equal(coverage.canPublish, false)
  assert.equal(coverage.coveragePercent, 33)
  assert.deepEqual(coverage.missingWording.map((item) => item.key), ['deposit_trust_pack'])
  assert.deepEqual(coverage.approvalRequired.map((item) => item.key), ['existing_lease_pack'])
})

test('keeps legacy published templates compatible while reporting their linked coverage', () => {
  const coverage = buildLegalClausePackCoverage({
    template: { governance_version: 0, status: 'published', is_active: true, sections: [
      { section_key: 'cash_sale_pack', legal_text: 'Legacy cash wording' },
    ] },
    requiredPackKeys: ['cash_sale_pack'],
    allowLegacy: true,
  })

  assert.equal(coverage.legacyCompatible, true)
  assert.equal(coverage.canAssemble, true)
  assert.equal(coverage.items[0].status, 'ready')
})

test('ships a governed library path for every South African OTP clause pack', () => {
  const establishedLibraryPackKeys = [
    'seller_individual_capacity_pack',
    'seller_company_authority_pack',
    'seller_trust_authority_pack',
    'seller_spouse_consent_pack',
    'buyer_individual_capacity_pack',
    'buyer_company_authority_pack',
    'buyer_trust_authority_pack',
    'buyer_spouse_consent_pack',
    'cash_sale_pack',
  ]
  const availableKeys = new Set([
    ...establishedLibraryPackKeys,
    ...SOUTH_AFRICAN_LEGAL_CLAUSE_STARTERS.map((item) => item.packKey),
  ])

  assert.deepEqual(
    listPublishableLegalClausePackKeys().filter((key) => !availableKeys.has(key)),
    [],
  )
  assert.ok(SOUTH_AFRICAN_LEGAL_CLAUSE_STARTERS.every((item) => (
    item.approvalStatus === 'attorney_review' &&
    item.locked === false &&
    item.defaultCondition?.field === 'legal_active_clause_packs'
  )))
})

test('enforces runtime coverage only after a template adopts the Phase 4 contract', () => {
  const coverage = buildLegalClausePackCoverage({
    template: { governance_version: 1, status: 'published', sections: [] },
    requiredPackKeys: ['cash_sale_pack'],
    allowLegacy: false,
  })
  const prePhaseFour = applyLegalClausePackCoverageRuntimePolicy({
    governance_version: 1,
    status: 'published',
  }, coverage)
  const phaseFour = applyLegalClausePackCoverageRuntimePolicy({
    governance_version: 1,
    status: 'published',
    metadata_json: { legal_clause_pack_coverage_version: coverage.schemaVersion },
  }, coverage)

  assert.equal(prePhaseFour.runtimeEnforced, false)
  assert.equal(prePhaseFour.rolloutCompatible, true)
  assert.equal(phaseFour.runtimeEnforced, true)
  assert.equal(phaseFour.contractVersion, coverage.schemaVersion)
})
