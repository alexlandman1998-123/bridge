#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST_PATH = path.join('docs', 'supabase-phase-5-application-manifest.json')
const TEMPLATE_PATH = path.join('docs', 'supabase-push-phase-1-staging-evidence-templates.json')
const REPORT_PATH = path.join('docs', 'supabase-push-phase-1-staging-prep-report.md')

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

function expectedSqlApplied(action) {
  if (action === 'apply_original_after_dependency_check') return true
  if (action === 'repair_only_after_smoke') return false
  return null
}

function runnerEligibility(action) {
  if (action === 'apply_original_after_dependency_check') return 'staging_apply_then_record'
  if (action === 'repair_only_after_smoke') return 'staging_record_only_after_smoke'
  if (action === 'corrective_migration_required') return 'blocked_create_corrective_migration'
  if (action === 'manual_data_review') return 'blocked_manual_data_review'
  return 'blocked_refresh_manifest'
}

function buildTemplates(manifest) {
  return {
    generatedAt: new Date().toISOString(),
    sourceManifest: MANIFEST_PATH,
    rowCount: manifest.rows.length,
    instructions: [
      'Replace TODO_STAGING_PROJECT_REF with the non-production Supabase project ref.',
      'Use one reviewed evidence object per migration version.',
      'Do not use these templates to bypass corrective_migration_required or manual_data_review gates.',
      'Keep stagingLedgerRecorded true only after the staging ledger has actually been recorded.',
    ],
    rows: manifest.rows.map((row) => {
      const sqlApplied = expectedSqlApplied(row.action)
      return {
        version: row.version,
        stream: row.stream,
        file: row.file,
        action: row.action,
        objectStatus: row.objectStatus,
        runnerEligibility: runnerEligibility(row.action),
        stagingEvidenceTemplate: {
          version: row.version,
          targetProjectRef: 'TODO_STAGING_PROJECT_REF',
          stagingProjectRef: 'TODO_STAGING_PROJECT_REF',
          sqlApplied,
          stagingLedgerRecorded: ['apply_original_after_dependency_check', 'repair_only_after_smoke'].includes(row.action) ? true : null,
          catalogChecks: 'pass',
          behaviorChecks: 'pass',
          rollbackOrNoResidue: 'pass',
          reviewedBy: 'TODO_REVIEWER',
          approvedBy: 'TODO_APPROVER',
          notes: [
            row.action === 'apply_original_after_dependency_check'
              ? 'Apply this original migration file to staging before recording the ledger.'
              : row.action === 'repair_only_after_smoke'
                ? 'Do not apply SQL; record the ledger only after smoke evidence passes.'
                : row.action === 'corrective_migration_required'
                  ? 'Create and test a new idempotent corrective migration before evidence can be completed.'
                  : 'Complete manual data review before deciding apply or repair.',
          ],
        },
      }
    }),
  }
}

function summarize(rows, key) {
  return rows.reduce((summary, row) => {
    const value = row[key] || 'unknown'
    summary[value] = (summary[value] || 0) + 1
    return summary
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

function report(templates) {
  const streamCounts = summarize(templates.rows, 'stream')
  const actionCounts = summarize(templates.rows, 'action')
  const eligibilityCounts = summarize(templates.rows, 'runnerEligibility')
  const countRows = (counts) => Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => [`\`${key}\``, String(count)])

  const workQueue = markdownTable(
    ['Version', 'Stream', 'Action', 'Object Status', 'Eligibility', 'File'],
    templates.rows.map((row) => [
      `\`${row.version}\``,
      `\`${row.stream}\``,
      `\`${row.action}\``,
      `\`${row.objectStatus}\``,
      `\`${row.runnerEligibility}\``,
      `\`${row.file}\``,
    ]),
  )

  return `# Supabase Push Phase 1 Staging Prep Report

Generated: ${templates.generatedAt}

## Scope

Phase 1 prepares the staging evidence package for the migration push path. It does not apply SQL, repair any ledger, relink the Supabase project, or modify production.

## Outputs

- \`${TEMPLATE_PATH}\`
- \`${REPORT_PATH}\`

## Manifest Summary

| Field | Value |
| --- | --- |
| Manifest rows | ${templates.rowCount} |
| Runner-eligible rows | ${templates.rows.filter((row) => ['staging_apply_then_record', 'staging_record_only_after_smoke'].includes(row.runnerEligibility)).length} |
| Blocked rows requiring corrective/manual work | ${templates.rows.filter((row) => row.runnerEligibility.startsWith('blocked_')).length} |

## Streams

${markdownTable(['Stream', 'Rows'], countRows(streamCounts))}

## Actions

${markdownTable(['Action', 'Rows'], countRows(actionCounts))}

## Runner Eligibility

${markdownTable(['Eligibility', 'Rows'], countRows(eligibilityCounts))}

## Work Queue

${workQueue}

## Required Environment Before Applying

\`\`\`bash
export SUPABASE_STAGING_PROJECT_REF='<staging-project-ref>'
export SUPABASE_STAGING_DB_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
export SUPABASE_STAGING_RECOVERY_CONFIRMED='I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
\`\`\`

Use \`scripts/supabase-phase6-staging-execution.mjs\` for staging. Do not use broad \`supabase db push\`.
`
}

function main() {
  const repoRoot = findRepoRoot(process.cwd())
  const manifest = readJson(path.join(repoRoot, MANIFEST_PATH))
  if (!Array.isArray(manifest.rows)) throw new Error('Phase 5 manifest rows are missing.')
  const templates = buildTemplates(manifest)
  writeFileSync(path.join(repoRoot, TEMPLATE_PATH), `${JSON.stringify(templates, null, 2)}\n`)
  writeFileSync(path.join(repoRoot, REPORT_PATH), report(templates))
  console.log(`Wrote ${TEMPLATE_PATH}`)
  console.log(`Wrote ${REPORT_PATH}`)
}

try {
  main()
} catch (error) {
  console.error(`Supabase push phase 1 staging prep failed: ${error.message}`)
  process.exitCode = 1
}
