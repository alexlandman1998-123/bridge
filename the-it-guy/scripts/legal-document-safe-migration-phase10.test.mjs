import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildConditionalMasterTemplateSections, getConditionalMasterTemplateDefinition } from '../src/core/documents/conditionalMasterTemplateDefinitions.js'
import { evaluateConditionalMasterMigration } from '../src/core/documents/conditionalMasterMigration.js'

function master({ id, organisationId = null, status = 'published', isDefault = false, migration = null } = {}) {
  const definition = getConditionalMasterTemplateDefinition('otp')
  return {
    id,
    organisation_id: organisationId,
    packet_type: 'otp',
    status,
    is_active: status === 'published',
    is_default: isDefault,
    metadata_json: {
      conditional_master: true,
      conditional_master_version: 'conditional-master-v1',
      default_signer_roles: definition.defaultSignerRoles,
      ...(migration ? { conditional_master_migration: migration } : {}),
    },
    sections: buildConditionalMasterTemplateSections('otp', [
      { sectionKey: 'parties', legalText: 'Parties' },
      { sectionKey: 'signature_pages', legalText: 'Signatures' },
    ]),
  }
}

const rollbackUntil = '2026-08-03T10:00:00.000Z'
const migration = evaluateConditionalMasterMigration({
  packetType: 'otp',
  now: Date.parse('2026-07-25T10:00:00.000Z'),
  templates: [
    master({ id: 'global' }),
    master({
      id: 'candidate',
      organisationId: 'org-1',
      isDefault: true,
      migration: {
        state: 'activated',
        activated_at: '2026-07-20T10:00:00.000Z',
        rollback_until: rollbackUntil,
        wording_reviewed_at: '2026-07-20T09:00:00.000Z',
      },
    }),
    { id: 'legacy', organisation_id: 'org-1', packet_type: 'otp', status: 'published', is_active: true, sections: [] },
  ],
})

assert.equal(migration.state, 'rollback_window')
assert.equal(migration.coverage.ready, true)
assert.equal(migration.canRollback, true)
assert.equal(migration.canFinalize, false)
assert.equal(migration.rollbackUntil, rollbackUntil)

const sql = await readFile(new URL('../../supabase/migrations/202607200002_conditional_legal_master_migration_phase10.sql', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const overview = await readFile(new URL('../src/pages/settings/LegalDocumentOverviewPage.jsx', import.meta.url), 'utf8')
const adr = await readFile(new URL('../docs/architecture/adr-002-conditional-master-legal-documents.md', import.meta.url), 'utf8')

for (const token of [
  'legal_document_master_migrations',
  'bridge_prepare_conditional_master_migration_phase10',
  'bridge_activate_conditional_master_migration_phase10',
  'bridge_rollback_conditional_master_migration_phase10',
  'bridge_finalize_conditional_master_migration_phase10',
  "interval '14 days'",
  "v_migration.rollback_until > v_now",
  'legacy_template_ids',
]) assert.ok(sql.includes(token), `Phase 10 SQL should include ${token}.`)

for (const token of [
  'evaluateConditionalMasterCoverage',
  'coverage.decisionHash',
  'wordingReviewed',
  'finalizeConditionalMasterMigration',
]) assert.ok(api.includes(token), `Migration API should include ${token}.`)

assert.ok(overview.includes('Rollback window open'))
assert.match(adr, /No migration step deletes a template or changes the template revision recorded by an existing document\./)

console.log('Safe conditional-master migration Phase 10 contract passed.')
