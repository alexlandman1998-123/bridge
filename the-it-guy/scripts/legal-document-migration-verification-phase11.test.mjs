import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildConditionalMasterTemplateSections, getConditionalMasterTemplateDefinition } from '../src/core/documents/conditionalMasterTemplateDefinitions.js'
import { evaluateConditionalMasterMigrationVerification } from '../src/core/documents/conditionalMasterMigrationVerification.js'

const definition = getConditionalMasterTemplateDefinition('otp')
const globalMaster = {
  id: 'global', organisation_id: null, packet_type: 'otp', status: 'published', is_active: true,
  metadata_json: { conditional_master: true, conditional_master_version: 'conditional-master-v1', default_signer_roles: definition.defaultSignerRoles },
  sections: buildConditionalMasterTemplateSections('otp', [
    { sectionKey: 'parties', legalText: 'Parties' },
    { sectionKey: 'signature_pages', legalText: 'Signatures' },
  ]),
}
const candidate = { ...globalMaster, id: 'candidate', organisation_id: 'org-1', is_default: true }
const probe = evaluateConditionalMasterMigrationVerification({
  packetType: 'otp', templates: [globalMaster, candidate],
  migrationRecord: {
    state: 'activated', source_master_template_id: 'global', candidate_template_id: 'candidate',
    legacy_template_ids: [], coverage_version: 'conditional-master-coverage-v1', coverage_decision_hash: '',
    rollback_until: '2026-08-03T10:00:00.000Z',
  },
})
const migration = {
  state: 'activated', source_master_template_id: 'global', candidate_template_id: 'candidate',
  legacy_template_ids: [], coverage_version: probe.coverage.coverageVersion,
  coverage_decision_hash: probe.coverage.decisionHash, rollback_until: '2026-08-03T10:00:00.000Z',
}
const verification = evaluateConditionalMasterMigrationVerification({
  packetType: 'otp', templates: [globalMaster, candidate], migrationRecord: migration,
  verificationReceipt: {
    passed: true, verification_version: 'conditional-master-verification-v1', coverage_version: probe.coverage.coverageVersion, candidate_template_id: 'candidate',
    coverage_decision_hash: probe.coverage.decisionHash, migration_state: 'activated',
  },
})

assert.equal(verification.state, 'verified')
assert.equal(verification.coverage.caseCount, 216)
assert.equal(verification.ready, true)

const sql = await readFile(new URL('../../supabase/migrations/202607200003_conditional_legal_master_verification_phase11.sql', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const overview = await readFile(new URL('../src/pages/settings/LegalDocumentOverviewPage.jsx', import.meta.url), 'utf8')
const adr = await readFile(new URL('../docs/architecture/adr-002-conditional-master-legal-documents.md', import.meta.url), 'utf8')

for (const token of [
  'legal_document_master_verifications',
  'bridge_verify_conditional_master_migration_phase11',
  'VERIFICATION_CANDIDATE_NOT_LIVE_DEFAULT',
  'VERIFICATION_HISTORICAL_SNAPSHOT_MISSING',
  'template_definition_snapshot_json',
  'issue_codes',
]) assert.ok(sql.includes(token), `Phase 11 SQL should include ${token}.`)

for (const token of [
  'fetchConditionalMasterVerification',
  'verifyConditionalMasterMigration',
  'coverage.decisionHash',
  'CONDITIONAL_MASTER_VERIFICATION_BLOCKED',
]) assert.ok(api.includes(token), `Verification API should include ${token}.`)

assert.ok(overview.includes('Run verification'))
assert.ok(overview.includes('Verified with a current receipt'))
assert.match(adr, /A green user-interface state without a current durable verification receipt is not Phase 11 evidence\./)

console.log('Conditional-master migration verification Phase 11 contract passed.')
