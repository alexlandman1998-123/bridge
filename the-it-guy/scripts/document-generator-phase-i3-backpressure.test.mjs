import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/202607180032_document_generator_backpressure_i3.sql', 'utf8')
for (const token of ['legal_document_generation_leases_expiry_i3_idx', 'bridge_claim_generation_lease_i3', 'for update', "('sent','partially_signed','completed','voided','archived')", 'I3_PACKET_GENERATION_LOCKED', 'on conflict (packet_id)', 'expires_at<=v_now', 'bridge_probe_document_generator_backpressure_i3', 'pg_try_advisory_xact_lock', 'document_packet_versions_complete_generation_lease_i3', "'i3-generator-v1'", "'mutatedData',false"]) assert.match(migration, new RegExp(token.replace(/[()]/g, '\\$&'), 'i'))
assert.match(migration, /revoke all[\s\S]+public,anon,authenticated/i)

const packetService = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const claimIndex = packetService.indexOf('claimDocumentPacketGenerationLease({')
const saveIndex = packetService.indexOf('const prepared = await savePacketDraft({', claimIndex)
const startedIndex = packetService.indexOf("eventType: 'generation_started'", claimIndex)
const finallyIndex = packetService.indexOf('} finally {', claimIndex)
assert.ok(claimIndex > 0 && saveIndex > claimIndex && startedIndex > saveIndex, 'existing packet lease must be claimable before draft preparation and generation')
assert.ok(finallyIndex > startedIndex, 'post-claim generation must have an outer cleanup finally')
assert.match(packetService.slice(finallyIndex, finallyIndex + 800), /releaseDocumentPacketGenerationLease/)
assert.match(packetService, /GENERATION_ALREADY_IN_PROGRESS/)

const verifier = fs.readFileSync('scripts/document-generator-phase-i3-backpressure.mjs', 'utf8')
for (const token of ['STAGING_PROJECT_REF', 'document-generator-phase-i2-renderer-capacity.mjs', 'document-generator-phase-g1-verify.mjs', 'createHash', 'stateDigest', 'bridge_probe_document_generator_backpressure_i3', 'Promise.all(calls)', 'waveNumber <= 2', 'beforeSnapshots', 'afterSnapshots', 'mutatedData: false']) assert.match(verifier, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|service[^;\n]*\.update\(/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-i3'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-i3'])
console.log('Document generator I3 backpressure contract passed.')
