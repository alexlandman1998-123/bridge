import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorRendererCapacityBoundary } from '../documentGeneratorRendererCapacityBoundary.js'

const targets = [
  { packetId: 'otp', packetType: 'otp', freezeId: 'freeze-otp', sourceVersionId: 'source-otp', contentFingerprint: `sha256:${'a'.repeat(64)}` },
  { packetId: 'mandate', packetType: 'mandate', freezeId: 'freeze-mandate', sourceVersionId: 'source-mandate', contentFingerprint: `sha256:${'b'.repeat(64)}` },
]
const probe = (target, sha256, byteLength) => ({ packetId: target.packetId, packetType: target.packetType, contract: 'i2-v1', generatorContract: 'i2-generator-v1', capacityProbe: true, mutatedData: false, inputAuthority: 'database_frozen_revision', freezeId: target.freezeId, sourceVersionId: target.sourceVersionId, contentFingerprint: target.contentFingerprint, mediaType: 'application/pdf', sha256, byteLength, error: null })
const probes = [...Array.from({ length: 4 }, () => probe(targets[0], `sha256:${'c'.repeat(64)}`, 1000)), ...Array.from({ length: 4 }, () => probe(targets[1], `sha256:${'d'.repeat(64)}`, 1200))]
const snapshots = targets.map((row) => ({ packetId: row.packetId, stateDigest: `${row.packetId}-state` }))
const fixture = { i1: { status: 'READY_FOR_I2', ready: true }, targets, concurrencyPerPacket: 4, probes, unauthorizedProbes: targets.map((row) => ({ packetId: row.packetId, rejected: true })), beforeSnapshots: snapshots, afterSnapshots: snapshots.map((row) => ({ ...row })), latencyP95Ms: 500, latencyLimitMs: 30000 }

test('accepts isolated native PDF capacity for frozen mandate and OTP inputs', () => assert.equal(assessDocumentGeneratorRendererCapacityBoundary(fixture).ready, true))
test('rejects a renderer that uses a different editable freeze', () => {
  const changed = probes.map((row, index) => index === 0 ? { ...row, freezeId: 'other' } : row)
  assert.ok(assessDocumentGeneratorRendererCapacityBoundary({ ...fixture, probes: changed }).blockers.some((item) => item.code === 'I2_FROZEN_INPUT_DRIFT'))
})
test('rejects nondeterministic concurrent PDF output', () => {
  const changed = probes.map((row, index) => index === 0 ? { ...row, sha256: `sha256:${'e'.repeat(64)}` } : row)
  assert.ok(assessDocumentGeneratorRendererCapacityBoundary({ ...fixture, probes: changed }).blockers.some((item) => item.code === 'I2_RENDER_ISOLATION_INVALID'))
})
test('rejects any packet, version, event, document or storage mutation', () => {
  const afterSnapshots = [{ ...snapshots[0], stateDigest: 'changed' }, snapshots[1]]
  assert.ok(assessDocumentGeneratorRendererCapacityBoundary({ ...fixture, afterSnapshots }).blockers.some((item) => item.code === 'I2_STATE_MUTATED'))
})
