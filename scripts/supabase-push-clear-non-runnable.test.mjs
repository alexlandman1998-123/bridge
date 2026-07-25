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
const runner = path.join(repoRoot, 'scripts', 'supabase-push-clear-non-runnable.mjs')

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'supabase-clear-non-runnable-'))

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(path.join(tempDir, 'docs'), { recursive: true })
  writeFileSync(path.join(tempDir, 'supabase', 'migrations', '202607990001_corrective.sql'), `
begin;
create or replace function public.test_corrective_fn()
returns integer language sql as $$ select 1 $$;
create trigger trg_test_corrective after insert on public.test_table
for each row execute function public.test_corrective_fn();
commit;
`)
  writeFileSync(path.join(tempDir, 'supabase', 'migrations', '202607990002_manual.sql'), 'begin; select 1; commit;')
  writeFileSync(path.join(tempDir, 'supabase', 'migrations', '202607990003_corrective_reviewed.sql'), 'begin; select 1; commit;')
  writeFileSync(path.join(tempDir, 'docs', 'supabase-phase-5-application-manifest.json'), JSON.stringify({
    linkedProjectRef: 'isdowlnollckzvltkasn',
    rows: [
      {
        version: '202607990001',
        stream: 'legal_document_runtime',
        dependsOn: 'stream preflight',
        module: 'test',
        file: '202607990001_corrective.sql',
        objectStatus: 'partial_live',
        liveCount: 1,
        objectCount: 2,
        action: 'corrective_migration_required',
        gate: 'test',
      },
      {
        version: '202607990002',
        stream: 'legal_document_runtime',
        dependsOn: '202607990001',
        module: 'test',
        file: '202607990002_manual.sql',
        objectStatus: 'no_static_objects',
        liveCount: 0,
        objectCount: 0,
        action: 'manual_data_review',
        gate: 'test',
      },
    ],
  }, null, 2))

  const result = spawnSync(process.execPath, [runner, '--local-only', '--json'], {
    cwd: tempDir,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.rows.length, 2)
  assert.equal(report.correctiveCount, 1)
  assert.equal(report.manualCount, 1)
  assert.equal(report.correctivePendingCount, 1)
  assert.equal(report.runnableDecisionCount, 0)

  const corrective = readJson(path.join(tempDir, 'docs', 'non-runnable-clearance', '202607990001-legal_document_runtime.json'))
  assert.equal(corrective.clearanceDecision, 'pending_corrective_migration')
  assert.ok(corrective.blockers.includes('corrective_migration_not_written'))
  assert.ok(readFileSync(path.join(tempDir, 'docs', 'corrective-migration-packets', '202607990001-legal_document_runtime.md'), 'utf8').includes('Do not record the historical partially-live version'))

  corrective.correctiveMigrationFile = 'supabase/migrations/202607990003_corrective_reviewed.sql'
  corrective.definitionDiffReviewedBy = 'reviewer'
  corrective.correctiveMigrationReviewedBy = 'reviewer'
  corrective.approvedBy = 'approver'
  corrective.approvedAt = '2026-07-25T00:00:00.000Z'
  writeFileSync(
    path.join(tempDir, 'docs', 'non-runnable-clearance', '202607990001-legal_document_runtime.json'),
    `${JSON.stringify(corrective, null, 2)}\n`,
  )
  const reviewedResult = spawnSync(process.execPath, [runner, '--local-only', '--json'], {
    cwd: tempDir,
    encoding: 'utf8',
  })
  assert.equal(reviewedResult.status, 0, reviewedResult.stderr)
  const reviewedReport = JSON.parse(reviewedResult.stdout)
  assert.equal(reviewedReport.correctivePendingCount, 0)
  assert.equal(reviewedReport.runnableDecisionCount, 1)
  assert.equal(reviewedReport.runnerReadyCount, 1)
  const reviewedCorrective = readJson(path.join(tempDir, 'docs', 'non-runnable-clearance', '202607990001-legal_document_runtime.json'))
  assert.equal(reviewedCorrective.clearanceDecision, 'apply_corrective_after_dependency_check')
  assert.equal(reviewedCorrective.correctiveVersion, '202607990003')
  assert.deepEqual(reviewedCorrective.blockers, [])

  const manual = readJson(path.join(tempDir, 'docs', 'non-runnable-clearance', '202607990002-legal_document_runtime.json'))
  assert.equal(manual.clearanceDecision, 'manual_review_required')
  assert.ok(manual.blockers.includes('live_data_not_checked'))
  assert.ok(readFileSync(path.join(tempDir, 'docs', 'manual-review', '202607990002-legal_document_runtime.md'), 'utf8').includes('global native mandate'))
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase clear non-runnable tests passed.')
