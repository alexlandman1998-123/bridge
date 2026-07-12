#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = path.join('docs', 'supabase-migration-phase-4-duplicate-timestamps-report.md')

const PHASE4_RENAMES = [
  {
    from: 'supabase/migrations/202606160001_commercial_landlord_onboarding_workspace.sql',
    to: 'supabase/migrations/202606160002_commercial_landlord_onboarding_workspace.sql',
    reason: 'Resolved duplicate local version 202606160001.',
  },
  {
    from: 'supabase/migrations/202606220002_seller_portal_password_access_phase3.sql',
    to: 'supabase/migrations/202606220003_seller_portal_password_access_phase3.sql',
    reason: 'Resolved duplicate local version 202606220002.',
  },
  {
    from: 'supabase/migrations/202606280001_demo_enquiries.sql',
    to: 'supabase/migrations/202606280003_demo_enquiries.sql',
    reason: 'Kept the already matched 202606280001 migration stable and moved the duplicate to the next unused slot.',
  },
  {
    from: 'supabase/migrations/202606290005_transaction_reservation_commercial_terms.sql',
    to: 'supabase/migrations/202606290019_transaction_reservation_commercial_terms.sql',
    reason: 'Kept the already matched 202606290005 migration stable and moved the duplicate after the existing 202606290018 migration.',
  },
  {
    from: 'supabase/migrations/202607090002_private_listing_mandate_status_alignment.sql',
    to: 'supabase/migrations/202607090007_private_listing_mandate_status_alignment.sql',
    reason: 'Resolved duplicate local version 202607090002.',
  },
  {
    from: 'supabase/migrations/202607120001_canonical_document_verification_snapshot_scoped.sql',
    to: 'supabase/migrations/202607120003_canonical_document_verification_snapshot_scoped.sql',
    reason: 'Kept the already matched 202607120001 migration stable and moved the duplicate after 202607120002.',
  },
]

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseArgs(argv) {
  const options = {
    write: false,
    json: false,
  }

  for (const arg of argv) {
    if (arg === '--write') {
      options.write = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function getMigrationFiles(repoRoot) {
  const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
  if (!existsSync(migrationsDir)) return []
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
}

function duplicateVersions(files) {
  const byVersion = new Map()
  for (const file of files) {
    const version = file.split('_')[0]
    const entries = byVersion.get(version) || []
    entries.push(file)
    byVersion.set(version, entries)
  }

  return [...byVersion.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([version, entries]) => ({ version, files: entries }))
    .sort((a, b) => a.version.localeCompare(b.version))
}

function renameStatuses(repoRoot) {
  return PHASE4_RENAMES.map((rename) => {
    const fromExists = existsSync(path.join(repoRoot, rename.from))
    const toExists = existsSync(path.join(repoRoot, rename.to))
    return {
      ...rename,
      fromExists,
      toExists,
      ready: !fromExists && toExists,
    }
  })
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
}

function markdownTable(headers, rows) {
  const header = `| ${headers.map(escapeCell).join(' | ')} |`
  const divider = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`)
  return [header, divider, ...body].join('\n')
}

function generateReport({ repoRoot, generatedAt, files, duplicates, statuses }) {
  const allRenamesReady = statuses.every((status) => status.ready)
  const status = duplicates.length === 0 && allRenamesReady ? 'DEDUPED' : 'ATTENTION_REQUIRED'
  const lines = []

  lines.push('# Supabase Migration Phase 4 Duplicate Timestamp Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Repo: ${repoRoot}`)
  lines.push('')
  lines.push('## Safety Scope')
  lines.push('')
  lines.push('Phase 4 is local migration-file hygiene. It resolves duplicate local migration timestamps by renaming the duplicate files to unused timestamp slots. It does not run `db push`, `db reset`, `migration repair`, or any remote database command.')
  lines.push('')
  lines.push('## Decision')
  lines.push('')
  lines.push(markdownTable(
    ['Field', 'Value'],
    [
      ['Status', status],
      ['Local migration files', files.length],
      ['Duplicate local timestamps', duplicates.length],
      ['Expected renames complete', `${statuses.filter((row) => row.ready).length}/${statuses.length}`],
    ],
  ))
  lines.push('')
  lines.push('## Rename Map')
  lines.push('')
  lines.push(markdownTable(
    ['Old path', 'New path', 'Ready', 'Reason'],
    statuses.map((row) => [
      row.from,
      row.to,
      row.ready ? 'yes' : 'no',
      row.reason,
    ]),
  ))
  lines.push('')
  lines.push('## Duplicate Scan')
  lines.push('')
  if (duplicates.length) {
    lines.push(markdownTable(
      ['Version', 'Files'],
      duplicates.map((row) => [row.version, row.files.join(', ')]),
    ))
  } else {
    lines.push('No duplicate local migration timestamps remain.')
  }
  lines.push('')
  lines.push('## Next Step')
  lines.push('')
  if (status === 'DEDUPED') {
    lines.push('Regenerate Phase 1 to refresh the migration matrix with unique local versions. Remote ledger drift still remains for non-onboarding modules and should be handled in later phases.')
  } else {
    lines.push('Fix the incomplete rename(s) or remaining duplicate timestamps before running broad Supabase migration operations.')
  }
  lines.push('')

  return { status, report: `${lines.join('\n')}\n` }
}

function printUsage() {
  console.log('Usage: node scripts/supabase-phase4-deduplicate-migration-timestamps.mjs [--write] [--json]')
  console.log('')
  console.log('Options:')
  console.log('  --write  Write docs/supabase-migration-phase-4-duplicate-timestamps-report.md.')
  console.log('  --json   Print a compact machine-readable summary.')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  const repoRoot = findRepoRoot(process.cwd())
  const generatedAt = new Date().toISOString()
  const files = getMigrationFiles(repoRoot)
  const duplicates = duplicateVersions(files)
  const statuses = renameStatuses(repoRoot)
  const { status, report } = generateReport({ repoRoot, generatedAt, files, duplicates, statuses })

  if (options.write) {
    const reportPath = path.join(repoRoot, REPORT_PATH)
    mkdirSync(path.dirname(reportPath), { recursive: true })
    writeFileSync(reportPath, report)
    console.log(`Wrote ${REPORT_PATH}`)
  }

  if (options.json) {
    console.log(JSON.stringify({
      generatedAt,
      repoRoot,
      status,
      localMigrationFiles: files.length,
      duplicateVersions: duplicates.map((row) => row.version),
      renameReady: statuses.filter((row) => row.ready).length,
      renameTotal: statuses.length,
    }, null, 2))
  } else if (!options.write) {
    console.log(report)
  }

  if (status !== 'DEDUPED') {
    process.exitCode = 1
  }
}

main()
