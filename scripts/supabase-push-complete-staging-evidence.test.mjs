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
const runner = path.join(repoRoot, 'scripts', 'supabase-push-complete-staging-evidence.mjs')

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function run(cwd, env = {}) {
  return spawnSync(process.execPath, [runner], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_STAGING_PROJECT_REF: '',
      SUPABASE_STAGING_DB_URL: '',
      SUPABASE_STAGING_RECOVERY_CONFIRMED: '',
      ...env,
    },
  })
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'supabase-complete-staging-evidence-'))

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(path.join(tempDir, 'docs', 'staging-evidence'), { recursive: true })
  mkdirSync(path.join(tempDir, 'the-it-guy', 'config'), { recursive: true })
  writeFileSync(path.join(tempDir, 'the-it-guy', 'config', 'legal-document-rollout-phase1-staging.json'), JSON.stringify({
    phase: 'ROLL_OUT_1',
    contract: 'legal-document-staging-release-v2',
    status: 'pending_staging',
    environment: {},
    artifacts: { migrations: [] },
    manifestDigest: null,
  }, null, 2))
  writeFileSync(path.join(tempDir, 'docs', 'supabase-push-phase-3-action-routing.json'), JSON.stringify({
    rows: [
      {
        version: '202607990001',
        stream: 'test_stream',
        route: 'apply_original',
        action: 'apply_original_after_dependency_check',
        file: '202607990001_test.sql',
        blocked: false,
        evidenceFile: 'docs/staging-evidence/202607990001-test_stream.json',
      },
      {
        version: '202607990002',
        stream: 'test_stream',
        route: 'repair_only',
        action: 'repair_only_after_smoke',
        file: '202607990002_test.sql',
        blocked: false,
        evidenceFile: 'docs/staging-evidence/202607990002-test_stream.json',
      },
    ],
  }, null, 2))

  const blocked = run(tempDir)
  assert.equal(blocked.status, 0, blocked.stderr)
  assert.match(blocked.stdout, /0\/2 complete/)
  const blockedReport = readJson(path.join(tempDir, 'docs', 'supabase-push-staging-evidence-completion.json'))
  assert.equal(blockedReport.completeCount, 0)
  assert.ok(blockedReport.rows[0].blockers.includes('staging_project_ref_env_missing'))

  const completeEvidence = {
    version: '202607990001',
    stream: 'test_stream',
    file: '202607990001_test.sql',
    route: 'apply_original',
    action: 'apply_original_after_dependency_check',
    targetProjectRef: 'stagingtestref',
    stagingProjectRef: 'stagingtestref',
    sqlApplied: true,
    stagingLedgerRecorded: true,
    catalogChecks: 'pass',
    behaviorChecks: 'pass',
    rollbackOrNoResidue: 'pass',
    reviewedBy: 'reviewer',
    approvedBy: 'approver',
    capturedAt: '2026-07-25T00:00:00.000Z',
  }
  writeFileSync(path.join(tempDir, 'docs', 'staging-evidence', '202607990001-test_stream.json'), JSON.stringify(completeEvidence, null, 2))
  writeFileSync(path.join(tempDir, 'docs', 'staging-evidence', '202607990002-test_stream.json'), JSON.stringify({
    ...completeEvidence,
    version: '202607990002',
    file: '202607990002_test.sql',
    route: 'repair_only',
    action: 'repair_only_after_smoke',
    sqlApplied: false,
  }, null, 2))

  const completeEvidenceBlockedByEnv = run(tempDir)
  assert.equal(completeEvidenceBlockedByEnv.status, 0, completeEvidenceBlockedByEnv.stderr)
  const envBlockedReport = readJson(path.join(tempDir, 'docs', 'supabase-push-staging-evidence-completion.json'))
  assert.equal(envBlockedReport.completeCount, 0)
  assert.equal(envBlockedReport.pendingCount, 2)
  assert.ok(envBlockedReport.rows[0].blockers.includes('staging_project_ref_env_missing'))

  const invalidDbUrl = run(tempDir, {
    SUPABASE_STAGING_PROJECT_REF: 'stagingtestref',
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres.otherref@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require',
    SUPABASE_STAGING_RECOVERY_CONFIRMED: 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
  })
  assert.equal(invalidDbUrl.status, 0, invalidDbUrl.stderr)
  const invalidDbUrlReport = readJson(path.join(tempDir, 'docs', 'supabase-push-staging-evidence-completion.json'))
  assert.equal(invalidDbUrlReport.completeCount, 0)
  assert.ok(invalidDbUrlReport.rows[0].blockers.includes('staging_db_url_pooler_username_ref_mismatch'))

  const ready = run(tempDir, {
    SUPABASE_STAGING_PROJECT_REF: 'stagingtestref',
    SUPABASE_STAGING_DB_URL: 'postgresql://postgres.stagingtestref@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require',
    SUPABASE_STAGING_RECOVERY_CONFIRMED: 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
  })
  assert.equal(ready.status, 0, ready.stderr)
  assert.match(ready.stdout, /2\/2 complete/)
  const readyReport = readJson(path.join(tempDir, 'docs', 'supabase-push-staging-evidence-completion.json'))
  assert.equal(readyReport.completeCount, 2)
  assert.equal(readyReport.pendingCount, 0)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase staging evidence completion tests passed.')
