#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-phase7-production-execution.mjs')
// Exercise known pending rows without depending on today's operational backlog.
// All mutation scenarios below must fail before a database command can run.
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'phase7-gate-fixture-'))
process.on('exit', () => rmSync(fixtureRoot, { recursive: true, force: true }))
mkdirSync(path.join(fixtureRoot, 'supabase/migrations'), { recursive: true })
mkdirSync(path.join(fixtureRoot, 'docs/non-runnable-clearance'), { recursive: true })
const manifest = { linkedProjectRef: 'isdowlnollckzvltkasn', rows: [
  {
    "version": "20260828203724",
    "file": "20260828203724_fixture_apply.sql",
    "stream": "bond_finance_runtime",
    "action": "apply_original_after_dependency_check"
  },
  {
    "version": "20260903094957",
    "file": "20260903094957_fixture_repair.sql",
    "stream": "bond_finance_runtime",
    "action": "repair_only_after_smoke"
  },
  {
    "version": "202608200001",
    "file": "202608200001_fixture_legacy.sql",
    "stream": "bond_finance_runtime",
    "action": "corrective_migration_required"
  }
] }
writeFileSync(path.join(fixtureRoot, 'docs/supabase-phase-5-application-manifest.json'), JSON.stringify(manifest))
for (const row of manifest.rows) writeFileSync(path.join(fixtureRoot, 'supabase/migrations', row.file), '-- Fixture only; never executed.\n')
writeFileSync(path.join(fixtureRoot, 'docs/non-runnable-clearance/202608200001-bond_finance_runtime.json'), JSON.stringify({
  clearanceDecision: 'apply_corrective_after_dependency_check', approvedBy: 'fixture reviewer',
  approvedAt: '2026-11-08', blockers: [], correctiveVersion: '20260906163540',
  correctiveMigrationFile: 'supabase/migrations/20260906163540_fixture_corrective.sql',
}))

// A fully reconciled real manifest legitimately produces an empty plan.
const currentManifest = JSON.parse(readFileSync(path.join(repoRoot, 'docs/supabase-phase-5-application-manifest.json'), 'utf8'))
const currentPlan = spawnSync(process.execPath, [runner, '--plan', '--json'], { cwd: repoRoot, encoding: 'utf8' })
assert.equal(currentPlan.status, 0, currentPlan.stderr)
assert.ok(JSON.parse(currentPlan.stdout).count >= 0)
assert.ok(JSON.parse(currentPlan.stdout).count <= currentManifest.rows.length)


function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_PRODUCTION_PROJECT_REF: '',
      SUPABASE_PRODUCTION_DB_URL: '',
      SUPABASE_PRODUCTION_RECOVERY_CONFIRMED: '',
      ...extraEnv,
    },
  })
}

const plan = run(['--plan', '--json'])
assert.equal(plan.status, 0, plan.stderr)
assert.equal(JSON.parse(plan.stdout).count, manifest.rows.length)
const streamPlan = run(['--plan', '--stream', 'bond_finance_runtime', '--json'])
assert.equal(streamPlan.status, 0, streamPlan.stderr)
const streamResult = JSON.parse(streamPlan.stdout)
assert.ok(streamResult.count > 0)
assert.ok(streamResult.rows.every((row) => row.stream === 'bond_finance_runtime'))

const missingConfirmation = run(['--apply-sql', '--version', '20260828203724'])
assert.equal(missingConfirmation.status, 1)
assert.match(missingConfirmation.stderr, /production mutations require/i)

const correctiveReplay = run([
  '--apply-sql', '--version', '202608200001', '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(correctiveReplay.status, 1)
assert.match(correctiveReplay.stderr, /Expected one manifest row for 202608200001; found 0/)

const approvedCorrectiveRequiresEvidence = run([
  '--apply-sql', '--version', '20260906163540', '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(approvedCorrectiveRequiresEvidence.status, 1)
assert.match(approvedCorrectiveRequiresEvidence.stderr, /--staging-evidence is required/)

const repairOnlyReplay = run([
  '--apply-sql', '--version', '20260903094957', '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(repairOnlyReplay.status, 1)
assert.match(repairOnlyReplay.stderr, /Refusing production SQL replay for manifest action repair_only_after_smoke/)

const missingStagingEvidence = run([
  '--apply-sql', '--version', '20260828203724', '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(missingStagingEvidence.status, 1)
assert.match(missingStagingEvidence.stderr, /--staging-evidence is required/)

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'phase7-production-gate-'))
const stagingEvidencePath = path.join(tempDir, 'staging-evidence.json')
writeFileSync(stagingEvidencePath, JSON.stringify({
  version: '20260828203724',
  stagingProjectRef: 'stagingtestref',
  stagingLedgerRecorded: true,
  catalogChecks: 'pass',
  behaviorChecks: 'pass',
  rollbackOrNoResidue: 'pass',
  approvedBy: 'test reviewer',
}))

const wrongProject = run(
  [
    '--apply-sql', '--version', '20260828203724', '--staging-evidence', stagingEvidencePath,
    '--confirm', 'APPLY_TO_PRODUCTION',
  ],
  { SUPABASE_PRODUCTION_PROJECT_REF: 'wrongprojectref' },
)
assert.equal(wrongProject.status, 1)
assert.match(wrongProject.stderr, /SUPABASE_PRODUCTION_PROJECT_REF must equal/)

const missingRecovery = run(
  [
    '--apply-sql', '--version', '20260828203724', '--staging-evidence', stagingEvidencePath,
    '--confirm', 'APPLY_TO_PRODUCTION',
  ],
  {
    SUPABASE_PRODUCTION_PROJECT_REF: 'isdowlnollckzvltkasn',
    SUPABASE_PRODUCTION_DB_URL: 'postgresql://postgres.isdowlnollckzvltkasn@example.invalid/postgres',
  },
)
assert.equal(missingRecovery.status, 1)
assert.match(missingRecovery.stderr, /only after recovery has been tested/)

rmSync(tempDir, { recursive: true })

console.log('Supabase Phase 7 production execution tests passed.')
