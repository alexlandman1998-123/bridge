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
const phase22 = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase22/staging-inventory-expansion.json', 'utf8'))
const authorizedPostBaselineMigrations = [
  '202607200007_document_generator_least_privilege_h2_fix.sql',
  '202607200009_partner_identity_linking_and_deduplication.sql',
  '202607200010_canonical_partner_relationship_storage.sql',
  '202607209901_attorney_professional_role_persistence_phase24_fix.sql',
  '202607209902_attorney_professional_permission_cutover_phase24_fix.sql',
  '202607209903_transaction_participant_requirements_least_privilege_phase25_fix.sql',
]

assert.equal(evidence.status, 'MIGRATION_INVENTORY_REPAIRED')
assert.equal(files.length, evidence.inventory.migrationFiles + authorizedPostBaselineMigrations.length)
assert.equal(byVersion.size, evidence.inventory.uniqueVersions + authorizedPostBaselineMigrations.length)
assert.deepEqual(duplicates, [])
assert.deepEqual(evidence.inventory.duplicateVersions, [])
assert.ok(files.includes(evidence.inventory.preservedMigration))
for (const migration of authorizedPostBaselineMigrations) assert.ok(files.includes(migration))
assert.deepEqual(chainVersions, ['202607200004', '202607200005', '202607200006'])
assert.deepEqual(scope.pendingConditionalMasterInventory.files, chainFiles)
assert.deepEqual(scope.pendingConditionalMasterInventory.allocatedVersions, chainVersions)
assert.equal(scope.pendingConditionalMasterInventory.inventoryRepairStatus, 'complete')

for (const row of evidence.conditionalMasterChain) {
  assert.equal(existsSync(`${migrationsDirectory}/${row.oldFile}`), false, `stale migration remains: ${row.oldFile}`)
  assert.equal(existsSync(`${migrationsDirectory}/${row.newFile}`), true, `allocated migration missing: ${row.newFile}`)
  const digest = createHash('sha256').update(readFileSync(`${migrationsDirectory}/${row.newFile}`)).digest('hex')
  assert.equal(digest, phase22.migrationSha256[row.version] ?? row.sha256, `migration content changed without Phase 22 authorization: ${row.newFile}`)
  assert.equal(manifestVersions.has(row.version), phase22.manifestExpansionAuthorized, `Phase 22 manifest authorization mismatch: ${row.version}`)
}

assert.equal(evidence.allocationEvidence.productionLedgerQuery, 'pass_empty')
assert.deepEqual(evidence.allocationEvidence.productionLedgerVersionsFound, [])
assert.equal(evidence.scope.sqlAppliedToStaging, false)
assert.equal(evidence.scope.sqlAppliedToProduction, false)
assert.equal(evidence.scope.productionLedgerChanged, false)
assert.equal(evidence.scope.phase0MigrationFreezeRemainsActive, true)

console.log(`Phase 19 inventory baseline plus ${authorizedPostBaselineMigrations.length} authorized post-baseline migrations passed: ${byVersion.size} unique versions.`)
