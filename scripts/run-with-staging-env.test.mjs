#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'run-with-staging-env.mjs')
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'staging-env-wrapper-'))

function run(args) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: tempDir,
    encoding: 'utf8',
  })
}

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })
  writeFileSync(path.join(tempDir, 'staging.env'), [
    'SUPABASE_STAGING_PROJECT_REF=stagingtestref',
    'SUPABASE_STAGING_DB_URL=postgresql://postgres.stagingtestref:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    'SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    '',
  ].join('\n'))

  const printed = run(['--env-file', 'staging.env', '--print-env'])
  assert.equal(printed.status, 0, printed.stderr)
  const shape = JSON.parse(printed.stdout)
  assert.equal(shape.stagingDbUrlShape, 'postgresql://aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode')
  assert.equal(shape.recoveryConfirmed, true)

  const command = run([
    '--env-file', 'staging.env',
    '--',
    process.execPath,
    '-e',
    'const u=new URL(process.env.SUPABASE_STAGING_DB_URL); console.log(`${process.env.SUPABASE_STAGING_PROJECT_REF}|${u.username}|${u.hostname}|${u.searchParams.get("sslmode")}`)',
  ])
  assert.equal(command.status, 0, command.stderr)
  assert.equal(command.stdout.trim(), 'stagingtestref|postgres.stagingtestref|aws-0-eu-west-1.pooler.supabase.com|require')

  writeFileSync(path.join(tempDir, 'wrong-pooler.env'), [
    'SUPABASE_STAGING_PROJECT_REF=stagingtestref',
    'SUPABASE_STAGING_DB_URL=postgresql://postgres.otherref:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    'SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    '',
  ].join('\n'))
  const wrongPooler = run(['--env-file', 'wrong-pooler.env', '--print-env'])
  assert.equal(wrongPooler.status, 1)
  assert.match(wrongPooler.stderr, /Pooler username project ref/i)

  writeFileSync(path.join(tempDir, 'production.env'), [
    'SUPABASE_STAGING_PROJECT_REF=isdowlnollckzvltkasn',
    'SUPABASE_STAGING_DB_URL=postgresql://postgres:secret@db.isdowlnollckzvltkasn.supabase.co:5432/postgres?sslmode=require',
    'SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    '',
  ].join('\n'))
  const production = run(['--env-file', 'production.env', '--print-env'])
  assert.equal(production.status, 1)
  assert.match(production.stderr, /production project ref/i)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Staging env wrapper tests passed.')
