import test from 'node:test'
import assert from 'node:assert/strict'
import { documentGeneratorProtectedTables } from '../documentGeneratorAccessBoundary.js'
import { assessDocumentGeneratorAuthorityContinuity, documentGeneratorAuthorisedReadTables } from '../documentGeneratorAuthorityContinuity.js'

const storage = ['otp', 'mandate'].flatMap((packetType) => ['generated', 'final'].map((artifactType) => ({ packetType, artifactType })))
const fixture = { h2: { status: 'READY_FOR_H3', ready: true }, targetCount: 2, targetOrganisationCount: 1, authorisedActorAvailable: true, authorisedTargetCount: 2, revokedActorAvailable: true, revokedMembershipOrganisationCount: 1, revokedActiveMembershipCount: 0, authorisedPolicyProbes: [{ allowed: true }, { allowed: true }], revokedPolicyProbes: [{ allowed: false }, { allowed: false }], authorisedTableProbes: documentGeneratorAuthorisedReadTables.map((table) => ({ table, complete: true })), revokedTableProbes: documentGeneratorProtectedTables.map((table) => ({ table, protected: true })), authorisedStorageProbes: storage.map((row) => ({ ...row, accessible: true, validPdf: true })), revokedStorageProbes: storage.map((row) => ({ ...row, protected: true })), authorisedRpcProbes: { launchChain: true, generatedPdfAccess: true, completionStatus: true, recoveryRehearsal: true }, revokedRpcProbes: { launchChain: true, generatedPdfAccess: true, completionStatus: true, recoveryRehearsal: true }, authorisedEdgeProbes: { mandateFinalizerAccepted: true, otpFinalizerAccepted: true, recoveryAccepted: true }, revokedEdgeProbes: { mandateFinalizerRejected: true, otpFinalizerRejected: true, recoveryRejected: true }, mutatedData: false }

test('accepts legitimate authority and immediate revoked-member denial', () => assert.equal(assessDocumentGeneratorAuthorityContinuity(fixture).ready, true))
test('detects a broken authorised final PDF path', () => {
  const probes = fixture.authorisedStorageProbes.map((row) => row.packetType === 'otp' && row.artifactType === 'final' ? { ...row, accessible: false } : row)
  assert.ok(assessDocumentGeneratorAuthorityContinuity({ ...fixture, authorisedStorageProbes: probes }).blockers.some((item) => item.code === 'H3_AUTHORISED_STORAGE_PATH_BROKEN'))
})
test('detects residual access after membership revocation', () => {
  const result = assessDocumentGeneratorAuthorityContinuity({ ...fixture, revokedActiveMembershipCount: 1 })
  assert.ok(result.blockers.some((item) => item.code === 'H3_REVOKED_ACTOR_INVALID' && item.solution))
})
