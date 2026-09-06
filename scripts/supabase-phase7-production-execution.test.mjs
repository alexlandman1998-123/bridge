#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-phase7-production-execution.mjs')
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'supabase-phase-5-application-manifest.json'), 'utf8'))

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: repoRoot,
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
assert.match(correctiveReplay.stderr, /Manifest action corrective_migration_required cannot be mutated/)

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
