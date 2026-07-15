import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SOUTH_AFRICAN_OTP_REFERENCE_SCENARIOS,
  buildSouthAfricanOtpScenarioPreviewContext,
  runLegalClausePackScenarioMatrix,
} from '../legalClausePackScenarioMatrix.js'
import { resolveLegalClausePackScenarioMatrixGovernance } from '../legalClausePackScenarioMatrixGovernance.js'
import { listPublishableLegalClausePackKeys } from '../legalClausePackCoverage.js'

function approvedPackSection(packKey, conditionPackKey = packKey) {
  return {
    section_key: packKey,
    legal_text: `Approved wording for ${packKey}`,
    condition_json: {
      enabled: true,
      rule: { field: 'legal_active_clause_packs', operator: 'contains', value: conditionPackKey },
    },
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

test('reference scenarios exercise every publishable South African OTP pack', () => {
  const matrix = runLegalClausePackScenarioMatrix({
    template: { governance_version: 1 },
    sections: listPublishableLegalClausePackKeys().map((key) => approvedPackSection(key)),
  })

  assert.equal(SOUTH_AFRICAN_OTP_REFERENCE_SCENARIOS.length, 6)
  assert.equal(matrix.exercisedPackCount, 23)
  assert.deepEqual(matrix.unexercisedPackKeys, [])
  assert.equal(matrix.canPublish, true)
  assert.equal(matrix.passedCount, 6)
})

test('reports active wording that is hidden by the wrong condition', () => {
  const sections = listPublishableLegalClausePackKeys().map((key) => approvedPackSection(key))
  const cashIndex = sections.findIndex((section) => section.section_key === 'cash_sale_pack')
  sections[cashIndex] = approvedPackSection('cash_sale_pack', 'bond_finance_pack')
  const matrix = runLegalClausePackScenarioMatrix({ template: { governance_version: 1 }, sections })

  assert.equal(matrix.canPublish, false)
  assert.ok(matrix.failedScenarios.some((item) => (
    item.issues.some((issue) => issue.code === 'active_pack_hidden' && issue.packKey === 'cash_sale_pack')
  )))
})

test('reports inactive wording that leaks into another transaction', () => {
  const sections = listPublishableLegalClausePackKeys().map((key) => approvedPackSection(key))
  const leaseIndex = sections.findIndex((section) => section.section_key === 'existing_lease_pack')
  sections[leaseIndex] = { ...sections[leaseIndex], condition_json: {} }
  const matrix = runLegalClausePackScenarioMatrix({ template: { governance_version: 1 }, sections })

  assert.equal(matrix.canPublish, false)
  assert.ok(matrix.scenarios.some((item) => (
    item.issues.some((issue) => issue.code === 'inactive_pack_visible' && issue.packKey === 'existing_lease_pack')
  )))
})

test('builds preview intake from the selected reference scenario', () => {
  const preview = buildSouthAfricanOtpScenarioPreviewContext('married_bond_sectional_estate')

  assert.equal(preview.otpDraft.buyerMaritalRegime, 'in_community')
  assert.equal(preview.otpDraft.propertyTitleType, 'sectional_title')
  assert.equal(preview.transaction.finance_type, 'bond')
  assert.equal(preview.transaction.cash_amount, '')
  assert.equal(preview.sourceContext.legalScenarioMatrixKey, 'married_bond_sectional_estate')
})

test('enforces only an adopted matrix contract with a complete passing run', () => {
  const legacy = resolveLegalClausePackScenarioMatrixGovernance({ status: 'published' })
  const governed = resolveLegalClausePackScenarioMatrixGovernance({
    metadata_json: {
      legal_clause_pack_scenario_matrix_version: 'sa_legal_clause_pack_scenario_matrix_v1',
      last_clause_pack_scenario_matrix: {
        scenarioCount: 6,
        passedCount: 6,
        failedCount: 0,
        canPublish: true,
      },
    },
  })

  assert.equal(legacy.runtimeEnforced, false)
  assert.equal(governed.runtimeEnforced, true)
  assert.equal(governed.passed, true)
})
