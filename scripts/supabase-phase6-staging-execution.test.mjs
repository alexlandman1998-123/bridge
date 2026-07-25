#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-phase6-staging-execution.mjs')

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_STAGING_PROJECT_REF: '',
      SUPABASE_STAGING_DB_URL: '',
      SUPABASE_STAGING_RECOVERY_CONFIRMED: '',
      ...extraEnv,
    },
  })
}

const plan = run(['--plan', '--json'])
assert.equal(plan.status, 0, plan.stderr)
assert.equal(JSON.parse(plan.stdout).count, 21)

const streamPlan = run(['--plan', '--stream', 'legal_document_runtime', '--json'])
assert.equal(streamPlan.status, 0, streamPlan.stderr)
assert.equal(JSON.parse(streamPlan.stdout).count, 15)

const missingConfirmation = run(['--apply-sql', '--version', '202607240001'])
assert.equal(missingConfirmation.status, 1)
assert.match(missingConfirmation.stderr, /staging mutations require/i)

const missingTarget = run(['--apply-sql', '--version', '202607240001', '--confirm', 'APPLY_TO_STAGING_ONLY'])
assert.equal(missingTarget.status, 1)
assert.match(missingTarget.stderr, /SUPABASE_STAGING_PROJECT_REF is required/)

const productionTarget = run(
  ['--apply-sql', '--version', '202607240001', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    SUPABASE_STAGING_PROJECT_REF: 'isdowlnollckzvltkasn',
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.isdowlnollckzvltkasn.supabase.co:5432/postgres?sslmode=require',
    SUPABASE_STAGING_RECOVERY_CONFIRMED: 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
  },
)
assert.equal(productionTarget.status, 1)
assert.match(productionTarget.stderr, /Refusing to target the production/)

const fakeStagingEnv = {
  SUPABASE_STAGING_PROJECT_REF: 'stagingtestref',
  SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=require',
  SUPABASE_STAGING_RECOVERY_CONFIRMED: 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
}

const phase1ReceiptRequired = run(
  ['--apply-sql', '--version', '202607220002', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(phase1ReceiptRequired.status, 1)
assert.match(phase1ReceiptRequired.stderr, /Phase 1 legal migrations require both --phase1-receipt and --phase1-receipt-digest/i)

const partialPhase1ReceiptBinding = run(
  ['--apply-sql', '--version', '202607220002', '--phase1-receipt', 'the-it-guy/config/legal-document-rollout-phase1-staging.json', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(partialPhase1ReceiptBinding.status, 1)
assert.match(partialPhase1ReceiptBinding.stderr, /require both --phase1-receipt and --phase1-receipt-digest/i)

const malformedProjectRef = run(
  ['--apply-sql', '--version', '202607240001', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_PROJECT_REF: 'staging.test',
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.staging.test.supabase.co:5432/postgres?sslmode=require',
  },
)
assert.equal(malformedProjectRef.status, 1)
assert.match(malformedProjectRef.stderr, /lowercase Supabase project reference/i)

const spoofedProductionHost = run(
  ['--apply-sql', '--version', '202607240001', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://stagingtestref@db.isdowlnollckzvltkasn.supabase.co:5432/postgres?application_name=stagingtestref&sslmode=require',
  },
)
assert.equal(spoofedProductionHost.status, 1)
assert.match(spoofedProductionHost.stderr, /must use db\.stagingtestref\.supabase\.co or a Supabase pooler host/i)

const mismatchedPoolerTarget = run(
  ['--apply-sql', '--version', '202607240001', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres.otherref@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require',
  },
)
assert.equal(mismatchedPoolerTarget.status, 1)
assert.match(mismatchedPoolerTarget.stderr, /pooler username project ref must match/i)

const insecureTransport = run(
  ['--apply-sql', '--version', '202607240001', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=disable',
  },
)
assert.equal(insecureTransport.status, 1)
assert.match(insecureTransport.stderr, /sslmode=require/i)

const queryOverride = run(
  ['--apply-sql', '--version', '202607240001', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=require&host=db.isdowlnollckzvltkasn.supabase.co',
  },
)
assert.equal(queryOverride.status, 1)
assert.match(queryOverride.stderr, /only one sslmode query parameter/i)

const duplicateSslMode = run(
  ['--apply-sql', '--version', '202607240001', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=require&sslmode=disable',
  },
)
assert.equal(duplicateSslMode.status, 1)
assert.match(duplicateSslMode.stderr, /only one sslmode query parameter/i)

const approvedCorrectivePlan = run(['--plan', '--version', '202607250005', '--json'])
assert.equal(approvedCorrectivePlan.status, 0, approvedCorrectivePlan.stderr)
const approvedCorrectiveRows = JSON.parse(approvedCorrectivePlan.stdout).rows
assert.equal(approvedCorrectiveRows.length, 1)
assert.equal(approvedCorrectiveRows[0].originalVersion, '202607230001')
assert.equal(approvedCorrectiveRows[0].action, 'apply_original_after_dependency_check')
assert.equal(approvedCorrectiveRows[0].file, '202607250005_corrective_seller_document_transaction_continuity.sql')

const approvedManualPlan = run(['--plan', '--version', '202607250006', '--json'])
assert.equal(approvedManualPlan.status, 0, approvedManualPlan.stderr)
const approvedManualRows = JSON.parse(approvedManualPlan.stdout).rows
assert.equal(approvedManualRows.length, 1)
assert.equal(approvedManualRows[0].originalAction, 'manual_data_review')
assert.equal(approvedManualRows[0].action, 'apply_original_after_dependency_check')
assert.equal(approvedManualRows[0].file, '202607250006_corrective_global_mandate_platform_default_revision.sql')

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'phase6-staging-gate-'))
const repairSqlAppliedPath = path.join(tempDir, 'repair-sql-applied.json')
writeFileSync(repairSqlAppliedPath, JSON.stringify({
  version: '202607230013',
  targetProjectRef: 'stagingtestref',
  sqlApplied: true,
  catalogChecks: 'pass',
  behaviorChecks: 'pass',
  rollbackOrNoResidue: 'pass',
  reviewedBy: 'test reviewer',
}))
const repairSqlApplied = run(
  ['--record-applied', '--version', '202607230013', '--evidence', repairSqlAppliedPath, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(repairSqlApplied.status, 1)
assert.match(repairSqlApplied.stderr, /Evidence sqlApplied must equal false/)

const repairFalseSqlPath = path.join(tempDir, 'repair-false-sql.json')
writeFileSync(repairFalseSqlPath, JSON.stringify({
  version: '202607230013',
  targetProjectRef: 'stagingtestref',
  sqlApplied: false,
  catalogChecks: 'fail',
  behaviorChecks: 'pass',
  rollbackOrNoResidue: 'pass',
  reviewedBy: 'test reviewer',
}))
const repairFalseSql = run(
  ['--record-applied', '--version', '202607230013', '--evidence', repairFalseSqlPath, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(repairFalseSql.status, 1)
assert.match(repairFalseSql.stderr, /Evidence catalogChecks must equal "pass"/)
rmSync(tempDir, { recursive: true })

console.log('Supabase Phase 6 staging execution tests passed.')
