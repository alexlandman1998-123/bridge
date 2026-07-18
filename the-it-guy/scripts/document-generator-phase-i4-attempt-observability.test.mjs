import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/202607180033_document_generator_attempt_observability_i4.sql', 'utf8')
for (const token of ['bridge_get_generation_attempt_status_i4', "'i4-generator-v1'", "'active'", "'expired'", "'idle'", "'safeToRetry'", "'retryAfterSeconds'", 'document_packet_versions_complete_generation_lease_i3', "'internalIdentifiersExcluded',true", "'mutatedData',false"]) assert.match(migration, new RegExp(token))
assert.doesNotMatch(migration, /'generationAttemptId'|'generation_attempt_id'|'claimedBy'|'claimed_by'/)
assert.match(migration, /revoke all[\s\S]+from public,anon/i)

const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const adapter = fs.readFileSync('src/core/documents/packetServiceApiAdapter.js', 'utf8')
const service = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
for (const source of [api, adapter, service]) assert.match(source, /getDocumentPacketGenerationLeaseStatus/)
for (const token of ['retryAfterSeconds', 'retryAt', 'safeToRetry']) assert.match(service, new RegExp(token))

const i3 = fs.readFileSync('scripts/document-generator-phase-i3-backpressure.mjs', 'utf8')
assert.match(i3, /READY_FOR_I4/)
const verifier = fs.readFileSync('scripts/document-generator-phase-i4-attempt-observability.mjs', 'utf8')
for (const token of ['STAGING_PROJECT_REF', 'document-generator-phase-i3-backpressure.mjs', 'document-generator-phase-g1-verify.mjs', 'createHash', 'stateDigest', 'bridge_get_generation_attempt_status_i4', 'Promise.all(calls)', 'internalIdentifierExposed', 'retryGuidanceCovered', 'beforeSnapshots', 'afterSnapshots', 'mutatedData: false']) assert.match(verifier, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|service[^;\n]*\.update\(/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-i4'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-i4'])
console.log('Document generator I4 attempt-observability contract passed.')
