import test from 'node:test'
import assert from 'node:assert/strict'

import { buildConditionalMasterTemplateSections, getConditionalMasterTemplateDefinition } from '../conditionalMasterTemplateDefinitions.js'
import { evaluateConditionalMasterMigrationVerification } from '../conditionalMasterMigrationVerification.js'

function master({ id, organisationId = null, isDefault = false, status = 'published' } = {}) {
  const definition = getConditionalMasterTemplateDefinition('mandate')
  return {
    id,
    organisation_id: organisationId,
    packet_type: 'mandate',
    status,
    is_active: status === 'published',
    is_default: isDefault,
    metadata_json: {
      conditional_master: true,
      conditional_master_version: 'conditional-master-v1',
      default_signer_roles: definition.defaultSignerRoles,
    },
    sections: buildConditionalMasterTemplateSections('mandate', [
      { sectionKey: 'parties', legalText: 'Parties' },
      { sectionKey: 'signature_pages', legalText: 'Signatures' },
    ]),
  }
}

function fixture(state = 'activated') {
  const global = master({ id: 'global' })
  const candidate = master({ id: 'candidate', organisationId: 'org-1', isDefault: true })
  const probe = evaluateConditionalMasterMigrationVerification({
    packetType: 'mandate',
    templates: [global, candidate],
    migrationRecord: {
      state,
      source_master_template_id: 'global',
      candidate_template_id: 'candidate',
      legacy_template_ids: [],
      coverage_version: 'conditional-master-coverage-v1',
      coverage_decision_hash: '',
      rollback_until: '2026-08-03T10:00:00.000Z',
    },
  })
  return {
    templates: [global, candidate],
    migration: {
      state,
      source_master_template_id: 'global',
      candidate_template_id: 'candidate',
      legacy_template_ids: [],
      coverage_version: probe.coverage.coverageVersion,
      coverage_decision_hash: probe.coverage.decisionHash,
      rollback_until: '2026-08-03T10:00:00.000Z',
    },
  }
}

test('verifies source masters with tolerant metadata flags', () => {
  const value = fixture()
  value.templates[0].metadata_json.conditional_master = 'true'
  const result = evaluateConditionalMasterMigrationVerification({
    packetType: 'mandate',
    templates: value.templates,
    migrationRecord: value.migration,
  })
  assert.equal(result.state, 'ready_to_verify')
  assert.equal(result.issues.some((item) => item.code === 'VERIFICATION_SOURCE_MASTER_INVALID'), false)
})

test('becomes ready only when live coverage matches the activation receipt', () => {
  const value = fixture()
  const result = evaluateConditionalMasterMigrationVerification({
    packetType: 'mandate', templates: value.templates, migrationRecord: value.migration,
  })
  assert.equal(result.state, 'ready_to_verify')
  assert.equal(result.canVerify, true)
  assert.equal(result.issues.length, 0)
})

test('blocks when live wording changes the coverage decision', () => {
  const value = fixture()
  value.templates[1].sections.find((section) => section.sectionKey === 'seller_company_authority_pack').legalText = ''
  const result = evaluateConditionalMasterMigrationVerification({
    packetType: 'mandate', templates: value.templates, migrationRecord: value.migration,
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.issues.some((item) => item.code === 'VERIFICATION_COVERAGE_BLOCKED'))
})

test('accepts only a current durable verification receipt', () => {
  const value = fixture('completed')
  const probe = evaluateConditionalMasterMigrationVerification({
    packetType: 'mandate', templates: value.templates, migrationRecord: value.migration,
  })
  const result = evaluateConditionalMasterMigrationVerification({
    packetType: 'mandate',
    templates: value.templates,
    migrationRecord: value.migration,
    verificationReceipt: {
      passed: true,
      verification_version: probe.verificationVersion,
      coverage_version: probe.coverage.coverageVersion,
      candidate_template_id: 'candidate',
      coverage_decision_hash: probe.coverage.decisionHash,
      migration_state: 'completed',
    },
  })
  assert.equal(result.state, 'verified')
  assert.equal(result.ready, true)
})

test('retains a matching failed database receipt as a verification blocker', () => {
  const value = fixture()
  const probe = evaluateConditionalMasterMigrationVerification({
    packetType: 'mandate', templates: value.templates, migrationRecord: value.migration,
  })
  const result = evaluateConditionalMasterMigrationVerification({
    packetType: 'mandate',
    templates: value.templates,
    migrationRecord: value.migration,
    verificationReceipt: {
      passed: false,
      verification_version: probe.verificationVersion,
      coverage_version: probe.coverage.coverageVersion,
      candidate_template_id: 'candidate',
      coverage_decision_hash: probe.coverage.decisionHash,
      migration_state: 'activated',
      issue_codes: ['VERIFICATION_HISTORICAL_SNAPSHOT_MISSING'],
    },
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.issues.some((item) => item.code === 'VERIFICATION_DATABASE_EVIDENCE_BLOCKED'))
})
