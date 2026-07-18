import test from 'node:test'
import assert from 'node:assert/strict'
import { documentGeneratorProtectedTables } from '../documentGeneratorAccessBoundary.js'
import { assessDocumentGeneratorLeastPrivilegeBoundary } from '../documentGeneratorLeastPrivilegeBoundary.js'

const tableProbes = documentGeneratorProtectedTables.map((table) => ({ table, protected: true }))
const storageProbes = ['otp', 'mandate'].flatMap((packetType) => ['generated', 'final'].map((artifactType) => ({ packetType, artifactType, protected: true })))
const fixture = { h1: { status: 'READY_FOR_H2', ready: true }, targetCount: 2, targetOrganisationCount: 1, actorMembershipOrganisationCount: 1, actorAuthorizedTargetCount: 0, policyProbes: [{ allowed: false, contractAvailable: true }, { allowed: false, contractAvailable: true }], catalogue: { contract: 'h2-generator-v1', expectedPolicyTableCount: 10, packetScopedPolicyTableCount: 10, expectedRlsTableCount: 15, rlsTableCount: 15, directPipelineWriteGrantCount: 0, serviceEvidenceClientGrantCount: 0 }, tableProbes, storageProbes, rpcProbes: { launchChainRejected: true, generatedPdfAccessRejected: true, completionStatusRejected: true, recoveryRehearsalRejected: true }, edgeProbes: { mandateFinalizerRejected: true, otpFinalizerRejected: true, dispatcherRejected: true, watchdogRejected: true, recoveryRejected: true }, mutatedData: false }

test('accepts an active member with no packet authority and no visible rows', () => assert.equal(assessDocumentGeneratorLeastPrivilegeBoundary(fixture).ready, true))
test('rejects a broad direct write grant in the deployed catalogue', () => {
  const result = assessDocumentGeneratorLeastPrivilegeBoundary({ ...fixture, catalogue: { ...fixture.catalogue, directPipelineWriteGrantCount: 1 } })
  assert.ok(result.blockers.some((item) => item.code === 'H2_CATALOGUE_BOUNDARY_INVALID' && item.solution))
})
test('rejects accidental assignment or creator authority', () => {
  const result = assessDocumentGeneratorLeastPrivilegeBoundary({ ...fixture, actorAuthorizedTargetCount: 1 })
  assert.ok(result.blockers.some((item) => item.code === 'H2_ACTOR_HAS_PACKET_AUTHORITY'))
})
