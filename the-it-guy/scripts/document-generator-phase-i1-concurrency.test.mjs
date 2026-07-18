import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/202607180028_document_generator_concurrency_i1.sql', 'utf8')
for (const token of ['bridge_guard_document_packet_version_insert_i1', 'trg_guard_document_packet_version_insert_i1', 'bridge_complete_document_packet_version_insert_i1', 'trg_complete_document_packet_version_insert_i1', 'I1_PACKET_VERSION_LOCKED', 'I1_VERSION_SEQUENCE_INVALID', "('sent','partially_signed','completed','voided','archived')", 'bridge_probe_document_generator_concurrency_i1', "'i1-generator-v1'", 'currentPointerMatchesMax', 'duplicateVersionNumberCount', 'versionCreatedEventMismatchCount', 'orphanVersionEventCount', 'document_packet_versions_packet_version_i1_uq', "'mutatedData',false"]) assert.match(migration, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.match(migration, /for update/i)

const atomicMigration = fs.readFileSync('../supabase/migrations/202607170029_legal_generation_concurrency_i1.sql', 'utf8')
for (const token of ['document_packet_versions_packet_version_i1_uq', 'bridge_create_document_packet_version_i1', "'i1-v1'", 'p_dry_run', 'for update']) assert.match(atomicMigration, new RegExp(token, 'i'))
const editableSave = fs.readFileSync('../supabase/migrations/202607180007_editable_document_revision_save_c2.sql', 'utf8')
assert.match(editableSave, /document_packets[\s\S]+for update/i)

const verifier = fs.readFileSync('scripts/document-generator-phase-i1-concurrency.mjs', 'utf8')
for (const token of ['STAGING_PROJECT_REF', 'document-generator-phase-h4-public-surface.mjs', 'document-generator-phase-g1-verify.mjs', "createHash('sha256'", 'stateDigest', 'Promise.all', 'bridge_create_document_packet_version_i1', 'p_dry_run: true', 'bridge_probe_document_generator_concurrency_i1', 'beforeSnapshots', 'afterSnapshots', 'mutatedData: false']) assert.match(verifier, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|client[^;\n]*\.update\(/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-i1'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-i1'])
console.log('Document generator I1 concurrency contract passed.')
