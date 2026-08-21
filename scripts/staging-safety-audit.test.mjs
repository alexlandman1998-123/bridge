#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'staging-safety-audit.mjs')
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'staging-safety-audit-'))

function run(stagingEnv, previewEnv) {
  return spawnSync(process.execPath, [
    runner,
    '--staging-env-file',
    stagingEnv,
    '--preview-env-file',
    previewEnv,
    '--json',
  ], {
    cwd: tempDir,
    encoding: 'utf8',
  })
}

function writeEnv(file, lines) {
  writeFileSync(path.join(tempDir, file), `${lines.join('\n')}\n`)
}

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })

  writeEnv('staging.env', [
    'SUPABASE_STAGING_PROJECT_REF=stagingtestref',
    'SUPABASE_STAGING_DB_URL=postgresql://postgres.stagingtestref:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    'SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    'VITE_SUPABASE_URL=https://stagingtestref.supabase.co',
  ])
  writeEnv('preview.env', [
    'VERCEL_ENV=preview',
    'VERCEL_TARGET_ENV=preview',
    'VITE_SUPABASE_URL=https://stagingtestref.supabase.co',
  ])

  const ready = run('staging.env', 'preview.env')
  assert.equal(ready.status, 0, ready.stderr)
  assert.equal(JSON.parse(ready.stdout).status, 'READY')

  writeEnv('preview-prod.env', [
    'VERCEL_ENV=preview',
    'VERCEL_TARGET_ENV=preview',
    'VITE_SUPABASE_URL=https://isdowlnollckzvltkasn.supabase.co',
  ])
  const previewProd = run('staging.env', 'preview-prod.env')
  assert.equal(previewProd.status, 1)
  assert.equal(JSON.parse(previewProd.stdout).issues.some((issue) => issue.code === 'preview_points_at_production_supabase'), true)

  writeEnv('staging-prod.env', [
    'SUPABASE_STAGING_PROJECT_REF=isdowlnollckzvltkasn',
    'SUPABASE_STAGING_DB_URL=postgresql://postgres:secret@db.isdowlnollckzvltkasn.supabase.co:5432/postgres',
    'SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    'VITE_SUPABASE_URL=https://isdowlnollckzvltkasn.supabase.co',
  ])
  const stagingProd = run('staging-prod.env', 'preview.env')
  assert.equal(stagingProd.status, 1)
  assert.equal(JSON.parse(stagingProd.stdout).issues.some((issue) => issue.code === 'staging_project_is_production'), true)

  writeEnv('staging-rentals.env', [
    'SUPABASE_STAGING_PROJECT_REF=stagingtestref',
    'SUPABASE_STAGING_DB_URL=postgresql://postgres.stagingtestref:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    'SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    'VITE_SUPABASE_URL=https://stagingtestref.supabase.co',
    'VITE_RENTALS_ENABLED=true',
  ])
  const rentalsEnabled = run('staging-rentals.env', 'preview.env')
  assert.equal(rentalsEnabled.status, 1)
  assert.equal(JSON.parse(rentalsEnabled.stdout).issues.some((issue) => issue.code === 'rentals_flag_enabled_before_staging_readiness'), true)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Staging safety audit tests passed.')
