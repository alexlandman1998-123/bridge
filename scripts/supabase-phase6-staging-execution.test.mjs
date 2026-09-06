#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-phase6-staging-execution.mjs')
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'supabase-phase-5-application-manifest.json'), 'utf8'))

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
assert.ok(JSON.parse(plan.stdout).count > 0)
assert.ok(JSON.parse(plan.stdout).count <= manifest.rows.length)

const streamPlan = run(['--plan', '--stream', 'bond_finance_runtime', '--json'])
assert.equal(streamPlan.status, 0, streamPlan.stderr)
const streamResult = JSON.parse(streamPlan.stdout)
assert.ok(streamResult.count > 0)
assert.ok(streamResult.rows.every((row) => row.stream === 'bond_finance_runtime'))

const testApplyVersion = '20260905102430'

const missingConfirmation = run(['--apply-sql', '--version', testApplyVersion])
assert.equal(missingConfirmation.status, 1)
assert.match(missingConfirmation.stderr, /staging mutations require/i)

const missingTarget = run(['--apply-sql', '--version', testApplyVersion, '--confirm', 'APPLY_TO_STAGING_ONLY'])
assert.equal(missingTarget.status, 1)
assert.match(missingTarget.stderr, /SUPABASE_STAGING_PROJECT_REF is required/)

const productionTarget = run(
  ['--apply-sql', '--version', testApplyVersion, '--confirm', 'APPLY_TO_STAGING_ONLY'],
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

const malformedProjectRef = run(
  ['--apply-sql', '--version', testApplyVersion, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_PROJECT_REF: 'staging.test',
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.staging.test.supabase.co:5432/postgres?sslmode=require',
  },
)
assert.equal(malformedProjectRef.status, 1)
assert.match(malformedProjectRef.stderr, /lowercase Supabase project reference/i)

const spoofedProductionHost = run(
  ['--apply-sql', '--version', testApplyVersion, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://stagingtestref@db.isdowlnollckzvltkasn.supabase.co:5432/postgres?application_name=stagingtestref&sslmode=require',
  },
)
assert.equal(spoofedProductionHost.status, 1)
assert.match(spoofedProductionHost.stderr, /must use db\.stagingtestref\.supabase\.co or a Supabase pooler host/i)

const mismatchedPoolerTarget = run(
  ['--apply-sql', '--version', testApplyVersion, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres.otherref@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require',
  },
)
assert.equal(mismatchedPoolerTarget.status, 1)
assert.match(mismatchedPoolerTarget.stderr, /pooler username project ref must match/i)

const insecureTransport = run(
  ['--apply-sql', '--version', testApplyVersion, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=disable',
  },
)
assert.equal(insecureTransport.status, 1)
assert.match(insecureTransport.stderr, /sslmode=require/i)

const queryOverride = run(
  ['--apply-sql', '--version', testApplyVersion, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=require&host=db.isdowlnollckzvltkasn.supabase.co',
  },
)
assert.equal(queryOverride.status, 1)
assert.match(queryOverride.stderr, /only one sslmode query parameter/i)

const duplicateSslMode = run(
  ['--apply-sql', '--version', testApplyVersion, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=require&sslmode=disable',
  },
)
assert.equal(duplicateSslMode.status, 1)
assert.match(duplicateSslMode.stderr, /only one sslmode query parameter/i)

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'phase6-staging-gate-'))
const repairSqlAppliedPath = path.join(tempDir, 'repair-sql-applied.json')
writeFileSync(repairSqlAppliedPath, JSON.stringify({
  version: '20260903094957',
  targetProjectRef: 'stagingtestref',
  sqlApplied: true,
  catalogChecks: 'pass',
  behaviorChecks: 'pass',
  rollbackOrNoResidue: 'pass',
  reviewedBy: 'test reviewer',
}))
const repairSqlApplied = run(
  ['--record-applied', '--version', '20260903094957', '--evidence', repairSqlAppliedPath, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(repairSqlApplied.status, 1)
assert.match(repairSqlApplied.stderr, /Evidence sqlApplied must equal false/)

const repairFalseSqlPath = path.join(tempDir, 'repair-false-sql.json')
writeFileSync(repairFalseSqlPath, JSON.stringify({
  version: '20260903094957',
  targetProjectRef: 'stagingtestref',
  sqlApplied: false,
  catalogChecks: 'fail',
  behaviorChecks: 'pass',
  rollbackOrNoResidue: 'pass',
  reviewedBy: 'test reviewer',
}))
const repairFalseSql = run(
  ['--record-applied', '--version', '20260903094957', '--evidence', repairFalseSqlPath, '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(repairFalseSql.status, 1)
assert.match(repairFalseSql.stderr, /Evidence catalogChecks must equal "pass"/)
rmSync(tempDir, { recursive: true })

console.log('Supabase Phase 6 staging execution tests passed.')
