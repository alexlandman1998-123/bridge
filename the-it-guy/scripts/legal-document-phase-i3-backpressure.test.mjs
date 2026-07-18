import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentBackpressureReadiness } from '../src/core/documents/legalDocumentBackpressureReadiness.js'

const packetResults = [{ packetType: 'otp', claimedCount: 1, rejectedCount: 7 }, { packetType: 'mandate', claimedCount: 1, rejectedCount: 7 }]
const fixture = { i2: { status: 'READY_FOR_I3' }, targetCount: 2, waves: [{ contractValid: true, packetResults }, { contractValid: true, packetResults }], unauthorizedRejected: true, beforeLeaseCounts: [{ packetId: 'otp', count: 0 }, { packetId: 'mandate', count: 0 }], afterLeaseCounts: [{ packetId: 'otp', count: 0 }, { packetId: 'mandate', count: 0 }], latencyP95Ms: 1100, latencyLimitMs: 5000 }
assert.equal(assessLegalDocumentBackpressureReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentBackpressureReadiness({ ...fixture, waves: [{ contractValid: true, packetResults: [{ packetType: 'otp', claimedCount: 2, rejectedCount: 6 }, packetResults[1]] }, fixture.waves[1]] }).reasons.includes('I3_BACKPRESSURE_CONTRACT_INVALID'))
assert.ok(assessLegalDocumentBackpressureReadiness({ ...fixture, afterLeaseCounts: [{ packetId: 'otp', count: 1 }, { packetId: 'mandate', count: 0 }] }).reasons.includes('I3_PROBE_LEASE_STATE_MUTATED'))

const migration = fs.readFileSync('../supabase/migrations/202607170030_legal_generation_backpressure_i3.sql', 'utf8')
assert.match(migration, /legal_document_generation_leases/)
assert.match(migration, /on conflict \(packet_id\)/)
assert.match(migration, /expires_at <= v_now/)
assert.match(migration, /pg_try_advisory_xact_lock/)
assert.match(migration, /bridge_complete_generation_lease_i3/)
assert.match(migration, /after insert on public\.document_packet_versions/)
assert.match(migration, /grant execute[\s\S]*to service_role/)
const packetService = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const claimIndex = packetService.indexOf('claimDocumentPacketGenerationLease({')
const startedIndex = packetService.indexOf("eventType: 'generation_started'", claimIndex)
assert.ok(claimIndex > 0 && startedIndex > claimIndex, 'Generation lease must be claimed before generation starts.')
assert.match(packetService, /GENERATION_ALREADY_IN_PROGRESS/)
assert.match(packetService, /releaseDocumentPacketGenerationLease/)
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
assert.match(api, /bridge_claim_generation_lease_i3/)
assert.match(api, /bridge_release_generation_lease_i3/)
const verifier = fs.readFileSync('scripts/legal-document-phase-i3-backpressure.mjs', 'utf8')
assert.match(verifier, /Promise\.all\(calls\)/)
assert.match(verifier, /waveNumber <= 2/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-i3', 'verify:legal-documents:phase-i3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document I3 backpressure contract passed.')
