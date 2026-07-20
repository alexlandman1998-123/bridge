import assert from 'node:assert/strict'
import fs from 'node:fs'
import { documentGeneratorProtectedTables } from '../src/core/documents/documentGeneratorAccessBoundary.js'

const migration = fs.readFileSync('../supabase/migrations/202607180049_document_generator_least_privilege_h2.sql', 'utf8')
for (const token of ['bridge_get_document_generator_least_privilege_contract_h2', "'h2-generator-v1'", 'bridge_can_access_legal_packet_h2', 'directPipelineWriteGrantCount', 'serviceEvidenceClientGrantCount', 'document_signer_sessions', 'legal_final_completion_retry_attempts']) assert.match(migration, new RegExp(token))
assert.match(migration, /revoke insert, update, delete[\s\S]*document_signing_field_layouts/)
assert.match(migration, /revoke all[\s\S]*legal_final_artifact_evidence/)
assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)

const verifier = fs.readFileSync('scripts/document-generator-phase-h2-least-privilege.mjs', 'utf8')
const protectedTableSource = fs.readFileSync('src/core/documents/documentGeneratorAccessBoundary.js', 'utf8')
for (const table of documentGeneratorProtectedTables) assert.match(protectedTableSource, new RegExp(table))
assert.match(verifier, /documentGeneratorProtectedTables/)
for (const token of ['H2_UNASSIGNED_EMAIL', 'STAGING_PROJECT_REF', 'SAFE_MISSING_VERSION_ID', 'bridge_can_access_legal_packet_h2', 'bridge_get_document_generator_least_privilege_contract_h2', 'rendered_file_bucket', 'final_signed_file_bucket', 'bridge_rehearse_final_completion_recovery_g4', 'retry-final-document-completion', 'F5_ACCESS_DENIED', 'mutatedData: false']) assert.match(verifier, new RegExp(token))
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-h2'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-h2'])
console.log('Document generator H2 least-privilege contract passed.')
