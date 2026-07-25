#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ACTION_ROUTING_PATH = path.join('docs', 'supabase-push-phase-3-action-routing.json')
const EVIDENCE_DIR = path.join('docs', 'staging-evidence')
const JSON_REPORT_PATH = path.join('docs', 'supabase-push-phase-4-staging-evidence.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-phase-4-staging-evidence-report.md')

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

function expectedSqlApplied(row) {
  if (row.route === 'apply_original') return true
  if (row.route === 'repair_only') return false
  return null
}

function evidenceFile(row) {
  return row.evidenceFile || path.join(EVIDENCE_DIR, `${row.version}-${row.stream}.json`)
}

function defaultEvidence(row) {
  return {
    version: row.version,
    stream: row.stream,
    file: row.file,
    route: row.route,
    action: row.action,
    targetProjectRef: 'TODO_STAGING_PROJECT_REF',
    stagingProjectRef: 'TODO_STAGING_PROJECT_REF',
    sqlApplied: expectedSqlApplied(row),
    stagingLedgerRecorded: false,
    catalogChecks: 'pending',
    behaviorChecks: 'pending',
    rollbackOrNoResidue: 'pending',
    reviewedBy: '',
    approvedBy: '',
    capturedAt: null,
    notes: [
      row.route === 'apply_original'
        ? 'Apply the original migration to staging, run checks, then record the staging ledger.'
        : 'Do not apply SQL. Run smoke checks, then record the staging ledger.',
    ],
    commands: row.commands,
  }
}

function writeEvidenceFile(repoRoot, row) {
  const relativePath = evidenceFile(row)
  const absolutePath = path.join(repoRoot, relativePath)
  if (existsSync(absolutePath)) {
    return { relativePath, evidence: readJson(absolutePath), created: false }
  }
  const evidence = defaultEvidence(row)
  writeFileSync(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`)
  return { relativePath, evidence, created: true }
}

function evidenceStatus(row, evidence) {
  const expectedSql = expectedSqlApplied(row)
  const hasProjectRef = typeof evidence.targetProjectRef === 'string'
    && evidence.targetProjectRef.trim()
    && evidence.targetProjectRef !== 'TODO_STAGING_PROJECT_REF'
    && evidence.targetProjectRef === evidence.stagingProjectRef
  const complete = Boolean(
    evidence.version === row.version
    && hasProjectRef
    && evidence.sqlApplied === expectedSql
    && evidence.stagingLedgerRecorded === true
    && evidence.catalogChecks === 'pass'
    && evidence.behaviorChecks === 'pass'
    && evidence.rollbackOrNoResidue === 'pass'
    && String(evidence.reviewedBy || '').trim()
    && String(evidence.approvedBy || '').trim(),
  )
  const blockers = []
  if (evidence.version !== row.version) blockers.push('version_mismatch')
  if (!hasProjectRef) blockers.push('staging_project_ref_pending')
  if (evidence.sqlApplied !== expectedSql) blockers.push('sql_applied_mismatch')
  if (evidence.stagingLedgerRecorded !== true) blockers.push('staging_ledger_not_recorded')
  if (evidence.catalogChecks !== 'pass') blockers.push('catalog_checks_pending')
  if (evidence.behaviorChecks !== 'pass') blockers.push('behavior_checks_pending')
  if (evidence.rollbackOrNoResidue !== 'pass') blockers.push('rollback_or_no_residue_pending')
  if (!String(evidence.reviewedBy || '').trim()) blockers.push('reviewer_pending')
  if (!String(evidence.approvedBy || '').trim()) blockers.push('approver_pending')
  return { complete, blockers }
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || 'unknown'
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function markdownTable(headers, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function buildMarkdown(result) {
  const countRows = (counts) => Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => [`\`${key}\``, String(count)])
  const evidenceRows = result.rows.map((row) => [
    `\`${row.version}\``,
    `\`${row.stream}\``,
    `\`${row.route}\``,
    row.complete ? 'Complete' : 'Pending',
    row.created ? 'Created' : 'Existing',
    `\`${row.evidenceFile}\``,
    row.blockers.length ? row.blockers.map((item) => `\`${item}\``).join('<br>') : 'None',
  ])

  return `# Supabase Push Phase 4 Staging Evidence Report

Generated: ${result.generatedAt}

## Scope

Phase 4 captures staging evidence files for the runner-eligible migration rows. It does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Runner-eligible rows | ${result.rows.length} |
| Evidence files created | ${result.createdCount} |
| Evidence files existing | ${result.existingCount} |
| Complete evidence rows | ${result.completeCount} |
| Pending evidence rows | ${result.pendingCount} |

## Routes

${markdownTable(['Route', 'Rows'], countRows(result.routeCounts))}

## Evidence Files

${markdownTable(['Version', 'Stream', 'Route', 'Status', 'File State', 'Evidence File', 'Blockers'], evidenceRows)}

## Completion Rule

An evidence file is complete only when it has the real staging project ref, expected \`sqlApplied\` value, \`stagingLedgerRecorded: true\`, passing catalog/behavior/rollback checks, and both reviewer and approver names.
`
}

function main() {
  const repoRoot = findRepoRoot(process.cwd())
  const routing = readJson(path.join(repoRoot, ACTION_ROUTING_PATH))
  if (!Array.isArray(routing.rows)) throw new Error('Phase 3 action routing rows are missing.')
  mkdirSync(path.join(repoRoot, EVIDENCE_DIR), { recursive: true })
  const eligibleRows = routing.rows.filter((row) => !row.blocked)
  const rows = eligibleRows.map((row) => {
    const written = writeEvidenceFile(repoRoot, row)
    const status = evidenceStatus(row, written.evidence)
    return {
      version: row.version,
      stream: row.stream,
      route: row.route,
      action: row.action,
      file: row.file,
      evidenceFile: written.relativePath,
      created: written.created,
      complete: status.complete,
      blockers: status.blockers,
    }
  })
  const result = {
    generatedAt: new Date().toISOString(),
    sourceRouting: ACTION_ROUTING_PATH,
    evidenceDir: EVIDENCE_DIR,
    rows,
    routeCounts: countBy(rows, 'route'),
    createdCount: rows.filter((row) => row.created).length,
    existingCount: rows.filter((row) => !row.created).length,
    completeCount: rows.filter((row) => row.complete).length,
    pendingCount: rows.filter((row) => !row.complete).length,
  }
  writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(result))
  console.log(`Wrote ${JSON_REPORT_PATH}`)
  console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
}

try {
  main()
} catch (error) {
  console.error(`Supabase push phase 4 staging evidence failed: ${error.message}`)
  process.exitCode = 1
}
