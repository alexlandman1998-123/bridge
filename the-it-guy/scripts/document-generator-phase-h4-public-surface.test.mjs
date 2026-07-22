import assert from 'node:assert/strict'
import fs from 'node:fs'
import { documentGeneratorProtectedTables } from '../src/core/documents/documentGeneratorAccessBoundary.js'

const migration = fs.readFileSync('../supabase/migrations/202607180050_document_generator_public_signer_surface_h4.sql', 'utf8')
for (const token of ['bridge_get_public_signer_surface_contract_h4', "'h4-generator-v1'", 'certifiedPdfBound', 'signersWithoutFields', 'signersWithoutRequiredSignature', 'ambiguousUnscopedFieldCount', 'internalIdentifiersExcluded', "'mutatedData',false"]) assert.match(migration, new RegExp(token))
assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)

const resolver = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
const publicResponse = resolver.slice(resolver.lastIndexOf('return jsonResponse(200, {'), resolver.lastIndexOf('} catch (error)'))
for (const token of ['signer_name', 'signer_email', 'field_type', 'documentPreviewUrl', 'sessionBinding', 'certified: true']) assert.match(publicResponse, new RegExp(token))
for (const internal of ['organisation_id', 'packet_id', 'packet_version_id', 'rendered_file_path', 'sessionId', 'dispatchId', 'layoutId', 'versionId', 'signerId']) assert.doesNotMatch(publicResponse, new RegExp(internal))

const verifier = fs.readFileSync('scripts/document-generator-phase-h4-public-surface.mjs', 'utf8')
const accessSource = fs.readFileSync('src/core/documents/documentGeneratorAccessBoundary.js', 'utf8')
for (const table of documentGeneratorProtectedTables) assert.match(accessSource, new RegExp(table))
for (const token of ['STAGING_PROJECT_REF', 'SAFE_MISSING_VERSION_ID', 'randomBytes(32)', 'rendered_file_url', 'final_signed_file_url', 'bridge_get_public_signer_surface_contract_h4', 'bridge_get_document_generator_launch_chain_g1', 'bridge_rehearse_final_completion_recovery_g4', 'resolve-signer-token', 'signer-signing-action', 'INVALID_SIGNING_TOKEN', 'mutatedData: false']) assert.match(verifier, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-h4'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-h4'])
console.log('Document generator H4 public-surface contract passed.')
