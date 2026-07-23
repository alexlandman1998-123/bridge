import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentRendererCapacity } from '../src/core/documents/legalDocumentRendererCapacity.js'

const probes = [...Array.from({ length: 4 }, () => ({ packetType: 'otp', contract: 'i2-v1', capacityProbe: true, mutatedData: false, sha256: `sha256:${'a'.repeat(64)}`, byteLength: 1000 })), ...Array.from({ length: 4 }, () => ({ packetType: 'mandate', contract: 'i2-v1', capacityProbe: true, mutatedData: false, sha256: `sha256:${'b'.repeat(64)}`, byteLength: 1200 }))]
const state = [{ packetId: 'otp', currentVersionNumber: 1, versionCount: 1, eventCount: 5, documentCount: 2, storageObjectCount: 1 }, { packetId: 'mandate', currentVersionNumber: 2, versionCount: 2, eventCount: 7, documentCount: null, storageObjectCount: 1 }]
const fixture = { i1: { status: 'READY_FOR_I2' }, targetCount: 2, probes, unauthorizedProbes: [{ rejected: true }, { rejected: true }], beforeState: state, afterState: state.map((row) => ({ ...row })), latencyP95Ms: 500, latencyLimitMs: 30000, concurrencyPerType: 4 }
assert.equal(assessLegalDocumentRendererCapacity(fixture).ready, true)
assert.ok(assessLegalDocumentRendererCapacity({ ...fixture, probes: probes.map((probe, index) => index === 0 ? { ...probe, sha256: `sha256:${'c'.repeat(64)}` } : probe) }).reasons.includes('I2_CONCURRENT_RENDER_ISOLATION_INVALID'))
assert.ok(assessLegalDocumentRendererCapacity({ ...fixture, afterState: [{ ...state[0], storageObjectCount: 2 }, state[1]] }).reasons.includes('I2_CAPACITY_PROBE_MUTATED_DATA'))

const canonicalGenerator = fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8')
assert.match(canonicalGenerator, /packetType === "otp"/)
assert.match(canonicalGenerator, /RENDERER_CONTRACT = "i2-v1"/)
assert.match(canonicalGenerator, /capacityProbe && bearer !== SUPABASE_SERVICE_ROLE_KEY/)
assert.match(canonicalGenerator, /RENDER_CAPACITY_FORBIDDEN/)
assert.match(canonicalGenerator, /mutatedData: false/)
const probeExit = canonicalGenerator.lastIndexOf('if (capacityProbe)')
const upload = canonicalGenerator.indexOf('.upload(', probeExit)
assert.ok(probeExit > 0 && upload > probeExit, 'The canonical generator must return from capacity mode before upload')
const verifier = fs.readFileSync('scripts/legal-document-phase-i2-renderer-capacity.mjs', 'utf8')
assert.match(verifier, /Promise\.all\(calls\)/)
assert.match(verifier, /capacityProbe: true/)
assert.match(verifier, /mutatedData: false/)
assert.match(verifier, /functionName: 'generate-mandate'/)
assert.doesNotMatch(verifier, /generate-otp/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-i2', 'verify:legal-documents:phase-i2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document I2 renderer-capacity contract passed.')
