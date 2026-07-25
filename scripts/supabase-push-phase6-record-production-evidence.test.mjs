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
const runner = path.join(repoRoot, 'scripts', 'supabase-push-phase6-record-production-evidence.mjs')
const productionProjectRef = 'isdowlnollckzvltkasn'

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function run(cwd) {
  return spawnSync(process.execPath, [runner], { cwd, encoding: 'utf8' })
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'supabase-push-phase6-'))

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(path.join(tempDir, 'docs'), { recursive: true })
  writeFileSync(path.join(tempDir, 'docs', 'supabase-push-phase-5-production-promotion.json'), JSON.stringify({
    rows: [
      {
        version: '202607990001',
        stream: 'legal_document_runtime',
        file: '202607990001_apply.sql',
        productionRoute: 'production_apply_sql',
        readyForProduction: true,
        blockers: [],
      },
      {
        version: '202607990002',
        stream: 'attorney_workflow_runtime',
        file: '202607990002_repair.sql',
        productionRoute: 'production_no_sql_record_after_smoke',
        readyForProduction: false,
        blockers: ['staging_evidence_pending'],
      },
      {
        version: '202607990003',
        stream: 'seller_transaction_continuity',
        file: '202607990003_blocked.sql',
        productionRoute: 'blocked_corrective_required',
        readyForProduction: false,
        blockers: ['upstream_corrective_required'],
      },
    ],
  }, null, 2))

  const pendingRun = run(tempDir)
  assert.equal(pendingRun.status, 0, pendingRun.stderr)
  const pendingReport = readJson(path.join(tempDir, 'docs', 'supabase-push-phase-6-production-evidence.json'))
  assert.equal(pendingReport.rows.length, 3)
  assert.equal(pendingReport.createdCount, 3)
  assert.equal(pendingReport.completeCount, 0)
  assert.equal(pendingReport.productionReadyCount, 1)
  assert.equal(pendingReport.closeoutRowsRecorded, 0)
  assert.deepEqual(readJson(path.join(tempDir, 'docs', 'supabase-phase-8-closeout-evidence.json')).rows, [])

  const applyEvidence = readJson(path.join(tempDir, 'docs', 'production-evidence', '202607990001-legal_document_runtime.json'))
  const repairEvidence = readJson(path.join(tempDir, 'docs', 'production-evidence', '202607990002-attorney_workflow_runtime.json'))
  const blockedEvidence = readJson(path.join(tempDir, 'docs', 'production-evidence', '202607990003-seller_transaction_continuity.json'))
  assert.equal(applyEvidence.sqlApplied, true)
  assert.equal(repairEvidence.sqlApplied, false)
  assert.equal(blockedEvidence.sqlApplied, null)

  writeFileSync(path.join(tempDir, 'docs', 'production-evidence', '202607990001-legal_document_runtime.json'), JSON.stringify({
    ...applyEvidence,
    targetProjectRef: productionProjectRef,
    sqlApplied: true,
    targetStateVerified: true,
    productionTargetStateVerified: true,
    productionLedgerRecorded: true,
    catalogChecks: 'pass',
    behaviorChecks: 'pass',
    rollbackOrNoResidue: 'pass',
    reviewedBy: 'test reviewer',
    capturedAt: '2026-07-25T00:00:00.000Z',
  }, null, 2))

  writeFileSync(path.join(tempDir, 'docs', 'production-evidence', '202607990003-seller_transaction_continuity.json'), JSON.stringify({
    ...blockedEvidence,
    targetProjectRef: productionProjectRef,
    sqlApplied: null,
    targetStateVerified: true,
    productionTargetStateVerified: true,
    productionLedgerRecorded: true,
    catalogChecks: 'pass',
    behaviorChecks: 'pass',
    rollbackOrNoResidue: 'pass',
    reviewedBy: 'test reviewer',
    capturedAt: '2026-07-25T00:00:00.000Z',
  }, null, 2))
  writeFileSync(path.join(tempDir, 'docs', 'production-evidence', '202607990002-attorney_workflow_runtime.json'), JSON.stringify({
    ...repairEvidence,
    targetProjectRef: productionProjectRef,
    sqlApplied: false,
    targetStateVerified: true,
    productionTargetStateVerified: true,
    productionLedgerRecorded: true,
    catalogChecks: 'pass',
    behaviorChecks: 'pass',
    rollbackOrNoResidue: 'pass',
    reviewedBy: 'test reviewer',
    capturedAt: '2026-07-25T00:00:00.000Z',
  }, null, 2))

  const completedRun = run(tempDir)
  assert.equal(completedRun.status, 0, completedRun.stderr)
  const completedReport = readJson(path.join(tempDir, 'docs', 'supabase-push-phase-6-production-evidence.json'))
  assert.equal(completedReport.createdCount, 0)
  assert.equal(completedReport.existingCount, 3)
  assert.equal(completedReport.completeCount, 1)
  assert.equal(completedReport.pendingCount, 2)
  assert.equal(completedReport.closeoutRowsRecorded, 1)

  const closeout = readJson(path.join(tempDir, 'docs', 'supabase-phase-8-closeout-evidence.json'))
  assert.equal(closeout.productionProjectRef, productionProjectRef)
  assert.equal(closeout.rows.length, 1)
  assert.equal(closeout.rows[0].version, '202607990001')
  assert.equal(closeout.rows[0].productionLedgerRecorded, true)
  assert.equal(closeout.rows[0].productionEvidenceFile, 'docs/production-evidence/202607990001-legal_document_runtime.json')

  const blockedRow = completedReport.rows.find((row) => row.version === '202607990003')
  assert.equal(blockedRow.complete, false)
  assert.ok(blockedRow.blockers.includes('upstream_corrective_required'))
  const notReadyRow = completedReport.rows.find((row) => row.version === '202607990002')
  assert.equal(notReadyRow.complete, false)
  assert.ok(notReadyRow.blockers.includes('production_promotion_not_ready'))
  assert.ok(notReadyRow.blockers.includes('phase5_staging_evidence_pending'))
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase push phase 6 production evidence tests passed.')
