#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
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
const runner = path.join(repoRoot, 'scripts', 'supabase-resolve-ledger-drift.mjs')

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'supabase-resolve-ledger-drift-'))

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(path.join(tempDir, 'docs'), { recursive: true })
  mkdirSync(path.join(tempDir, 'docs', 'non-runnable-clearance'), { recursive: true })
  writeFileSync(path.join(tempDir, 'docs', 'live-closeout.json'), JSON.stringify({
    live: {
      ledger: {
        pureLocalOnly: [{ local: '202607990001' }, { local: '202607990002' }, { local: '202607990003' }],
        pureRemoteOnly: [{ remote: '202607980001' }],
        divergent: [{ local: '202607970001', remote: '202607970002' }],
        unreviewedSplitVersions: ['202607960001', '202607960002'],
      },
    },
  }, null, 2))
  writeFileSync(path.join(tempDir, 'docs', 'split-investigation.json'), JSON.stringify({
    splitRows: [
      {
        version: '202607960001',
        module: 'legal_document_runtime',
        objectStatus: 'all_live',
        remoteNameStatus: 'remote_name_matches',
        decision: 'confirmed_live_split',
      },
      {
        version: '202607960002',
        module: 'legal_document_runtime',
        objectStatus: 'partial_live',
        remoteNameStatus: 'remote_name_matches',
        decision: 'object_review_required',
      },
    ],
  }, null, 2))
  writeFileSync(path.join(tempDir, 'docs', 'supabase-push-phase-5-production-promotion.json'), JSON.stringify({
    rows: [
      {
        version: '202607990001',
        stream: 'legal_document_runtime',
        file: '202607990001_ready.sql',
        readyForProduction: true,
        blockers: [],
      },
      {
        version: '202607990002',
        stream: 'legal_document_runtime',
        file: '202607990002_blocked.sql',
        readyForProduction: false,
        blockers: ['staging_evidence_pending'],
      },
      {
        version: '202607990004',
        stream: 'legal_document_runtime',
        file: '202607990004_corrective.sql',
        readyForProduction: false,
        blockers: ['staging_evidence_pending'],
      },
    ],
  }, null, 2))
  writeFileSync(path.join(tempDir, 'docs', 'non-runnable-clearance', '202607990003-legal_document_runtime.json'), JSON.stringify({
    version: '202607990003',
    stream: 'legal_document_runtime',
    file: '202607990003_original.sql',
    clearanceDecision: 'apply_corrective_after_dependency_check',
    correctiveVersion: '202607990004',
    correctiveMigrationFile: 'supabase/migrations/202607990004_corrective.sql',
    approvedBy: 'release owner',
    approvedAt: '2026-07-25T00:00:00.000Z',
    blockers: [],
  }, null, 2))

  const result = spawnSync(process.execPath, [
    runner,
    '--live-closeout', 'docs/live-closeout.json',
    '--split-investigation', 'docs/split-investigation.json',
    '--json',
  ], { cwd: tempDir, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'LEDGER_DRIFT_BLOCKED')
  assert.deepEqual(report.reviewedSplitVersions, ['202607960001'])
  assert.deepEqual(report.unresolvedSplitVersions, ['202607960002'])
  assert.equal(report.counts.pureLocalOnly, 3)
  assert.equal(report.counts.pureRemoteOnly, 1)
  assert.equal(report.counts.divergent, 1)
  assert.equal(report.counts.reviewedSplitRows, 1)
  assert.equal(report.counts.unresolvedSplitRows, 1)

  const readyLocal = report.rows.pureLocalOnly.find((row) => row.version === '202607990001')
  const blockedLocal = report.rows.pureLocalOnly.find((row) => row.version === '202607990002')
  const supersededLocal = report.rows.pureLocalOnly.find((row) => row.version === '202607990003')
  assert.equal(readyLocal.resolution, 'ready_for_one_version_promotion')
  assert.ok(readyLocal.blockers.includes('production_promotion_execution_pending'))
  assert.equal(blockedLocal.resolution, 'promotion_blocked_by_phase5')
  assert.ok(blockedLocal.blockers.includes('phase5_staging_evidence_pending'))
  assert.equal(supersededLocal.resolution, 'superseded_by_corrective_promotion_plan')
  assert.equal(supersededLocal.resolved, true)
  assert.equal(supersededLocal.correctiveVersion, '202607990004')
  assert.ok(report.blockers.includes('202607980001:remote_history_without_local_migration_file'))
  assert.ok(report.blockers.includes('202607970001:divergent_local_remote_versions'))
  assert.ok(report.blockers.includes('202607960002:split_object_review_required'))
  assert.equal(existsSync(path.join(tempDir, 'docs', 'supabase-ledger-drift-resolution.json')), true)
  assert.equal(existsSync(path.join(tempDir, 'docs', 'supabase-ledger-drift-resolution-report.md')), true)

  const written = readJson(path.join(tempDir, 'docs', 'supabase-ledger-drift-resolution.json'))
  assert.equal(written.status, 'LEDGER_DRIFT_BLOCKED')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase ledger drift resolver tests passed.')
