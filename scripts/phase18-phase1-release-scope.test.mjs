#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const scope = JSON.parse(readFileSync('docs/phase-18-phase-1-release-scope.json', 'utf8'))
const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const evidence = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
const promoted = new Set(evidence.rows.filter((row) => row.productionLedgerRecorded === true).map((row) => row.version))
const outstanding = manifest.rows.map((row) => row.version).filter((version) => !promoted.has(version)).sort()
const included = Object.values(scope.includedExistingManifestVersions).flat().sort()
const deferred = Object.values(scope.deferredExistingManifestVersions).flat().sort()
const governedOutstanding = [...included, ...deferred].sort()

assert.equal(scope.status, 'PHASE_1_SCOPE_LOCKED')
assert.equal(manifest.rows.length, scope.productionBaseline.manifestRows)
assert.equal(promoted.size, scope.productionBaseline.reviewedProductionPromotions)
assert.equal(outstanding.length, scope.productionBaseline.outstandingManifestRows)
assert.equal(included.length, scope.includedExistingManifestCount)
assert.equal(deferred.length, scope.deferredExistingManifestCount)
assert.equal(new Set(governedOutstanding).size, governedOutstanding.length)
assert.deepEqual(governedOutstanding, outstanding)
assert.equal(scope.pendingConditionalMasterInventory.files.length, scope.pendingConditionalMasterInventory.count)
assert.equal(new Set(scope.pendingConditionalMasterInventory.files).size, scope.pendingConditionalMasterInventory.files.length)
assert.equal(scope.pilotLimits.organisationCount, 1)
assert.ok(scope.pilotLimits.maximumParticipants <= 10)
assert.equal(scope.changeControl.newFeatureScopeAllowed, false)
assert.equal(scope.changeControl.explicitScopeAmendmentRequired, true)
assert.equal(scope.changeControl.deferredStreamsMayNotBePromotedDuringPilotPreparation, true)
assert.equal(scope.changeControl.phase0MigrationFreezeRemainsActive, true)

console.log('Phase 18 Phase 1 release scope tests passed.')
