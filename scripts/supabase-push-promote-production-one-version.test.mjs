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
const runner = path.join(repoRoot, 'scripts', 'supabase-push-promote-production-one-version.mjs')

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function run(cwd, args) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_PRODUCTION_PROJECT_REF: '',
      SUPABASE_PRODUCTION_DB_URL: '',
      SUPABASE_PRODUCTION_RECOVERY_CONFIRMED: '',
    },
  })
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'supabase-push-one-version-'))

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
        stagingEvidenceFile: 'docs/staging-evidence/202607990001-legal_document_runtime.json',
        productionEvidenceFile: 'docs/production-evidence/202607990001-legal_document_runtime.json',
        readyForProduction: true,
        blockers: [],
      },
      {
        version: '202607990002',
        stream: 'attorney_workflow_runtime',
        file: '202607990002_repair.sql',
        productionRoute: 'production_no_sql_record_after_smoke',
        stagingEvidenceFile: 'docs/staging-evidence/202607990002-attorney_workflow_runtime.json',
        productionEvidenceFile: 'docs/production-evidence/202607990002-attorney_workflow_runtime.json',
        readyForProduction: true,
        blockers: [],
      },
      {
        version: '202607990003',
        stream: 'seller_transaction_continuity',
        file: '202607990003_blocked.sql',
        productionRoute: 'blocked_corrective_required',
        stagingEvidenceFile: 'docs/staging-evidence/202607990003-seller_transaction_continuity.json',
        productionEvidenceFile: 'docs/production-evidence/202607990003-seller_transaction_continuity.json',
        readyForProduction: false,
        blockers: ['upstream_corrective_required'],
      },
    ],
  }, null, 2))

  const missingVersion = run(tempDir, ['--plan'])
  assert.equal(missingVersion.status, 1)
  assert.match(missingVersion.stderr, /single --version is required/i)

  const readyApplyPlan = run(tempDir, ['--version', '202607990001', '--plan', '--json'])
  assert.equal(readyApplyPlan.status, 0, readyApplyPlan.stderr)
  const readyApply = JSON.parse(readyApplyPlan.stdout)
  assert.equal(readyApply.status, 'PROMOTION_READY')
  assert.equal(readyApply.commands.length, 2)
  assert.match(readyApply.commands[0], /--apply-sql/)
  assert.match(readyApply.commands[1], /--record-applied/)

  const readyRepairPlan = run(tempDir, ['--version', '202607990002', '--plan', '--json'])
  assert.equal(readyRepairPlan.status, 0, readyRepairPlan.stderr)
  const readyRepair = JSON.parse(readyRepairPlan.stdout)
  assert.equal(readyRepair.status, 'PROMOTION_READY')
  assert.equal(readyRepair.commands.length, 1)
  assert.match(readyRepair.commands[0], /--record-applied/)
  assert.doesNotMatch(readyRepair.commands[0], /--apply-sql/)

  const blockedPlan = run(tempDir, ['--version', '202607990003', '--plan', '--json'])
  assert.equal(blockedPlan.status, 0, blockedPlan.stderr)
  const blocked = JSON.parse(blockedPlan.stdout)
  assert.equal(blocked.status, 'PROMOTION_BLOCKED')
  assert.equal(blocked.execution.attempted, false)
  assert.ok(blocked.blockers.includes('phase5_production_promotion_not_ready'))
  assert.ok(blocked.blockers.includes('phase5_upstream_corrective_required'))

  const blockedMutation = run(tempDir, [
    '--version', '202607990003', '--record-applied', '--confirm', 'APPLY_TO_PRODUCTION', '--json',
  ])
  assert.equal(blockedMutation.status, 1)
  const blockedMutationReport = JSON.parse(blockedMutation.stdout)
  assert.equal(blockedMutationReport.status, 'PROMOTION_BLOCKED')
  assert.equal(blockedMutationReport.execution.attempted, false)

  const repairSqlApply = run(tempDir, [
    '--version', '202607990002', '--apply-sql', '--confirm', 'APPLY_TO_PRODUCTION', '--json',
  ])
  assert.equal(repairSqlApply.status, 1)
  const repairSqlApplyReport = JSON.parse(repairSqlApply.stdout)
  assert.equal(repairSqlApplyReport.status, 'PROMOTION_BLOCKED')
  assert.ok(repairSqlApplyReport.blockers.includes('selected_version_is_not_sql_apply_route'))

  assert.equal(existsSync(path.join(tempDir, 'docs', 'supabase-push-production-one-version.json')), true)
  assert.equal(existsSync(path.join(tempDir, 'docs', 'supabase-push-production-one-version-report.md')), true)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase one-version production promotion tests passed.')
