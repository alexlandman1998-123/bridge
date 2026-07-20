#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
assert.equal(JSON.parse(plan.stdout).count, manifest.rows.length)

const conditionalMasterPlan = run(['--plan', '--stream', 'conditional_legal_masters', '--json'])
assert.equal(conditionalMasterPlan.status, 0, conditionalMasterPlan.stderr)
assert.deepEqual(JSON.parse(conditionalMasterPlan.stdout).rows.map((row) => row.version), ['202607200004', '202607200005', '202607200006'])

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
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres.isdowlnollckzvltkasn@example.invalid/postgres',
    SUPABASE_STAGING_RECOVERY_CONFIRMED: 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
  },
)
assert.equal(productionTarget.status, 1)
assert.match(productionTarget.stderr, /Refusing to target the production/)

const fakeStagingEnv = {
  SUPABASE_STAGING_PROJECT_REF: 'stagingtestref',
  SUPABASE_STAGING_DB_URL: 'postgresql://postgres.stagingtestref@example.invalid/postgres',
  SUPABASE_STAGING_RECOVERY_CONFIRMED: 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
}

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
