#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'))

const versions = ['202607200002', '202607200008', '202607200009', '202607200010', '202607200011', '202607200012', '202607200013']
const manifest = readJson('docs/supabase-phase-5-application-manifest.json')
const evidence = readJson('docs/supabase-phase-8-closeout-evidence.json')
const readiness = readJson('docs/supabase-phase-7-staging-readiness.json')
const scope = readJson('docs/phase-18-phase-1-release-scope.json')
const staging = readJson('migration-evidence/2026-07-20-staging-phase32-final-closeout/batch-summary.json')
const production = readJson('migration-evidence/2026-07-20-production-phase32-final-closeout/batch-summary.json')
const governedCount = manifest.rows.length

assert.ok(governedCount > 0)
assert.equal(evidence.rows.length, governedCount)
assert.equal(new Set(manifest.rows.map((row) => row.version)).size, governedCount)
assert.equal(new Set(evidence.rows.map((row) => row.version)).size, governedCount)
for (const version of versions) {
  assert.ok(manifest.rows.some((row) => row.version === version), `manifest missing ${version}`)
  assert.ok(evidence.rows.some((row) => row.version === version && row.productionLedgerRecorded === true), `evidence missing ${version}`)
  assert.ok(existsSync(path.join(repoRoot, 'supabase', 'migrations', manifest.rows.find((row) => row.version === version).file)))
}

assert.equal(readiness.manifestRowCount, governedCount)
assert.equal(readiness.stagingLedgerRecordedCount, governedCount)
assert.equal(readiness.stagingEvidenceComplete, true)
assert.equal(staging.ledgerRowsAfter, 511)
assert.deepEqual(staging.versions, versions)
assert.equal(production.ledgerRowsAfter, 511)
assert.deepEqual(production.versions, versions)
assert.equal(production.applicationCutover.releaseCommit, '333c08eb420742a95330b07483d3c373f4978d6a')
assert.equal(production.applicationCutover.deploymentStatus, 'Ready')
assert.equal(production.checks.canonicalPartnerSaveAvailable, true)
assert.equal(production.checks.canonicalPartnerListAvailable, true)
assert.equal(production.checks.legacyAuthenticatedWritesAvailable, false)
assert.equal(production.checks.missingRelationshipRoleConfigurations, 0)
assert.equal(production.inventoryCloseout.governedVersionsOutstanding, 0)
assert.deepEqual(production.inventoryCloseout.newUnreviewedLocalOnlyVersions, ['202607200014'])
assert.equal(production.inventoryCloseout.phase0FreezeRetired, false)
assert.equal(scope.productionBaseline.manifestRows, governedCount)
assert.equal(scope.productionBaseline.reviewedProductionPromotions, governedCount)
assert.equal(scope.productionBaseline.productionLedgerRows, 511)
assert.equal(scope.changeControl.phase0MigrationFreezeRemainsActive, true)

console.log('Phase 32 final production closeout passed: governed scope 78/78 at ledger 511; freeze correctly held for unreviewed 202607200014.')
