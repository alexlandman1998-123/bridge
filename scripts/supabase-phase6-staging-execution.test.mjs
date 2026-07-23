#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
assert.equal(JSON.parse(plan.stdout).count, 63)

const streamPlan = run(['--plan', '--stream', 'settings_governance', '--json'])
assert.equal(streamPlan.status, 0, streamPlan.stderr)
assert.equal(JSON.parse(streamPlan.stdout).count, 3)

const missingConfirmation = run(['--apply-sql', '--version', '202607170026'])
assert.equal(missingConfirmation.status, 1)
assert.match(missingConfirmation.stderr, /staging mutations require/i)

const missingTarget = run(['--apply-sql', '--version', '202607170026', '--confirm', 'APPLY_TO_STAGING_ONLY'])
assert.equal(missingTarget.status, 1)
assert.match(missingTarget.stderr, /SUPABASE_STAGING_PROJECT_REF is required/)

const productionTarget = run(
  ['--apply-sql', '--version', '202607170026', '--confirm', 'APPLY_TO_STAGING_ONLY'],
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
  ['--apply-sql', '--version', '202607180027', '--phase1-receipt', 'the-it-guy/config/legal-document-rollout-phase1-staging.json', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(partialPhase1ReceiptBinding.status, 1)
assert.match(partialPhase1ReceiptBinding.stderr, /require both --phase1-receipt and --phase1-receipt-digest/i)

const malformedProjectRef = run(
  ['--apply-sql', '--version', '202607180027', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_PROJECT_REF: 'staging.test',
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.staging.test.supabase.co:5432/postgres?sslmode=require',
  },
)
assert.equal(malformedProjectRef.status, 1)
assert.match(malformedProjectRef.stderr, /lowercase Supabase project reference/i)

const spoofedProductionHost = run(
  ['--apply-sql', '--version', '202607180027', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://stagingtestref@db.isdowlnollckzvltkasn.supabase.co:5432/postgres?application_name=stagingtestref&sslmode=require',
  },
)
assert.equal(spoofedProductionHost.status, 1)
assert.match(spoofedProductionHost.stderr, /host must be exactly db\.stagingtestref\.supabase\.co/i)

const poolerTarget = run(
  ['--apply-sql', '--version', '202607180027', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres.stagingtestref@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require',
  },
)
assert.equal(poolerTarget.status, 1)
assert.match(poolerTarget.stderr, /host must be exactly db\.stagingtestref\.supabase\.co/i)

const insecureTransport = run(
  ['--apply-sql', '--version', '202607180027', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=disable',
  },
)
assert.equal(insecureTransport.status, 1)
assert.match(insecureTransport.stderr, /sslmode=require/i)

const queryOverride = run(
  ['--apply-sql', '--version', '202607180027', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=require&host=db.isdowlnollckzvltkasn.supabase.co',
  },
)
assert.equal(queryOverride.status, 1)
assert.match(queryOverride.stderr, /only one sslmode query parameter/i)

const duplicateSslMode = run(
  ['--apply-sql', '--version', '202607180027', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  {
    ...fakeStagingEnv,
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.stagingtestref.supabase.co:5432/postgres?sslmode=require&sslmode=disable',
  },
)
assert.equal(duplicateSslMode.status, 1)
assert.match(duplicateSslMode.stderr, /only one sslmode query parameter/i)

const correctiveReplay = run(
  ['--apply-sql', '--version', '202607180027', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(correctiveReplay.status, 1)
assert.match(correctiveReplay.stderr, /Refusing SQL replay for manifest action corrective_migration_required/)

const manualReplay = run(
  ['--apply-sql', '--version', '202607180004', '--confirm', 'APPLY_TO_STAGING_ONLY'],
  fakeStagingEnv,
)
assert.equal(manualReplay.status, 1)
assert.match(manualReplay.stderr, /Refusing SQL replay for manifest action manual_data_review/)

console.log('Supabase Phase 6 staging execution tests passed.')
