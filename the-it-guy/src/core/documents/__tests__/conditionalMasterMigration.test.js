import test from 'node:test'
import assert from 'node:assert/strict'

import { buildConditionalMasterTemplateSections, getConditionalMasterTemplateDefinition } from '../conditionalMasterTemplateDefinitions.js'
import { evaluateConditionalMasterMigration } from '../conditionalMasterMigration.js'

function master({ id, organisationId = null, status = 'published', isDefault = false, migration = null } = {}) {
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
      ...(migration ? { conditional_master_migration: migration } : {}),
    },
    sections: buildConditionalMasterTemplateSections('mandate', [
      { sectionKey: 'parties', legalText: 'Parties' },
      { sectionKey: 'signature_pages', legalText: 'Signatures' },
    ]),
  }
}

function legacy(id, wording = 'Legacy parties') {
  return {
    id,
    organisation_id: 'org-1',
    packet_type: 'mandate',
    status: 'published',
    is_active: true,
    is_default: true,
    sections: [{ section_key: 'parties', legal_text: wording }],
  }
}

test('recognises global masters with tolerant metadata flags', () => {
  const stringFlagMaster = master({ id: 'global-string-flag' })
  stringFlagMaster.metadata_json.conditional_master = 'true'
  const versionOnlyMaster = master({ id: 'global-version-only' })
  delete versionOnlyMaster.metadata_json.conditional_master

  for (const globalTemplate of [stringFlagMaster, versionOnlyMaster]) {
    const result = evaluateConditionalMasterMigration({
      packetType: 'mandate',
      templates: [globalTemplate, legacy('legacy')],
    })
    assert.equal(result.state, 'needs_draft')
    assert.equal(result.canPrepare, true)
    assert.equal(result.blockers.some((item) => item.code === 'MIGRATION_GLOBAL_MASTER_MISSING'), false)
  }
})

test('requires an organisation draft before migration activation', () => {
  const result = evaluateConditionalMasterMigration({
    packetType: 'mandate',
    templates: [master({ id: 'global' }), legacy('legacy')],
  })
  assert.equal(result.state, 'needs_draft')
  assert.equal(result.canPrepare, true)
  assert.equal(result.canActivate, false)
})

test('blocks activation when legacy standard wording conflicts', () => {
  const result = evaluateConditionalMasterMigration({
    packetType: 'mandate',
    templates: [
      master({ id: 'global' }),
      master({ id: 'candidate', organisationId: 'org-1', status: 'draft' }),
      legacy('legacy-a', 'Wording A'),
      legacy('legacy-b', 'Wording B'),
    ],
  })
  assert.equal(result.coverage.ready, true)
  assert.equal(result.state, 'draft_blocked')
  assert.ok(result.blockers.some((item) => item.code === 'MIGRATION_WORDING_REVIEW_REQUIRED'))
})

test('keeps legacy templates live throughout the rollback window', () => {
  const activatedAt = '2026-07-20T10:00:00.000Z'
  const rollbackUntil = '2026-08-03T10:00:00.000Z'
  const result = evaluateConditionalMasterMigration({
    packetType: 'mandate',
    now: Date.parse('2026-07-25T10:00:00.000Z'),
    templates: [
      master({ id: 'global' }),
      master({
        id: 'candidate',
        organisationId: 'org-1',
        isDefault: true,
        migration: { state: 'activated', activated_at: activatedAt, rollback_until: rollbackUntil, wording_reviewed_at: activatedAt },
      }),
      legacy('legacy'),
    ],
  })
  assert.equal(result.state, 'rollback_window')
  assert.equal(result.canFinalize, false)
  assert.equal(result.canRollback, true)
})

test('allows archival only after the rollback window', () => {
  const result = evaluateConditionalMasterMigration({
    packetType: 'mandate',
    now: Date.parse('2026-08-04T10:00:00.000Z'),
    templates: [
      master({ id: 'global' }),
      master({
        id: 'candidate',
        organisationId: 'org-1',
        isDefault: true,
        migration: {
          state: 'activated',
          activated_at: '2026-07-20T10:00:00.000Z',
          rollback_until: '2026-08-03T10:00:00.000Z',
          wording_reviewed_at: '2026-07-20T09:00:00.000Z',
        },
      }),
      legacy('legacy'),
    ],
  })
  assert.equal(result.state, 'ready_to_archive')
  assert.equal(result.canFinalize, true)
})

test('treats the audit row as authoritative after rollback', () => {
  const result = evaluateConditionalMasterMigration({
    packetType: 'mandate',
    migrationRecord: { state: 'rolled_back', rolled_back_at: '2026-07-26T10:00:00.000Z' },
    templates: [
      master({ id: 'global' }),
      master({ id: 'candidate', organisationId: 'org-1', status: 'published' }),
      legacy('legacy'),
    ],
  })
  assert.equal(result.state, 'rolled_back')
  assert.equal(result.canFinalize, false)
})
