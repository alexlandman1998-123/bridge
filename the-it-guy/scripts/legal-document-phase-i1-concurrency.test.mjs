import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentConcurrencyReadiness } from '../src/core/documents/legalDocumentConcurrencyReadiness.js'

const before = [{ packetId: 'otp', versionCount: 2, eventCount: 8, currentVersionNumber: 2, maxVersionNumber: 2 }, { packetId: 'mandate', versionCount: 3, eventCount: 9, currentVersionNumber: 3, maxVersionNumber: 3 }]
const probes = [...Array.from({ length: 4 }, () => ({ packetId: 'otp', contract: 'i1-v1', dryRun: true, nextVersionNumber: 3 })), ...Array.from({ length: 4 }, () => ({ packetId: 'mandate', contract: 'i1-v1', dryRun: true, nextVersionNumber: 4 }))]
const fixture = { h4: { status: 'READY_FOR_I1' }, targetCount: 2, contractProbes: probes, beforeCounts: before, afterCounts: before.map((row) => ({ ...row })), latencyP95Ms: 120, latencyLimitMs: 3000 }
assert.equal(assessLegalDocumentConcurrencyReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentConcurrencyReadiness({ ...fixture, contractProbes: probes.map((probe, index) => index === 0 ? { ...probe, nextVersionNumber: 99 } : probe) }).reasons.includes('I1_CONCURRENT_VERSION_RESERVATION_DRIFT'))
assert.ok(assessLegalDocumentConcurrencyReadiness({ ...fixture, afterCounts: [{ ...before[0], versionCount: 3 }, before[1]] }).reasons.includes('I1_DRY_RUN_MUTATED_DATA'))
assert.ok(assessLegalDocumentConcurrencyReadiness({ ...fixture, latencyP95Ms: 3001 }).reasons.includes('I1_CONCURRENCY_LATENCY_EXCEEDED'))

const migration = fs.readFileSync('../supabase/migrations/202607170029_legal_generation_concurrency_i1.sql', 'utf8')
assert.match(migration, /unique index[\s\S]*packet_id, version_number/i)
assert.match(migration, /revoke insert on table public\.document_packet_versions from authenticated/)
assert.match(migration, /for update/)
assert.match(migration, /bridge_create_document_packet_version_i1/)
assert.match(migration, /if p_dry_run then/)
assert.match(migration, /'contract', 'i1-v1'/)
assert.match(migration, /insert into public\.document_packet_versions/)
assert.match(migration, /update public\.document_packets[\s\S]*current_version_number/)
assert.match(migration, /insert into public\.document_packet_events/)
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const atomicFunction = api.slice(api.indexOf('export async function createDocumentPacketVersion'), api.indexOf('export async function appendDocumentPacketEvent'))
assert.match(atomicFunction, /bridge_create_document_packet_version_i1/)
assert.doesNotMatch(atomicFunction, /getNextPacketVersionNumber/)
assert.doesNotMatch(atomicFunction, /\.from\('document_packet_versions'\)\s*\.insert/)
const verifier = fs.readFileSync('scripts/legal-document-phase-i1-concurrency.mjs', 'utf8')
assert.match(verifier, /Promise\.all\(calls\)/)
assert.match(verifier, /p_dry_run: true/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-i1', 'verify:legal-documents:phase-i1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document I1 concurrency contract passed.')
