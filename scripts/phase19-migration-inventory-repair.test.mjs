#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const migrationsDirectory = 'supabase/migrations'
const evidence = JSON.parse(readFileSync('docs/phase-19-migration-inventory-repair.json', 'utf8'))
const scope = JSON.parse(readFileSync('docs/phase-18-phase-1-release-scope.json', 'utf8'))
const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const files = readdirSync(migrationsDirectory).filter((file) => file.endsWith('.sql')).sort()
const byVersion = new Map()

for (const file of files) {
  const version = file.split('_')[0]
  const versionFiles = byVersion.get(version) ?? []
  versionFiles.push(file)
  byVersion.set(version, versionFiles)
}

const duplicates = [...byVersion.entries()].filter(([, versionFiles]) => versionFiles.length > 1)
const chainFiles = evidence.conditionalMasterChain.map((row) => row.newFile)
const chainVersions = evidence.conditionalMasterChain.map((row) => row.version)
const manifestVersions = new Set(manifest.rows.map((row) => row.version))

assert.equal(evidence.status, 'MIGRATION_INVENTORY_REPAIRED')
assert.equal(files.length, evidence.inventory.migrationFiles)
assert.equal(byVersion.size, evidence.inventory.uniqueVersions)
assert.deepEqual(duplicates, [])
assert.deepEqual(evidence.inventory.duplicateVersions, [])
assert.ok(files.includes(evidence.inventory.preservedMigration))
assert.deepEqual(chainVersions, ['202607200004', '202607200005', '202607200006'])
assert.deepEqual(scope.pendingConditionalMasterInventory.files, chainFiles)
assert.deepEqual(scope.pendingConditionalMasterInventory.allocatedVersions, chainVersions)
assert.equal(scope.pendingConditionalMasterInventory.inventoryRepairStatus, 'complete')

for (const row of evidence.conditionalMasterChain) {
  assert.equal(existsSync(`${migrationsDirectory}/${row.oldFile}`), false, `stale migration remains: ${row.oldFile}`)
  assert.equal(existsSync(`${migrationsDirectory}/${row.newFile}`), true, `allocated migration missing: ${row.newFile}`)
  const digest = createHash('sha256').update(readFileSync(`${migrationsDirectory}/${row.newFile}`)).digest('hex')
  assert.equal(digest, row.sha256, `migration content changed: ${row.newFile}`)
  assert.equal(manifestVersions.has(row.version), false, `Phase 19 must not silently expand the frozen manifest: ${row.version}`)
}

assert.equal(evidence.allocationEvidence.productionLedgerQuery, 'pass_empty')
assert.deepEqual(evidence.allocationEvidence.productionLedgerVersionsFound, [])
assert.equal(evidence.scope.sqlAppliedToStaging, false)
assert.equal(evidence.scope.sqlAppliedToProduction, false)
assert.equal(evidence.scope.productionLedgerChanged, false)
assert.equal(evidence.scope.phase0MigrationFreezeRemainsActive, true)

console.log('Phase 19 migration inventory repair tests passed: 501 unique versions and conditional chain reserved at 202607200004–202607200006.')
