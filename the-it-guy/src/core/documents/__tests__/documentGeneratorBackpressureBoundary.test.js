import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorBackpressureBoundary } from '../documentGeneratorBackpressureBoundary.js'

const targets = [{ packetId: 'otp', packetType: 'otp' }, { packetId: 'mandate', packetType: 'mandate' }]
const probesFor = (target) => Array.from({ length: 4 }, (_, index) => ({ packetId: target.packetId, packetType: target.packetType, contract: 'i3-generator-v1', claimed: index === 0, activeLeaseCount: 0, primaryKeyPresent: true, completionTriggerPresent: true, expiryIndexPresent: true, mutatedData: false, error: null }))
const waves = [1, 2].map((waveNumber) => ({ waveNumber, probes: targets.flatMap(probesFor) }))
const snapshots = targets.map((row) => ({ packetId: row.packetId, stateDigest: `${row.packetId}-state` }))
const fixture = { i2: { status: 'READY_FOR_I3', ready: true }, targets, concurrencyPerPacket: 4, waves, unauthorizedRejected: true, beforeSnapshots: snapshots, afterSnapshots: snapshots.map((row) => ({ ...row })), latencyP95Ms: 1000, latencyLimitMs: 5000 }

test('accepts exactly one holder per packet in consecutive waves', () => assert.equal(assessDocumentGeneratorBackpressureBoundary(fixture).ready, true))
test('rejects two accepted requests for one packet', () => {
  const changed = structuredClone(waves)
  changed[0].probes[1].claimed = true
  assert.ok(assessDocumentGeneratorBackpressureBoundary({ ...fixture, waves: changed }).blockers.some((item) => item.code === 'I3_SINGLE_HOLDER_INVALID'))
})
test('rejects an active or incompletely cleaned lease', () => {
  const changed = structuredClone(waves)
  changed[0].probes[0].activeLeaseCount = 1
  assert.ok(assessDocumentGeneratorBackpressureBoundary({ ...fixture, waves: changed }).blockers.some((item) => item.code === 'I3_ACTIVE_LEASE_PRESENT'))
})
test('rejects persistent state changes from a diagnostic wave', () => {
  const afterSnapshots = [{ ...snapshots[0], stateDigest: 'changed' }, snapshots[1]]
  assert.ok(assessDocumentGeneratorBackpressureBoundary({ ...fixture, afterSnapshots }).blockers.some((item) => item.code === 'I3_STATE_MUTATED'))
})
