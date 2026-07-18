import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessDraftVersionLineage } from '../src/core/documents/draftVersionLineage.js'

const attempt = '12345678-1234-4123-8123-123456789abc'
const packet = { id: 'packet-1', current_version_number: 2, source_context_json: { lastGeneratedVersion: 2, generationAttemptId: attempt } }
const versions = [{ id: 'version-1', version_number: 1 }, { id: 'version-2', version_number: 2, validation_summary_json: { generationAttemptId: attempt, render_provenance: { generationAttemptId: attempt } } }]
const events = [
  { event_type: 'generation_started', version_id: null, event_payload_json: { generationAttemptId: attempt } },
  { event_type: 'packet_regenerated', version_id: 'version-2', event_payload_json: { generationAttemptId: attempt, versionNumber: 2 } },
]
assert.equal(assessDraftVersionLineage({ packet, version: versions[1], versions, events }).ready, true)
assert.ok(assessDraftVersionLineage({ packet: { ...packet, current_version_number: 1 }, version: versions[1], versions, events }).reasons.includes('D3_CURRENT_VERSION_POINTER_MISMATCH'))
assert.ok(assessDraftVersionLineage({ packet, version: versions[1], versions: [versions[0], { ...versions[1], version_number: 3 }], events }).reasons.includes('D3_VERSION_SEQUENCE_GAP'))
assert.ok(assessDraftVersionLineage({ packet, version: versions[1], versions, events: events.slice(1) }).reasons.includes('D3_GENERATION_STARTED_EVENT_MISSING'))

const service = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-d3-verify.mjs', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(service, /createGenerationAttemptId/)
assert.match(service, /generationAttemptId/)
assert.match(verify, /legal-document-phase-d2-verify\.mjs/)
assert.match(verify, /D3_VERSION_LINEAGE_INVALID/)
assert.match(verify, /generation_started/)
assert.match(verify, /packet_regenerated/)
assert.match(verify, /mutatedData: false/)
assert.match(a2, /legal-document-phase-d3-verify\.mjs/)
for (const name of ['test:legal-documents-phase-d3', 'verify:legal-documents:phase-d3']) assert.ok(pkg.scripts?.[name])

console.log('Legal document D3 draft-version lineage contract passed.')
