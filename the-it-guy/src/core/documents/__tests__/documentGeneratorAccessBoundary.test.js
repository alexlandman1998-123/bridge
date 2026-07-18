import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorAccessBoundary, documentGeneratorProtectedTables } from '../documentGeneratorAccessBoundary.js'

const tableProbes = documentGeneratorProtectedTables.map((table) => ({ table, protected: true }))
const storageProbes = ['otp', 'mandate'].flatMap((packetType) => ['generated', 'final'].map((artifactType) => ({ packetType, artifactType, protected: true })))
const rpcProbes = { launchChainRejected: true, generatedPdfAccessRejected: true, completionStatusRejected: true, recoveryRehearsalRejected: true }
const edgeProbes = { mandateFinalizerRejected: true, otpFinalizerRejected: true, dispatcherRejected: true, watchdogRejected: true, recoveryRejected: true }
const ready = { g4: { status: 'READY_FOR_H1', ready: true }, targetCount: 2, unrelatedMembershipCount: 0, tableProbes, storageProbes, rpcProbes, edgeProbes, mutatedData: false }

test('accepts a complete cross-tenant denial boundary', () => assert.equal(assessDocumentGeneratorAccessBoundary(ready).ready, true))
test('detects a newly added final receipt exposure', () => {
  const probes = tableProbes.map((row) => row.table === 'legal_final_completion_receipts' ? { ...row, protected: false } : row)
  const result = assessDocumentGeneratorAccessBoundary({ ...ready, tableProbes: probes })
  assert.ok(result.blockers.some((item) => item.code === 'H1_CROSS_TENANT_TABLE_EXPOSED' && item.detail.includes('legal_final_completion_receipts')))
})
test('requires generated and signed PDF storage isolation', () => {
  const result = assessDocumentGeneratorAccessBoundary({ ...ready, storageProbes: storageProbes.filter((row) => !(row.packetType === 'otp' && row.artifactType === 'generated')) })
  assert.ok(result.blockers.some((item) => item.code === 'H1_STORAGE_PROBE_MISSING'))
})
