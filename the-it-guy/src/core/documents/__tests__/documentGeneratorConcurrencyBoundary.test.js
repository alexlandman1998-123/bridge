import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorConcurrencyBoundary } from '../documentGeneratorConcurrencyBoundary.js'

const beforeSnapshots = [{ packetId: 'otp', maxVersionNumber: 2, stateDigest: 'otp-state' }, { packetId: 'mandate', maxVersionNumber: 4, stateDigest: 'mandate-state' }]
const atomicProbes = [...Array.from({ length: 4 }, () => ({ packetId: 'otp', contract: 'i1-v1', dryRun: true, nextVersionNumber: 3 })), ...Array.from({ length: 4 }, () => ({ packetId: 'mandate', contract: 'i1-v1', dryRun: true, nextVersionNumber: 5 }))]
const lineage = (packetId, nextVersionNumber) => ({ packetId, contract: 'i1-generator-v1', mutatedData: false, uniqueIndexPresent: true, insertGuardPresent: true, currentPointerMatchesMax: true, duplicateVersionNumberCount: 0, versionCreatedEventMismatchCount: 0, orphanVersionEventCount: 0, nextVersionNumber })
const lineageProbes = [...Array.from({ length: 4 }, () => lineage('otp', 3)), ...Array.from({ length: 4 }, () => lineage('mandate', 5))]
const fixture = { h4: { status: 'READY_FOR_I1', ready: true }, targetCount: 2, concurrencyPerPacket: 4, atomicProbes, lineageProbes, beforeSnapshots, afterSnapshots: beforeSnapshots.map((row) => ({ ...row })), latencyP95Ms: 100, latencyLimitMs: 3000 }

test('accepts stable concurrent dry-run reservations without state changes', () => assert.equal(assessDocumentGeneratorConcurrencyBoundary(fixture).ready, true))
test('detects current-version pointer drift', () => {
  const probes = lineageProbes.map((row, index) => index === 0 ? { ...row, currentPointerMatchesMax: false } : row)
  assert.ok(assessDocumentGeneratorConcurrencyBoundary({ ...fixture, lineageProbes: probes }).blockers.some((item) => item.code === 'I1_CURRENT_POINTER_DRIFT'))
})
test('detects an editable state mutation missed by row counts', () => {
  const afterSnapshots = [{ ...beforeSnapshots[0], stateDigest: 'changed' }, beforeSnapshots[1]]
  assert.ok(assessDocumentGeneratorConcurrencyBoundary({ ...fixture, afterSnapshots }).blockers.some((item) => item.code === 'I1_STATE_MUTATED' && item.solution))
})
test('detects a missing or duplicated version-created event', () => {
  const probes = lineageProbes.map((row, index) => index === 0 ? { ...row, versionCreatedEventMismatchCount: 1 } : row)
  assert.ok(assessDocumentGeneratorConcurrencyBoundary({ ...fixture, lineageProbes: probes }).blockers.some((item) => item.code === 'I1_VERSION_LINEAGE_CORRUPT'))
})
