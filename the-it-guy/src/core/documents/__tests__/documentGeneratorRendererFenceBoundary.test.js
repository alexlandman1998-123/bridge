import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorRendererFenceBoundary } from '../documentGeneratorRendererFenceBoundary.js'

const targets = [{ packetId: 'otp', packetType: 'otp' }, { packetId: 'mandate', packetType: 'mandate' }]
const diagnostics = targets.map((target) => ({ ...target, contract: 'i5-generator-diagnostic-v1', activeLeaseCount: 0, serviceExecute: true, authenticatedExecute: false, mutatedData: false, error: null }))
const mismatchProbes = targets.map((target) => ({ ...target, rejected: true }))
const snapshots = targets.map((target) => ({ packetId: target.packetId, stateDigest: `${target.packetType}-state` }))
const fixture = { i4: { status: 'READY_FOR_I5', ready: true }, targets, diagnostics, mismatchProbes, unauthorizedRejected: true, rendererCheckpointsCovered: true, ambiguousTimeoutFenced: true, beforeSnapshots: snapshots, afterSnapshots: snapshots.map((row) => ({ ...row })), latencyP95Ms: 100, latencyLimitMs: 2000 }

test('accepts a service-only two-checkpoint renderer fence', () => assert.equal(assessDocumentGeneratorRendererFenceBoundary(fixture).ready, true))
test('rejects a mismatched attempt that can pass the fence', () => assert.ok(assessDocumentGeneratorRendererFenceBoundary({ ...fixture, mismatchProbes: [{ ...mismatchProbes[0], rejected: false }, mismatchProbes[1]] }).blockers.some((item) => item.code === 'I5_MISMATCH_NOT_REJECTED')))
test('rejects a renderer without both fence checkpoints', () => assert.ok(assessDocumentGeneratorRendererFenceBoundary({ ...fixture, rendererCheckpointsCovered: false }).blockers.some((item) => item.code === 'I5_RENDERER_CHECKPOINTS_MISSING')))
test('rejects timeout handling that releases ambiguous work', () => assert.ok(assessDocumentGeneratorRendererFenceBoundary({ ...fixture, ambiguousTimeoutFenced: false }).blockers.some((item) => item.code === 'I5_AMBIGUOUS_TIMEOUT_UNFENCED')))
