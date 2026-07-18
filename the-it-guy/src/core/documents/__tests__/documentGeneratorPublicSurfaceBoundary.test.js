import test from 'node:test'
import assert from 'node:assert/strict'
import { documentGeneratorProtectedTables } from '../documentGeneratorAccessBoundary.js'
import { assessDocumentGeneratorPublicSurfaceBoundary } from '../documentGeneratorPublicSurfaceBoundary.js'

const artifacts = ['otp', 'mandate'].flatMap((packetType) => ['generated', 'final'].map((artifactType) => ({ packetType, artifactType, protected: true })))
const signerEvidence = ['otp', 'mandate'].map((packetType) => ({ contract: 'h4-generator-v1', packetType, currentVersion: true, certifiedPdfBound: true, signerCount: 2, invalidTokenCount: 0, signersWithoutFields: 0, signersWithoutRequiredSignature: 0, ambiguousUnscopedFieldCount: 0, deliveredDispatchCount: 1, publicResponseKeys: ['signer', 'packet', 'fields'], internalIdentifiersExcluded: true, mutatedData: false }))
const fixture = { h3: { status: 'READY_FOR_H4', ready: true }, targetCount: 2, tableProbes: documentGeneratorProtectedTables.map((table) => ({ table, protected: true })), storageProbes: artifacts, publicUrlProbes: artifacts, rpcProbes: { packetAuthorityRejected: true, launchChainRejected: true, generatedPdfAccessRejected: true, completionStatusRejected: true, recoveryRehearsalRejected: true }, operationProbes: { mandateFinalizerRejected: true, otpFinalizerRejected: true, dispatcherRejected: true, watchdogRejected: true, recoveryRejected: true }, fakeTokenProbes: { resolveRejected: true, actionRejected: true, responsesSanitised: true }, signerSurfaceEvidence: signerEvidence, mutatedData: false }

test('accepts a private anonymous surface and scoped signer contract', () => assert.equal(assessDocumentGeneratorPublicSurfaceBoundary(fixture).ready, true))
test('rejects an anonymously downloadable generated PDF', () => {
  const storageProbes = artifacts.map((row) => row.packetType === 'mandate' && row.artifactType === 'generated' ? { ...row, protected: false } : row)
  assert.ok(assessDocumentGeneratorPublicSurfaceBoundary({ ...fixture, storageProbes }).blockers.some((item) => item.code === 'H4_ANONYMOUS_STORAGE_EXPOSED'))
})
test('rejects public signer responses containing internal identifiers', () => {
  const evidence = signerEvidence.map((row) => row.packetType === 'otp' ? { ...row, internalIdentifiersExcluded: false } : row)
  assert.ok(assessDocumentGeneratorPublicSurfaceBoundary({ ...fixture, signerSurfaceEvidence: evidence }).blockers.some((item) => item.code === 'H4_PUBLIC_RESPONSE_OVERSHARED' && item.solution))
})
