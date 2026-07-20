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
      SUPABASE_PRODUCTION_ACCESS_MODE: '',
      SUPABASE_PRODUCTION_RECOVERY_CONFIRMED: '',
      ...extraEnv,
    },
  })
}

const plan = run(['--plan', '--json'])
assert.equal(plan.status, 0, plan.stderr)
assert.equal(JSON.parse(plan.stdout).count, 71)

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
const recoveryEvidencePath = path.join(tempDir, 'recovery-evidence.json')
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
writeFileSync(recoveryEvidencePath, JSON.stringify({
  status: 'PRODUCTION_DATABASE_RECOVERY_PROVEN',
  productionProjectRef: 'isdowlnollckzvltkasn',
  restoredProjectRef: 'vaszuxjeoajeuhlcnzzf',
  databaseConnectivityCheck: 'pass',
  databaseRestoreValidation: 'pass',
  sourceBackup: { predatesRestoredProject: true },
  matchedRelationCount: 5,
  matchedIdentityRowCount: 671,
  productionLedgerCount: 433,
  restoredProductionLedgerCount: 433,
  approvedBy: 'test approver',
  productionMutated: false,
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
assert.match(approvedStagingReadinessWithoutProductionTarget.stderr, /--recovery-evidence is required/)

const phaseEvidenceCompatibility = run([
  '--apply-sql', '--version', '202607170026', '--staging-evidence', phaseEvidencePath,
  '--staging-readiness', 'docs/supabase-phase-7-staging-readiness.json',
  '--confirm', 'APPLY_TO_PRODUCTION',
])
assert.equal(phaseEvidenceCompatibility.status, 1)
assert.match(phaseEvidenceCompatibility.stderr, /--recovery-evidence is required/)

writeFileSync(stagingReadinessPath, JSON.stringify({
  status: 'READY_FOR_PRODUCTION_PROMOTION',
  productionProjectRef: 'isdowlnollckzvltkasn',
  stagingProjectRef: 'stagingtestref',
  manifestRowCount: 71,
  stagingLedgerRecordedCount: 71,
  stagingEvidenceComplete: true,
  attorneyIntegrityGate: 'pass',
  attorneyIntegrityBlockingAssignments: 0,
  approvedBy: 'test approver',
}))

const wrongProject = run(
  [
    '--apply-sql', '--version', '202607170026', '--staging-evidence', stagingEvidencePath,
    '--staging-readiness', stagingReadinessPath,
    '--recovery-evidence', recoveryEvidencePath,
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
    '--recovery-evidence', recoveryEvidencePath,
    '--confirm', 'APPLY_TO_PRODUCTION',
  ],
  {
    SUPABASE_PRODUCTION_PROJECT_REF: 'isdowlnollckzvltkasn',
    SUPABASE_PRODUCTION_ACCESS_MODE: 'linked_ephemeral',
  },
)
assert.equal(missingRecovery.status, 1)
assert.match(missingRecovery.stderr, /only after recovery has been tested/)

const missingAccessMode = run(
  [
    '--apply-sql', '--version', '202607170026', '--staging-evidence', stagingEvidencePath,
    '--staging-readiness', stagingReadinessPath,
    '--recovery-evidence', recoveryEvidencePath,
    '--confirm', 'APPLY_TO_PRODUCTION',
  ],
  {
    SUPABASE_PRODUCTION_PROJECT_REF: 'isdowlnollckzvltkasn',
  },
)
assert.equal(missingAccessMode.status, 1)
assert.match(missingAccessMode.stderr, /SUPABASE_PRODUCTION_ACCESS_MODE must equal linked_ephemeral/)

rmSync(tempDir, { recursive: true })

console.log('Supabase Phase 7 production execution tests passed.')
