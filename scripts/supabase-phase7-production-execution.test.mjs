#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-phase7-production-execution.mjs')

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
assert.equal(JSON.parse(plan.stdout).count, 64)

const streamPlan = run(['--plan', '--stream', 'attorney_calendar', '--json'])
assert.equal(streamPlan.status, 0, streamPlan.stderr)
assert.equal(JSON.parse(streamPlan.stdout).count, 1)

const missingConfirmation = run(['--apply-sql', '--version', '202607170026'])
assert.equal(missingConfirmation.status, 1)
assert.match(missingConfirmation.stderr, /production mutations require/i)

const correctiveReplay = run([
  '--apply-sql', '--version', '202607180027', '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(correctiveReplay.status, 1)
assert.match(correctiveReplay.stderr, /corrective_migration_required cannot be mutated/)

const manualReplay = run([
  '--apply-sql', '--version', '202607180004', '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(manualReplay.status, 1)
assert.match(manualReplay.stderr, /manual_data_review cannot be mutated/)

const repairOnlyReplay = run([
  '--apply-sql', '--version', '202607180047', '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(repairOnlyReplay.status, 1)
assert.match(repairOnlyReplay.stderr, /Refusing production SQL replay for manifest action repair_only_after_smoke/)

const missingStagingEvidence = run([
  '--apply-sql', '--version', '202607170026', '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(missingStagingEvidence.status, 1)
assert.match(missingStagingEvidence.stderr, /--staging-evidence is required/)

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'phase7-production-gate-'))
const stagingEvidencePath = path.join(tempDir, 'staging-evidence.json')
const phaseEvidencePath = path.join(tempDir, 'phase-evidence.json')
const stagingReadinessPath = path.join(tempDir, 'staging-readiness.json')
writeFileSync(stagingEvidencePath, JSON.stringify({
  version: '202607170026',
  stagingProjectRef: 'stagingtestref',
  stagingLedgerRecorded: true,
  catalogChecks: 'pass',
  behaviorChecks: 'pass',
  rollbackOrNoResidue: 'pass',
  approvedBy: 'test reviewer',
}))
writeFileSync(phaseEvidencePath, JSON.stringify({
  version: '202607170026',
  targetProjectRef: 'stagingtestref',
  sqlApplied: true,
  catalogChecks: 'pass',
  behaviorChecks: 'pass',
  rollbackOrNoResidue: 'pass',
  reviewedBy: 'test reviewer',
}))

const missingStagingReadiness = run([
  '--apply-sql', '--version', '202607170026', '--staging-evidence', stagingEvidencePath,
  '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(missingStagingReadiness.status, 1)
assert.match(missingStagingReadiness.stderr, /--staging-readiness is required/)

const approvedStagingReadinessWithoutProductionTarget = run([
  '--apply-sql', '--version', '202607170026', '--staging-evidence', stagingEvidencePath,
  '--staging-readiness', 'docs/supabase-phase-7-staging-readiness.json',
  '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(approvedStagingReadinessWithoutProductionTarget.status, 1)
assert.match(approvedStagingReadinessWithoutProductionTarget.stderr, /SUPABASE_PRODUCTION_PROJECT_REF must equal/)

const phaseEvidenceCompatibility = run([
  '--apply-sql', '--version', '202607170026', '--staging-evidence', phaseEvidencePath,
  '--staging-readiness', 'docs/supabase-phase-7-staging-readiness.json',
  '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(phaseEvidenceCompatibility.status, 1)
assert.match(phaseEvidenceCompatibility.stderr, /SUPABASE_PRODUCTION_PROJECT_REF must equal/)

writeFileSync(stagingReadinessPath, JSON.stringify({
  status: 'READY_FOR_PRODUCTION_PROMOTION',
  productionProjectRef: 'isdowlnollckzvltkasn',
  stagingProjectRef: 'stagingtestref',
  manifestRowCount: 64,
  stagingLedgerRecordedCount: 64,
  stagingEvidenceComplete: true,
  attorneyIntegrityGate: 'pass',
  attorneyIntegrityBlockingAssignments: 0,
  approvedBy: 'test approver',
}))

const wrongProject = run(
  [
    '--apply-sql', '--version', '202607170026', '--staging-evidence', stagingEvidencePath,
    '--staging-readiness', stagingReadinessPath,
    '--confirm', 'APPLY_TO_PRODUCTION',
  ],
  { SUPABASE_PRODUCTION_PROJECT_REF: 'wrongprojectref' },
)
assert.equal(wrongProject.status, 1)
assert.match(wrongProject.stderr, /SUPABASE_PRODUCTION_PROJECT_REF must equal/)

const missingRecovery = run(
  [
    '--apply-sql', '--version', '202607170026', '--staging-evidence', stagingEvidencePath,
    '--staging-readiness', stagingReadinessPath,
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
