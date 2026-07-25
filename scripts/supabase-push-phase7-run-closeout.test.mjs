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
const runner = path.join(repoRoot, 'scripts', 'supabase-push-phase7-run-closeout.mjs')
const productionProjectRef = 'isdowlnollckzvltkasn'

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'supabase-push-phase7-'))

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(path.join(tempDir, 'docs'), { recursive: true })
  writeFileSync(path.join(tempDir, 'supabase', 'migrations', '202607990001_apply.sql'), '-- test\n')
  writeFileSync(path.join(tempDir, 'supabase', 'migrations', '202607990002_repair.sql'), '-- test\n')
  writeFileSync(path.join(tempDir, 'docs', 'supabase-phase-5-application-manifest.json'), JSON.stringify({
    linkedProjectRef: productionProjectRef,
    rows: [
      {
        version: '202607990001',
        stream: 'legal_document_runtime',
        file: '202607990001_apply.sql',
        action: 'apply_original_after_dependency_check',
        objectStatus: 'none_live',
      },
      {
        version: '202607990002',
        stream: 'attorney_workflow_runtime',
        file: '202607990002_repair.sql',
        action: 'repair_only_after_smoke',
        objectStatus: 'all_live',
      },
    ],
  }, null, 2))
  writeFileSync(path.join(tempDir, 'docs', 'supabase-push-phase-5-production-promotion.json'), JSON.stringify({
    rows: [
      {
        version: '202607990001',
        stream: 'legal_document_runtime',
        file: '202607990001_apply.sql',
        productionRoute: 'production_apply_sql',
        readyForProduction: true,
      },
      {
        version: '202607990002',
        stream: 'attorney_workflow_runtime',
        file: '202607990002_repair.sql',
        productionRoute: 'production_no_sql_record_after_smoke',
        readyForProduction: true,
      },
    ],
  }, null, 2))

  const result = spawnSync(process.execPath, [runner, '--local-only', '--json'], {
    cwd: tempDir,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'CLOSEOUT_BLOCKED')
  assert.equal(report.phase6EvidenceSync.ok, true)
  assert.equal(report.localCloseout.decision, 'LOCAL_CLOSEOUT_NOT_READY')
  assert.equal(report.liveCloseout.attempted, false)
  assert.equal(report.localCloseout.counts.manifestRows, 2)
  assert.equal(report.localCloseout.counts.completeEvidenceRows, 0)
  assert.equal(report.localCloseout.counts.incompleteEvidenceRows, 2)

  const writtenReport = readJson(path.join(tempDir, 'docs', 'supabase-push-phase-7-closeout.json'))
  assert.equal(writtenReport.status, 'CLOSEOUT_BLOCKED')
  assert.equal(readJson(path.join(tempDir, 'docs', 'supabase-phase-8-closeout-evidence.json')).rows.length, 0)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase push phase 7 closeout tests passed.')
