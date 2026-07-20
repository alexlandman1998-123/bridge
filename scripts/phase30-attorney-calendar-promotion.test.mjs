#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = 'migration-evidence/2026-07-20-production-phase30-attorney-calendar'
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const evidence = JSON.parse(readFileSync(`${root}/202607180047.json`, 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
const scope = JSON.parse(readFileSync('docs/phase-18-phase-1-release-scope.json', 'utf8'))

assert.equal(summary.status, 'PRODUCTION_PHASE_30_COMPLETE')
assert.deepEqual(summary.requestedVersions, ['202607180047'])
assert.deepEqual(summary.repairOnlyVersions, ['202607180047'])
assert.equal(summary.productionLedgerCountBefore, 500)
assert.equal(summary.productionLedgerCountAfter, 501)
assert.equal(summary.phase30LedgerRows, 1)
assert.equal(summary.closeoutEvidenceComplete, 68)
assert.equal(summary.closeoutEvidenceTotal, 71)
assert.equal(summary.remainingProductionPromotions, 3)
assert.equal(summary.productionFixtureResidue, 0)
assert.equal(summary.phase0FreezeRemainsActive, true)

assert.equal(evidence.applicationMode, 'repair_only_after_production_smoke')
assert.equal(evidence.sqlApplied, false)
assert.equal(evidence.targetStateVerified, true)
assert.equal(evidence.productionLedgerRecorded, true)
assert.equal(evidence.catalogChecks, 'pass')
assert.equal(evidence.behaviorChecks, 'pass')
assert.equal(evidence.rollbackOrNoResidue, 'pass')
assert.equal(evidence.verification.rsvpCapabilityColumnsLive, 3)
assert.equal(evidence.verification.scopedPolicies, 4)
assert.equal(evidence.verification.requiredIndexesLive, 2)
assert.equal(evidence.verification.rsvpFunctionsLive, 2)
assert.equal(evidence.verification.persistentAppointmentsBefore, evidence.verification.persistentAppointmentsAfter)
assert.equal(evidence.verification.persistentParticipantsBefore, evidence.verification.persistentParticipantsAfter)
assert.equal(evidence.verification.persistentRescheduleRequestsBefore, evidence.verification.persistentRescheduleRequestsAfter)
assert.equal(evidence.verification.persistentPhase4FixtureEventsAfter, 0)

assert.ok(closeout.rows.some((row) => row.version === '202607180047' && row.productionLedgerRecorded === true))
assert.equal(closeout.rows.filter((row) => row.productionLedgerRecorded === true).length, 68)
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
assert.equal(scope.status, 'PHASE_1_SCOPE_AMENDED_PHASE_30')
assert.equal(scope.productionBaseline.reviewedProductionPromotions, 68)
assert.equal(scope.productionBaseline.outstandingManifestRows, 3)
assert.equal(scope.productionBaseline.productionLedgerRows, 501)
assert.equal(scope.completedPhase30AttorneyCalendar.status, 'production_verified_and_ledgered')
assert.equal(scope.deferredExistingManifestCount, 0)

console.log('Phase 30 attorney-calendar promotion passed: repair-only smoke verified, ledger 501, and zero fixture residue.')
