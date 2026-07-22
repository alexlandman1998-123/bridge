#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'))
const readText = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8')

const manifest = readJson('docs/supabase-phase-5-application-manifest.json')
const readiness = readJson('docs/supabase-phase-7-staging-readiness.json')
const closeout = readJson('docs/supabase-phase-8-closeout-evidence.json')
const releaseScope = readJson('docs/phase-18-phase-1-release-scope.json')
const productionCloseout = readJson('migration-evidence/2026-07-20-production-phase32-final-closeout/batch-summary.json')
const governedCount = manifest.rows.length
const manifestVersions = manifest.rows.map((row) => String(row.version || ''))
const closeoutVersions = closeout.rows.map((row) => String(row.version || ''))

assert.ok(governedCount > 0, 'The governed migration manifest must not be empty.')
assert.equal(new Set(manifestVersions).size, governedCount, 'Governed manifest versions must be unique.')
assert.ok(manifestVersions.every(Boolean), 'Every governed migration must have a version.')
for (const row of manifest.rows) {
  assert.ok(row.file, `Governed migration ${row.version} is missing its file name.`)
  assert.ok(existsSync(path.join(repoRoot, 'supabase', 'migrations', row.file)), `Governed migration file is missing: ${row.file}`)
}

assert.equal(closeout.rows.length, governedCount)
assert.deepEqual([...closeoutVersions].sort(), [...manifestVersions].sort())
assert.equal(readiness.manifestRowCount, governedCount)
assert.equal(readiness.stagingLedgerRecordedCount, governedCount)
assert.equal(releaseScope.productionBaseline.manifestRows, governedCount)
assert.equal(releaseScope.productionBaseline.reviewedProductionPromotions, governedCount)
assert.equal(productionCloseout.inventoryCloseout.governedVersionsOutstanding, 0)

for (const workflow of [
  '.github/workflows/supabase-phase6-staging-gate.yml',
  '.github/workflows/supabase-phase7-production-gate.yml',
]) {
  const source = readText(workflow)
  assert.match(source, /npm run supabase:phase35:verify/)
  assert.doesNotMatch(source, /rows\.length\s*!==\s*\d+/)
  assert.doesNotMatch(source, /Expected \d+ manifest rows/)
}

const stagingCertification = readText('scripts/supabase-phase11-staging-certification.mjs')
assert.doesNotMatch(stagingCertification, /EXPECTED_MANIFEST_ROWS/)

console.log(`Phase 35 passed: ${governedCount} governed migrations are derived consistently from the manifest with no stale workflow totals.`)
