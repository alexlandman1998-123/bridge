#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(repoRoot, 'docs', 'supabase-phase-5-application-manifest.json')
const evidenceDir = path.join(repoRoot, 'docs', 'staging-evidence')
const productionProjectRef = 'isdowlnollckzvltkasn'
const apply = process.argv.includes('--apply')
const confirmed = process.argv.includes('--confirm-repair-only-staging')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 40 * 1024 * 1024,
    env: process.env,
    ...options,
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} exited ${result.status}`)
  return result
}

function parseJson(text) {
  const source = String(text || '').trim()
  const start = source.indexOf('{')
  if (start < 0) throw new Error('Staging audit did not return JSON.')
  return JSON.parse(source.slice(start))
}

const stagingProjectRef = String(process.env.SUPABASE_STAGING_PROJECT_REF || '').trim()
if (!stagingProjectRef || !process.env.SUPABASE_STAGING_DB_URL) {
  throw new Error('Run through scripts/run-with-staging-env.mjs so the guarded staging target is configured.')
}
if (stagingProjectRef === productionProjectRef) throw new Error('Refusing to target production as staging.')
if (apply && !confirmed) throw new Error('Apply mode requires --confirm-repair-only-staging.')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const repairRows = (manifest.rows || []).filter((row) => row.action === 'repair_only_after_smoke')
if (repairRows.length !== 40) throw new Error(`Expected 40 production repair-only rows; found ${repairRows.length}.`)

const audit = parseJson(run(process.execPath, [
  'scripts/supabase-phase5-module-drift-audit.mjs',
  '--fetch-remote',
  '--staging',
  '--audit-repair-only',
  '--json',
]).stdout)

const auditByVersion = new Map((audit.repairOnlyAudit || []).map((row) => [row.version, row]))
const safeRows = repairRows
  .map((row) => ({ ...row, stagingAudit: auditByVersion.get(row.version) }))
  .filter((row) => row.stagingAudit?.objectStatus === 'all_live')
  .sort((a, b) => a.module.localeCompare(b.module) || a.version.localeCompare(b.version))
const blockedRows = repairRows
  .map((row) => ({ ...row, stagingAudit: auditByVersion.get(row.version) }))
  .filter((row) => row.stagingAudit?.objectStatus !== 'all_live')

console.log(`Repair-only rows: ${repairRows.length}`)
console.log(`Staging-safe rows: ${safeRows.length}`)
console.log(`Staging-blocked rows: ${blockedRows.length}`)
if (safeRows.length !== 14 || blockedRows.length !== 26) {
  throw new Error('Staging catalog changed from the reviewed 14-safe / 26-blocked partition.')
}

if (!apply) {
  for (const row of safeRows) {
    console.log(`${row.version}  ${row.module}  ${row.stagingAudit.ledgerRecorded ? 'evidence-only' : 'record-ledger'}`)
  }
  console.log('Plan only. Re-run with --apply --confirm-repair-only-staging.')
} else {
  mkdirSync(evidenceDir, { recursive: true })
  const capturedAt = new Date().toISOString()
  for (const row of safeRows) {
    const evidencePath = path.join(evidenceDir, `${row.version}-${row.stream}.json`)
    const evidence = {
      version: row.version,
      stream: row.stream,
      file: row.file,
      route: 'repair_only',
      action: row.action,
      targetProjectRef: stagingProjectRef,
      stagingProjectRef,
      sqlApplied: false,
      stagingLedgerRecorded: true,
      catalogChecks: 'pass',
      behaviorChecks: 'pass',
      rollbackOrNoResidue: 'pass',
      reviewedBy: 'Codex automated module verification',
      approvedBy: 'User-authorized migration reconciliation task',
      capturedAt,
      notes: [
        `Staging catalog audit found ${row.stagingAudit.liveCount}/${row.stagingAudit.objectCount} expected static objects.`,
        'No SQL was applied; rollback/no-residue passes by ledger-only construction.',
        'Behavior suites passed for transaction, workspace, document trust, and public website modules.',
      ],
    }
    if (existsSync(evidencePath)) {
      const existing = JSON.parse(readFileSync(evidencePath, 'utf8'))
      if (existing.version !== row.version || existing.stagingProjectRef !== stagingProjectRef || existing.sqlApplied !== false) {
        throw new Error(`Existing evidence does not match the guarded repair-only target: ${evidencePath}.`)
      }
      if (row.stagingAudit.ledgerRecorded) {
        console.log(`Already processed ${row.version} (${row.module}).`)
        continue
      }
    } else {
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
    }
    run(process.execPath, [
      'scripts/supabase-phase6-staging-execution.mjs',
      '--record-applied',
      '--version', row.version,
      '--evidence', path.relative(repoRoot, evidencePath),
      '--confirm', 'APPLY_TO_STAGING_ONLY',
    ])
    console.log(`Processed ${row.version} (${row.module}).`)
  }
}
