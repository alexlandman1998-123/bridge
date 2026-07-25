#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STREAM_PLAN_PATH = path.join('docs', 'supabase-push-phase-2-stream-plans.json')
const CLEARANCE_DIR = path.join('docs', 'non-runnable-clearance')
const JSON_REPORT_PATH = path.join('docs', 'supabase-push-phase-3-action-routing.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-phase-3-action-routing-report.md')

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function evidencePath(row) {
  return `docs/staging-evidence/${row.version}-${row.stream}.json`
}

function correctivePath(row) {
  return `supabase/migrations/TODO_${row.version}_corrective_${row.stream}.sql`
}

function manualReviewPath(row) {
  return `docs/manual-review/${row.version}-${row.stream}.md`
}

function clearancePath(row) {
  return path.join(CLEARANCE_DIR, `${row.version}-${row.stream}.json`)
}

function approvedClearanceAction(repoRoot, row) {
  const clearanceAction = ['manual_data_review', 'corrective_migration_required'].includes(row.action)
    ? row.action
    : row.originalAction
  if (!['manual_data_review', 'corrective_migration_required'].includes(clearanceAction)) return null
  const absolutePath = path.join(repoRoot, clearancePath(row))
  if (!existsSync(absolutePath)) return null
  const clearance = readJson(absolutePath)
  const decision = clearance.clearanceDecision
  const approved = String(clearance.approvedBy || '').trim() && String(clearance.approvedAt || '').trim()
  if (!['apply_original_after_dependency_check', 'repair_only_after_smoke', 'apply_corrective_after_dependency_check'].includes(decision)) return null
  if (!approved || (Array.isArray(clearance.blockers) && clearance.blockers.length > 0)) {
    return {
      pendingDecision: decision,
      blockers: clearance.blockers || ['manual_clearance_approval_pending'],
      clearanceFile: clearancePath(row),
    }
  }
  if (decision === 'apply_corrective_after_dependency_check') {
    const correctiveMigrationFile = String(clearance.correctiveMigrationFile || '').trim()
    const correctiveVersion = String(clearance.correctiveVersion || path.basename(correctiveMigrationFile).match(/^(\d{12,})_/)?.[1] || '').trim()
    if (!correctiveMigrationFile || !correctiveVersion) {
      return {
        pendingDecision: decision,
        blockers: ['corrective_migration_binding_missing'],
        clearanceFile: clearancePath(row),
      }
    }
    return {
      action: 'apply_original_after_dependency_check',
      clearanceDecision: decision,
      clearanceFile: clearancePath(row),
      correctiveMigrationFile,
      originalVersion: row.originalVersion || row.version,
      originalFile: row.originalFile || row.file,
      version: correctiveVersion,
      file: path.basename(correctiveMigrationFile),
    }
  }
  return { action: decision, clearanceDecision: decision, clearanceFile: clearancePath(row) }
}

function route(row, repoRoot) {
  const clearance = approvedClearanceAction(repoRoot, row)
  if (clearance?.action) {
    const effectiveRow = {
      ...row,
      action: clearance.action,
      ...(clearance.version ? { version: clearance.version } : {}),
      ...(clearance.file ? { file: clearance.file } : {}),
    }
    const routed = route(effectiveRow, repoRoot)
    return {
      ...routed,
      version: effectiveRow.version,
      file: effectiveRow.file,
      action: effectiveRow.action,
      originalAction: row.action,
      originalVersion: clearance.originalVersion || row.version,
      originalFile: clearance.originalFile || row.file,
      clearanceDecision: clearance.clearanceDecision,
      clearanceFile: clearance.clearanceFile,
      correctiveMigrationFile: clearance.correctiveMigrationFile,
      notes: [
        `${row.action === 'manual_data_review' ? 'Manual data review' : 'Corrective migration'} approved in ${clearance.clearanceFile}.`,
        `Effective action is ${clearance.clearanceDecision || clearance.action}.`,
        ...(clearance.correctiveMigrationFile ? [`Corrective migration file is ${clearance.correctiveMigrationFile}.`] : []),
      ],
    }
  }

  if (row.action === 'apply_original_after_dependency_check') {
    return {
      route: 'apply_original',
      stage: 'staging_sql_then_ledger',
      blocked: false,
      sqlAllowed: true,
      ledgerAllowed: true,
      evidenceRequired: true,
      commands: [
        `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version ${row.version} --confirm APPLY_TO_STAGING_ONLY`,
        `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version ${row.version} --evidence ${evidencePath(row)} --confirm APPLY_TO_STAGING_ONLY`,
      ],
      evidenceFile: evidencePath(row),
      notes: [
        'Run dependency and catalog preflight before applying SQL.',
        'Apply only this file; do not run a broad db push.',
        'Record the staging ledger only after reviewed evidence exists.',
      ],
    }
  }

  if (row.action === 'repair_only_after_smoke') {
    return {
      route: 'repair_only',
      stage: 'staging_ledger_only',
      blocked: false,
      sqlAllowed: false,
      ledgerAllowed: true,
      evidenceRequired: true,
      commands: [
        `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version ${row.version} --evidence ${evidencePath(row)} --confirm APPLY_TO_STAGING_ONLY`,
      ],
      evidenceFile: evidencePath(row),
      notes: [
        'Do not apply SQL; expected objects are already live.',
        'Run module smoke tests first.',
        'Evidence must use sqlApplied=false.',
      ],
    }
  }

  if (row.action === 'corrective_migration_required') {
    return {
      route: 'corrective_required',
      stage: 'blocked_until_corrective_migration',
      blocked: true,
      sqlAllowed: false,
      ledgerAllowed: false,
      evidenceRequired: true,
      correctiveMigrationFile: correctivePath(row),
      commands: [
        `# Create an idempotent corrective migration first: ${correctivePath(row)}`,
        `# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.`,
      ],
      evidenceFile: evidencePath(row),
      notes: [
        'Do not replay the original migration; live catalog is partial.',
        'Diff live definitions and create a narrowly scoped corrective migration.',
        'The corrective migration gets its own review and staging evidence.',
      ],
    }
  }

  if (row.action === 'manual_data_review') {
    return {
      route: 'manual_review',
      stage: 'blocked_until_manual_decision',
      blocked: true,
      sqlAllowed: false,
      ledgerAllowed: false,
      evidenceRequired: true,
      manualReviewFile: manualReviewPath(row),
      commands: [
        `# Complete manual data review first: ${manualReviewPath(row)}`,
        `# Decide whether this becomes an apply, repair-only, or replacement data migration.`,
      ],
      evidenceFile: evidencePath(row),
      clearanceFile: clearance?.clearanceFile || clearancePath(row),
      clearanceDecision: clearance?.pendingDecision || null,
      notes: [
        'No static objects were extracted, so catalog checks cannot decide the path.',
        'Verify intended rows and idempotency manually.',
        ...(clearance?.pendingDecision ? [`Clearance decision ${clearance.pendingDecision} is pending approval.`] : []),
        'Do not record ledger state until the reviewed data decision is documented.',
      ],
    }
  }

  return {
    route: 'unknown',
    stage: 'blocked_refresh_manifest',
    blocked: true,
    sqlAllowed: false,
    ledgerAllowed: false,
    evidenceRequired: true,
    commands: ['# Refresh manifest and rerun phase 2.'],
    evidenceFile: evidencePath(row),
    notes: [`Unknown action: ${row.action}`],
  }
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || 'unknown'
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function dedupeRoutedRows(rows) {
  const byVersion = new Map()
  for (const row of rows) {
    const existing = byVersion.get(row.version)
    if (!existing) {
      byVersion.set(row.version, row)
      continue
    }
    const rowHasClearance = Boolean(row.clearanceDecision || row.originalVersion)
    const existingHasClearance = Boolean(existing.clearanceDecision || existing.originalVersion)
    if (rowHasClearance && !existingHasClearance) {
      byVersion.set(row.version, {
        ...row,
        notes: [
          ...(row.notes || []),
          `Direct duplicate route for ${existing.file} was suppressed in favour of the approved clearance path.`,
        ],
      })
    }
  }
  return [...byVersion.values()]
}

function markdownTable(headers, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function buildReport(result) {
  const countRows = (counts) => Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => [`\`${key}\``, String(count)])

  const workRows = result.rows.map((row) => [
    `\`${row.version}\``,
    `\`${row.stream}\``,
    `\`${row.action}\``,
    `\`${row.route}\``,
    row.blocked ? 'Yes' : 'No',
    row.sqlAllowed ? 'Yes' : 'No',
    row.ledgerAllowed ? 'Yes' : 'No',
    `\`${row.file}\``,
  ])

  const commandRows = result.rows.map((row) => [
    `\`${row.version}\``,
    row.commands.map((command) => `\`${command.replaceAll('|', '\\|')}\``).join('<br>'),
  ])

  return `# Supabase Push Phase 3 Action Routing Report

Generated: ${result.generatedAt}

## Scope

Phase 3 handles rows by action. It converts the phase 2 stream plans into explicit execution routes. This phase is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows | ${result.rows.length} |
| Runner-eligible rows | ${result.rows.filter((row) => !row.blocked).length} |
| Blocked rows | ${result.rows.filter((row) => row.blocked).length} |
| SQL-allowed rows | ${result.rows.filter((row) => row.sqlAllowed).length} |
| Ledger-allowed rows | ${result.rows.filter((row) => row.ledgerAllowed).length} |

## Actions

${markdownTable(['Action', 'Rows'], countRows(result.actionCounts))}

## Routes

${markdownTable(['Route', 'Rows'], countRows(result.routeCounts))}

## Work Queue

${markdownTable(['Version', 'Stream', 'Action', 'Route', 'Blocked', 'SQL Allowed', 'Ledger Allowed', 'File'], workRows)}

## Commands

${markdownTable(['Version', 'Command'], commandRows)}

## Next Step

Phase 4 should prepare or collect reviewed staging evidence for the runner-eligible rows. Blocked rows need corrective migrations or manual data review before they can enter the runner path.
`
}

function main() {
  const repoRoot = findRepoRoot(process.cwd())
  const streamPlan = readJson(path.join(repoRoot, STREAM_PLAN_PATH))
  if (!Array.isArray(streamPlan.rows)) throw new Error('Phase 2 stream plan rows are missing.')
  const routedRows = streamPlan.rows.map((row) => ({
    ...row,
    ...route(row, repoRoot),
  }))
  const rows = dedupeRoutedRows(routedRows)
  const result = {
    generatedAt: new Date().toISOString(),
    sourcePlan: STREAM_PLAN_PATH,
    inputRows: routedRows.length,
    dedupedRows: routedRows.length - rows.length,
    rows,
    actionCounts: countBy(rows, 'action'),
    routeCounts: countBy(rows, 'route'),
    streamCounts: countBy(rows, 'stream'),
  }
  writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildReport(result))
  console.log(`Wrote ${JSON_REPORT_PATH}`)
  console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
}

try {
  main()
} catch (error) {
  console.error(`Supabase push phase 3 action routing failed: ${error.message}`)
  process.exitCode = 1
}
