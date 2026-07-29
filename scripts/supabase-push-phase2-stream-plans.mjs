#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST_PATH = path.join('docs', 'supabase-phase-5-application-manifest.json')
const CLEARANCE_DIR = path.join('docs', 'non-runnable-clearance')
const JSON_REPORT_PATH = path.join('docs', 'supabase-push-phase-2-stream-plans.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-phase-2-stream-plans-report.md')

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

function runPlan(repoRoot, stream) {
  const result = spawnSync(process.execPath, [
    'scripts/supabase-phase6-staging-execution.mjs',
    '--plan',
    '--stream',
    stream,
    '--json',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`Could not read staging plan for ${stream}: ${result.stderr || result.stdout}`)
  }
  return JSON.parse(result.stdout)
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || 'unknown'
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function approvedCorrectiveSubstitutions(repoRoot, manifestRows) {
  return manifestRows.filter((row) => {
    if (row.action !== 'corrective_migration_required') return false
    const clearanceFile = path.join(repoRoot, CLEARANCE_DIR, `${row.version}-${row.stream}.json`)
    if (!existsSync(clearanceFile)) return false
    const clearance = readJson(clearanceFile)
    const blockers = Array.isArray(clearance.blockers) ? clearance.blockers : []
    return clearance.clearanceDecision === 'apply_corrective_after_dependency_check'
      && String(clearance.correctiveVersion || '').trim()
      && String(clearance.approvedBy || '').trim()
      && String(clearance.approvedAt || '').trim()
      && blockers.length === 0
  }).length
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
  const streamRows = result.streams.map((stream) => [
    `\`${stream.stream}\``,
    String(stream.count),
    Object.entries(stream.actionCounts).map(([action, count]) => `\`${action}\`: ${count}`).join('<br>'),
  ])
  const workRows = result.rows.map((row) => [
    `\`${row.version}\``,
    `\`${row.stream}\``,
    `\`${row.dependsOn}\``,
    `\`${row.action}\``,
    `\`${row.objectStatus}\``,
    `\`${row.file}\``,
  ])

  return `# Supabase Push Phase 2 Stream Plans Report

Generated: ${result.generatedAt}

## Scope

Phase 2 runs every staging stream plan from the current manifest. It is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Manifest rows | ${result.manifestRowCount} |
| Planned rows | ${result.plannedRowCount} |
| Approved corrective substitutions | ${result.approvedCorrectiveSubstitutions} |
| Streams | ${result.streams.length} |

## Streams

${markdownTable(['Stream', 'Rows', 'Actions'], streamRows)}

## Work Queue

${markdownTable(['Version', 'Stream', 'Depends On', 'Action', 'Object Status', 'File'], workRows)}

## Next Step

Use the action on each row to decide the phase 3 work:

- \`apply_original_after_dependency_check\`: apply that single file to staging after preflight.
- \`repair_only_after_smoke\`: do not apply SQL; run smoke checks, then record staging ledger.
- \`corrective_migration_required\`: create an idempotent corrective migration before staging execution.
- \`manual_data_review\`: verify intended data rows and idempotency before choosing apply or repair.
`
}

function main() {
  const repoRoot = findRepoRoot(process.cwd())
  const manifest = readJson(path.join(repoRoot, MANIFEST_PATH))
  if (!Array.isArray(manifest.rows)) throw new Error('Phase 5 manifest rows are missing.')

  const streams = [...new Set(manifest.rows.map((row) => row.stream))].filter(Boolean)
  const plans = streams.map((stream) => {
    const plan = runPlan(repoRoot, stream)
    return {
      stream,
      count: plan.count,
      rows: plan.rows,
      actionCounts: countBy(plan.rows, 'action'),
    }
  })
  const rows = plans.flatMap((plan) => plan.rows)
  const result = {
    generatedAt: new Date().toISOString(),
    manifestRowCount: manifest.rows.length,
    plannedRowCount: rows.length,
    approvedCorrectiveSubstitutions: approvedCorrectiveSubstitutions(repoRoot, manifest.rows),
    streams: plans.map(({ stream, count, actionCounts }) => ({ stream, count, actionCounts })),
    actionCounts: countBy(rows, 'action'),
    objectStatusCounts: countBy(rows, 'objectStatus'),
    rows,
  }

  if (result.plannedRowCount + result.approvedCorrectiveSubstitutions !== result.manifestRowCount) {
    throw new Error(`Planned row count ${result.plannedRowCount} does not match manifest row count ${result.manifestRowCount}.`)
  }

  writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildReport(result))
  console.log(`Wrote ${JSON_REPORT_PATH}`)
  console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
}

try {
  main()
} catch (error) {
  console.error(`Supabase push phase 2 stream plans failed: ${error.message}`)
  process.exitCode = 1
}
