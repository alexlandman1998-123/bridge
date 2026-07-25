#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-configure-staging.mjs')
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'supabase-configure-staging-'))

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function run(args) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: tempDir,
    encoding: 'utf8',
  })
}

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(path.join(tempDir, 'docs', 'staging-evidence'), { recursive: true })
  mkdirSync(path.join(tempDir, 'the-it-guy', 'config'), { recursive: true })
  writeFileSync(path.join(tempDir, 'staging.env'), [
    'SUPABASE_STAGING_PROJECT_REF=stagingtestref',
    'SUPABASE_STAGING_DB_URL=postgresql://postgres.stagingtestref:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    'SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    '',
  ].join('\n'))
  writeFileSync(path.join(tempDir, 'docs', 'supabase-push-phase-3-action-routing.json'), JSON.stringify({
    rows: [
      {
        version: '202607990001',
        stream: 'legal_document_runtime',
        blocked: false,
        evidenceFile: 'docs/staging-evidence/202607990001-legal_document_runtime.json',
      },
      {
        version: '202607990002',
        stream: 'legal_document_runtime',
        blocked: true,
        evidenceFile: 'docs/staging-evidence/202607990002-legal_document_runtime.json',
      },
    ],
  }, null, 2))
  writeFileSync(path.join(tempDir, 'docs', 'staging-evidence', '202607990001-legal_document_runtime.json'), JSON.stringify({
    version: '202607990001',
    targetProjectRef: 'TODO_STAGING_PROJECT_REF',
    stagingProjectRef: 'TODO_STAGING_PROJECT_REF',
    sqlApplied: false,
  }, null, 2))
  writeFileSync(path.join(tempDir, 'the-it-guy', 'config', 'legal-document-rollout-phase1-staging.json'), JSON.stringify({
    phase: 'ROLL_OUT_1',
    contract: 'legal-document-staging-release-v2',
    status: 'pending_staging',
    environment: {
      productionProjectRef: null,
      stagingProjectRef: null,
      stagingOrigin: null,
    },
    artifacts: { migrations: [] },
    manifestDigest: null,
  }, null, 2))

  const result = run(['--env-file', 'staging.env', '--write', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'STAGING_CONFIGURED')
  assert.equal(report.configuredCount, 1)
  assert.equal(report.phase1ReceiptEnvironment.status, 'configured')
  assert.equal(report.rows.length, 1)
  const evidence = readJson(path.join(tempDir, 'docs', 'staging-evidence', '202607990001-legal_document_runtime.json'))
  assert.equal(evidence.targetProjectRef, 'stagingtestref')
  assert.equal(evidence.stagingProjectRef, 'stagingtestref')
  assert.equal(evidence.sqlApplied, false)
  const receipt = readJson(path.join(tempDir, 'the-it-guy', 'config', 'legal-document-rollout-phase1-staging.json'))
  assert.equal(receipt.environment.productionProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(receipt.environment.stagingProjectRef, 'stagingtestref')
  assert.equal(receipt.environment.stagingOrigin, 'https://stagingtestref.supabase.co')

  const secondRun = run(['--env-file', 'staging.env', '--write', '--json'])
  assert.equal(secondRun.status, 0, secondRun.stderr)
  assert.equal(JSON.parse(secondRun.stdout).alreadyConfiguredCount, 1)
  assert.equal(JSON.parse(secondRun.stdout).phase1ReceiptEnvironment.status, 'already_configured')

  writeFileSync(path.join(tempDir, 'production.env'), [
    'SUPABASE_STAGING_PROJECT_REF=isdowlnollckzvltkasn',
    'SUPABASE_STAGING_DB_URL=postgresql://postgres:secret@db.isdowlnollckzvltkasn.supabase.co:5432/postgres?sslmode=require',
    'SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    '',
  ].join('\n'))
  const production = run(['--env-file', 'production.env', '--write'])
  assert.equal(production.status, 1)
  assert.match(production.stderr, /production project/i)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase staging configuration tests passed.')
