import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorAttemptObservabilityBoundary } from '../documentGeneratorAttemptObservabilityBoundary.js'

const targets = [{ packetId: 'otp', packetType: 'otp' }, { packetId: 'mandate', packetType: 'mandate' }]
const probes = targets.flatMap((target) => Array.from({ length: 4 }, () => ({ packetId: target.packetId, packetType: target.packetType, contract: 'i4-generator-v1', generationStatus: 'idle', active: false, safeToRetry: true, retryAfterSeconds: 0, completionTriggerPresent: true, internalIdentifiersExcluded: true, mutatedData: false, error: null })))
const snapshots = targets.map((target) => ({ packetId: target.packetId, stateDigest: `${target.packetType}-state` }))
const fixture = { i3: { status: 'READY_FOR_I4', ready: true }, targets, probes, probesPerPacket: 4, unauthorizedRejected: true, retryGuidanceCovered: true, internalIdentifierExposed: false, beforeSnapshots: snapshots, afterSnapshots: snapshots.map((row) => ({ ...row })), latencyP95Ms: 100, latencyLimitMs: 2000 }

test('accepts safe idle status for mandate and OTP', () => assert.equal(assessDocumentGeneratorAttemptObservabilityBoundary(fixture).ready, true))
test('blocks while a controlled generation is active', () => {
  const changed = probes.map((row, index) => index === 0 ? { ...row, active: true, generationStatus: 'active', safeToRetry: false, retryAfterSeconds: 120 } : row)
  assert.ok(assessDocumentGeneratorAttemptObservabilityBoundary({ ...fixture, probes: changed }).blockers.some((item) => item.code === 'I4_ACTIVE_ATTEMPT_PRESENT'))
})
test('rejects exposure of an internal attempt identifier', () => assert.ok(assessDocumentGeneratorAttemptObservabilityBoundary({ ...fixture, internalIdentifierExposed: true }).blockers.some((item) => item.code === 'I4_INTERNAL_IDENTIFIER_EXPOSED')))
test('rejects missing duplicate-click retry guidance', () => assert.ok(assessDocumentGeneratorAttemptObservabilityBoundary({ ...fixture, retryGuidanceCovered: false }).blockers.some((item) => item.code === 'I4_RETRY_GUIDANCE_MISSING')))
