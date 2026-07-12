#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = path.join('docs', 'supabase-migration-phase-1-reconciliation-report.md')
const LIVE_OBJECT_SQL_PATH = path.join('sql', 'supabase-phase1-live-object-checks.sql')

const ONBOARDING_CRITICAL_MIGRATIONS = [
  {
    version: '202605240010',
    label: 'atomic workspace onboarding',
    liveCheckKeys: [
      'workspace_onboarding_rpc',
      'workspace_onboarding_legacy_rpc',
      'workspace_onboarding_completions_table',
      'onboarding_states_table',
    ],
  },
  {
    version: '202606040001',
    label: 'role-contract onboarding wrapper',
    liveCheckKeys: ['workspace_onboarding_rpc'],
  },
  {
    version: '202606170002',
    label: 'principal claim invite RPC',
    liveCheckKeys: ['principal_claim_invite_rpc', 'invites_principal_claim_type_constraint'],
  },
  {
    version: '202606170003',
    label: 'principal claim completion RPC',
    liveCheckKeys: [
      'principal_claim_completion_rpc',
      'principal_claim_sync_trigger_function',
      'principal_claim_sync_trigger',
      'workspace_preference_principal_claim_source_constraint',
    ],
  },
  {
    version: '202606190001',
    label: 'email-claim onboarding repair',
    liveCheckKeys: ['workspace_repair_email_claim_function'],
  },
  {
    version: '202607020002',
    label: 'principal-claim invite RLS hardening',
    liveCheckKeys: ['invites_insert_workspace_admin_policy', 'invites_insert_member_fallback_policy'],
  },
  {
    version: '202607120002',
    label: 'branch-scope onboarding fix',
    liveCheckKeys: ['workspace_onboarding_branch_scope_fix'],
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

function readMigrationFiles(repoRoot) {
  const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
  if (!existsSync(migrationsDir)) return []
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const match = file.match(/^(\d{12,14})_(.+)\.sql$/)
      return {
        file,
        version: match?.[1] || file.split('_')[0],
        name: match?.[2] || file,
      }
    })
}

function groupBy(items, getKey) {
  const grouped = new Map()
  for (const item of items) {
    const key = getKey(item)
    const entries = grouped.get(key) || []
    entries.push(item)
    grouped.set(key, entries)
  }
  return grouped
}

function normalizeVersion(value) {
  if (value === null || value === undefined) return ''
  const match = String(value).match(/\b\d{12,14}\b/)
  return match?.[0] || ''
}

function normalizeBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return ['1', 't', 'true', 'yes'].includes(value.toLowerCase())
  return false
}

function parseJsonLoose(text) {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    const firstArray = trimmed.indexOf('[')
    const firstObject = trimmed.indexOf('{')
    const firstJson = [firstArray, firstObject].filter((index) => index >= 0).sort((a, b) => a - b)[0]
    if (firstJson === undefined) return null

    const sliced = trimmed.slice(firstJson)
    try {
      return JSON.parse(sliced)
    } catch {
      return null
    }
  }
}

function collectArrays(value, predicate, matches = []) {
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === 'object' && predicate(item))) {
      matches.push(value)
    }
    for (const item of value) collectArrays(item, predicate, matches)
    return matches
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectArrays(item, predicate, matches)
  }

  return matches
}

function extractRows(parsed, predicate) {
  if (!parsed) return []
  const arrays = collectArrays(parsed, predicate)
  return arrays.sort((a, b) => b.length - a.length)[0] || []
}

function getField(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name]
  }

  const lowerCaseKeys = Object.keys(row).reduce((keys, key) => {
    keys.set(key.toLowerCase(), key)
    return keys
  }, new Map())

  for (const name of names) {
    const realKey = lowerCaseKeys.get(name.toLowerCase())
    if (realKey) return row[realKey]
  }

  return undefined
}

function parseMigrationRowsFromJson(parsed) {
  const rows = extractRows(parsed, (item) => {
    return ['local', 'remote', 'local_version', 'remote_version', 'version'].some((key) => {
      return Object.prototype.hasOwnProperty.call(item, key)
    })
  })

  return rows
    .map((row) => {
      const local = normalizeVersion(getField(row, ['local', 'local_version', 'localVersion', 'LOCAL']))
      const remote = normalizeVersion(getField(row, ['remote', 'remote_version', 'remoteVersion', 'REMOTE']))
      return {
        local,
        remote,
        raw: row,
      }
    })
    .filter((row) => row.local || row.remote)
}

function parseMigrationRowsFromText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\d{12,14}/.test(line))
    .map((line) => {
      const cells = line.includes('│') ? line.split('│') : line.split('|')
      if (cells.length >= 2) {
        return {
          local: normalizeVersion(cells[0]),
          remote: normalizeVersion(cells[1]),
          raw: line,
        }
      }
      const [first, second] = line.match(/\d{12,14}/g) || []
      return {
        local: first || '',
        remote: second || '',
        raw: line,
      }
    })
    .filter((row) => row.local || row.remote)
}

function parseLiveRowsFromJson(parsed) {
  const rows = extractRows(parsed, (item) => Object.prototype.hasOwnProperty.call(item, 'check_key'))
  return rows.map((row) => ({
    checkKey: String(getField(row, ['check_key', 'checkKey'])),
    objectType: String(getField(row, ['object_type', 'objectType']) || ''),
    expected: String(getField(row, ['expected']) || ''),
    liveExists: normalizeBool(getField(row, ['live_exists', 'liveExists'])),
    ready: normalizeBool(getField(row, ['ready'])),
    details: String(getField(row, ['details']) || ''),
    raw: row,
  }))
}

function parseLiveRowsFromText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('|') || line.includes('│'))
    .map((line) => {
      const cells = (line.includes('│') ? line.split('│') : line.split('|')).map((cell) => cell.trim())
      if (cells.length < 6 || cells[0] === 'check_key') return null
      return {
        checkKey: cells[0],
        objectType: cells[1],
        expected: cells[2],
        liveExists: normalizeBool(cells[3]),
        ready: normalizeBool(cells[4]),
        details: cells[5],
        raw: line,
      }
    })
    .filter(Boolean)
    .filter((row) => row.checkKey && !row.checkKey.includes('-'))
}

function runSupabase(repoRoot, args) {
  const result = spawnSync('npx', ['supabase', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
  })

  return {
    command: `npx supabase ${args.join(' ')}`,
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error) : '',
  }
}

function buildLocalSummary(migrationFiles) {
  const byVersion = groupBy(migrationFiles, (file) => file.version)
  const duplicates = [...byVersion.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([version, entries]) => ({ version, files: entries.map((entry) => entry.file) }))
    .sort((a, b) => a.version.localeCompare(b.version))

  return {
    migrations: migrationFiles,
    byVersion,
    duplicates,
    versions: new Set(migrationFiles.map((file) => file.version)),
  }
}

function buildRemoteSummary(rows) {
  const matched = []
  const localOnly = []
  const remoteOnly = []
  const divergent = []

  for (const row of rows) {
    if (row.local && row.remote && row.local === row.remote) {
      matched.push(row)
    } else if (row.local && row.remote) {
      divergent.push(row)
    } else if (row.local) {
      localOnly.push(row)
    } else if (row.remote) {
      remoteOnly.push(row)
    }
  }

  const localOnlyVersions = new Set(localOnly.map((row) => row.local))
  const remoteOnlyVersions = new Set(remoteOnly.map((row) => row.remote))
  const splitVersions = [...localOnlyVersions]
    .filter((version) => remoteOnlyVersions.has(version))
    .sort((a, b) => a.localeCompare(b))

  return {
    rows,
    matched,
    localOnly,
    remoteOnly,
    divergent,
    splitVersions,
    remoteAppliedVersions: new Set(rows.map((row) => row.remote).filter(Boolean)),
    localListedVersions: new Set(rows.map((row) => row.local).filter(Boolean)),
  }
}

function buildLiveSummary(rows) {
  const byKey = new Map(rows.map((row) => [row.checkKey, row]))
  return {
    rows,
    byKey,
    readyCount: rows.filter((row) => row.ready).length,
    missingRows: rows.filter((row) => !row.ready),
  }
}

function commandNote(command) {
  const note = command.stderr.trim() || command.error || command.stdout.trim() || 'none'
  return note.length > 500 ? `${note.slice(0, 500)}...` : note
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

function listOrNone(items, mapItem = (item) => item) {
  if (!items.length) return '- none'
  return items.map((item) => `- ${mapItem(item)}`).join('\n')
}

function liveStateForKeys(liveSummary, keys) {
  if (!liveSummary) {
    return {
      label: 'not fetched',
      missing: [],
      ready: null,
    }
  }

  const missing = keys.filter((key) => !liveSummary.byKey.get(key)?.ready)
  if (!missing.length) {
    return {
      label: 'ready',
      missing: [],
      ready: true,
    }
  }

  return {
    label: `missing: ${missing.join(', ')}`,
    missing,
    ready: false,
  }
}

function nextAction({ hasLocalFile, duplicateLocal, remoteRecorded, remoteFetched, liveState }) {
  if (!hasLocalFile) return 'Recover or recreate local migration before ledger repair.'
  if (duplicateLocal) return 'Resolve duplicate local timestamp before broad migration operations.'
  if (liveState.ready === null) return 'Fetch live object checks before choosing a repair action.'
  if (!liveState.ready) return 'Phase 2 candidate: inspect or restore missing live object(s).'
  if (!remoteFetched) return 'Fetch remote ledger before choosing a repair action.'
  if (!remoteRecorded) return 'Phase 3 candidate: mark applied after review; live objects are present.'
  return 'No Phase 2 object patch needed.'
}

function criticalMatrix({ criticalMigrations, localSummary, remoteSummary, liveSummary }) {
  return criticalMigrations.map((migration) => {
    const localFiles = localSummary.byVersion.get(migration.version) || []
    const duplicateLocal = localFiles.length > 1
    const remoteFetched = Boolean(remoteSummary)
    const remoteRecorded = remoteSummary?.remoteAppliedVersions.has(migration.version) || false
    const liveState = liveStateForKeys(liveSummary, migration.liveCheckKeys)

    return {
      ...migration,
      localFiles,
      duplicateLocal,
      remoteFetched,
      remoteRecorded,
      liveState,
      nextAction: nextAction({
        hasLocalFile: localFiles.length > 0,
        duplicateLocal,
        remoteFetched,
        remoteRecorded,
        liveState,
      }),
    }
  })
}

function summarizeRemoteFetch(repoRoot) {
  const migrationCommand = runSupabase(repoRoot, ['migration', 'list', '--linked', '--output-format', 'json'])
  const liveCommand = runSupabase(repoRoot, [
    'db',
    'query',
    '--linked',
    '--file',
    path.join(repoRoot, LIVE_OBJECT_SQL_PATH),
    '--output-format',
    'json',
  ])

  const parsedMigrationJson = parseJsonLoose(migrationCommand.stdout)
  const parsedLiveJson = parseJsonLoose(liveCommand.stdout)

  const migrationRows = parsedMigrationJson
    ? parseMigrationRowsFromJson(parsedMigrationJson)
    : parseMigrationRowsFromText(migrationCommand.stdout)
  const liveRows = parsedLiveJson ? parseLiveRowsFromJson(parsedLiveJson) : parseLiveRowsFromText(liveCommand.stdout)

  return {
    migrationCommand,
    liveCommand,
    migrationRows,
    liveRows,
  }
}

function readLiveSql(repoRoot) {
  const liveSqlPath = path.join(repoRoot, LIVE_OBJECT_SQL_PATH)
  if (!existsSync(liveSqlPath)) return ''
  return readFileSync(liveSqlPath, 'utf8')
}

function generateReport({ repoRoot, localSummary, remoteSummary, liveSummary, remoteFetch, generatedAt }) {
  const matrix = criticalMatrix({
    criticalMigrations: ONBOARDING_CRITICAL_MIGRATIONS,
    localSummary,
    remoteSummary,
    liveSummary,
  })
  const phase2Candidates = matrix.filter((row) => row.localFiles.length && !row.duplicateLocal && row.liveState.ready === false)
  const phase3Candidates = matrix.filter((row) => {
    return row.localFiles.length && !row.duplicateLocal && row.liveState.ready === true && row.remoteFetched && !row.remoteRecorded
  })

  const lines = []
  lines.push('# Supabase Migration Phase 1 Reconciliation Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Repo: ${repoRoot}`)
  lines.push('')
  lines.push('## Safety Scope')
  lines.push('')
  lines.push('Phase 1 is read-only. This report is built from the local migration directory, `supabase migration list --linked`, and catalog-only SQL checks. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.')
  lines.push('')
  lines.push('## Executive Summary')
  lines.push('')
  lines.push(markdownTable(
    ['Metric', 'Value'],
    [
      ['Local migration files', localSummary.migrations.length],
      ['Duplicate local timestamps', localSummary.duplicates.length],
      ['Remote ledger rows fetched', remoteSummary ? remoteSummary.rows.length : 'not fetched'],
      ['Remote matched rows', remoteSummary ? remoteSummary.matched.length : 'not fetched'],
      ['Remote-only rows', remoteSummary ? remoteSummary.remoteOnly.length : 'not fetched'],
      ['Local-only rows in CLI comparison', remoteSummary ? remoteSummary.localOnly.length : 'not fetched'],
      ['Split local/remote versions', remoteSummary ? remoteSummary.splitVersions.length : 'not fetched'],
      ['Live onboarding object checks ready', liveSummary ? `${liveSummary.readyCount}/${liveSummary.rows.length}` : 'not fetched'],
    ],
  ))
  lines.push('')
  lines.push('## Onboarding Critical Matrix')
  lines.push('')
  lines.push(markdownTable(
    ['Version', 'Migration', 'Local file', 'Remote ledger', 'Live objects', 'Next action'],
    matrix.map((row) => [
      row.version,
      row.label,
      row.localFiles.length ? `${row.localFiles.length}${row.duplicateLocal ? ' files (duplicate)' : ' file'}` : 'missing',
      row.remoteFetched ? (row.remoteRecorded ? 'recorded applied' : 'not recorded') : 'not fetched',
      row.liveState.label,
      row.nextAction,
    ]),
  ))
  lines.push('')
  lines.push('## Phase 2 Queue')
  lines.push('')
  if (phase2Candidates.length) {
    lines.push('These items need live-object investigation before any ledger repair:')
    lines.push('')
    lines.push(markdownTable(
      ['Version', 'Migration', 'Missing checks'],
      phase2Candidates.map((row) => [row.version, row.label, row.liveState.missing.join(', ')]),
    ))
  } else if (liveSummary) {
    lines.push('No onboarding-critical live-object patch is currently indicated by the Phase 1 checks.')
  } else {
    lines.push('Live object checks were not fetched. Run `npm run supabase:phase1` from the repo root to populate this section.')
  }
  lines.push('')
  lines.push('## Phase 3 Ledger Repair Candidates')
  lines.push('')
  if (phase3Candidates.length) {
    lines.push('These migrations appear present locally and live in the database, but not recorded in the remote migration ledger. They are candidates for a later `migration repair --status applied` batch after review and approval:')
    lines.push('')
    lines.push(markdownTable(
      ['Version', 'Migration', 'Evidence'],
      phase3Candidates.map((row) => [row.version, row.label, row.liveCheckKeys.join(', ')]),
    ))
  } else if (remoteSummary && liveSummary) {
    lines.push('No onboarding-critical ledger repair candidate was identified from the current checks.')
  } else {
    lines.push('Remote ledger and live object checks are needed before this section can be trusted.')
  }
  lines.push('')
  lines.push('## Duplicate Local Migration Timestamps')
  lines.push('')
  if (localSummary.duplicates.length) {
    lines.push(markdownTable(
      ['Version', 'Files'],
      localSummary.duplicates.map((row) => [row.version, row.files.join(', ')]),
    ))
  } else {
    lines.push('No duplicate local migration timestamps detected.')
  }
  lines.push('')
  lines.push('## Remote Ledger Comparison')
  lines.push('')
  if (remoteSummary) {
    lines.push(markdownTable(
      ['Bucket', 'Count'],
      [
        ['matched', remoteSummary.matched.length],
        ['remote-only', remoteSummary.remoteOnly.length],
        ['local-only', remoteSummary.localOnly.length],
        ['divergent', remoteSummary.divergent.length],
        ['split versions', remoteSummary.splitVersions.length],
      ],
    ))
    lines.push('')
    lines.push('### Split Versions')
    lines.push('')
    lines.push(listOrNone(remoteSummary.splitVersions, (version) => version))
    lines.push('')
    lines.push('### Remote-Only Rows')
    lines.push('')
    lines.push(listOrNone(remoteSummary.remoteOnly, (row) => row.remote))
    lines.push('')
    lines.push('### Local-Only Rows')
    lines.push('')
    lines.push(listOrNone(remoteSummary.localOnly, (row) => row.local))
    lines.push('')
    if (remoteSummary.divergent.length) {
      lines.push('### Divergent Rows')
      lines.push('')
      lines.push(listOrNone(remoteSummary.divergent, (row) => `${row.local} -> ${row.remote}`))
      lines.push('')
    }
  } else {
    lines.push('Remote ledger was not fetched. Run `npm run supabase:phase1` from the repo root.')
    lines.push('')
  }
  lines.push('## Live Onboarding Object Checks')
  lines.push('')
  if (liveSummary) {
    lines.push(markdownTable(
      ['Check', 'Type', 'Ready', 'Live exists', 'Expected'],
      liveSummary.rows.map((row) => [
        row.checkKey,
        row.objectType,
        row.ready ? 'yes' : 'no',
        row.liveExists ? 'yes' : 'no',
        row.expected,
      ]),
    ))
  } else {
    lines.push('Live object checks were not fetched. The read-only check SQL lives at `sql/supabase-phase1-live-object-checks.sql`.')
  }
  lines.push('')
  lines.push('## Command Evidence')
  lines.push('')
  if (remoteFetch) {
    lines.push(markdownTable(
      ['Command', 'Status', 'Parsed rows', 'Notes'],
      [
        [
          remoteFetch.migrationCommand.command,
          remoteFetch.migrationCommand.ok ? 'ok' : `failed (${remoteFetch.migrationCommand.status ?? 'unknown'})`,
          remoteFetch.migrationRows.length,
          commandNote(remoteFetch.migrationCommand),
        ],
        [
          remoteFetch.liveCommand.command,
          remoteFetch.liveCommand.ok ? 'ok' : `failed (${remoteFetch.liveCommand.status ?? 'unknown'})`,
          remoteFetch.liveRows.length,
          commandNote(remoteFetch.liveCommand),
        ],
      ],
    ))
  } else {
    lines.push('Remote commands were not run for this report.')
  }
  lines.push('')
  lines.push('## Live Check SQL Fingerprint')
  lines.push('')
  lines.push(`- File: \`${LIVE_OBJECT_SQL_PATH}\``)
  lines.push(`- Bytes: ${Buffer.byteLength(readLiveSql(repoRoot), 'utf8')}`)
  lines.push('')

  return `${lines.join('\n')}\n`
}

function printUsage() {
  console.log('Usage: node scripts/supabase-phase1-reconciliation.mjs [--fetch-remote] [--write] [--json]')
  console.log('')
  console.log('Options:')
  console.log('  --fetch-remote  Run read-only Supabase CLI checks against the linked project.')
  console.log('  --write         Write docs/supabase-migration-phase-1-reconciliation-report.md.')
  console.log('  --json          Print a compact machine-readable summary instead of Markdown.')
}

function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has('--help') || args.has('-h')) {
    printUsage()
    return
  }

  const repoRoot = findRepoRoot(process.cwd())
  const migrationFiles = readMigrationFiles(repoRoot)
  const localSummary = buildLocalSummary(migrationFiles)
  const generatedAt = new Date().toISOString()

  let remoteFetch = null
  let remoteSummary = null
  let liveSummary = null

  if (args.has('--fetch-remote')) {
    remoteFetch = summarizeRemoteFetch(repoRoot)
    remoteSummary = remoteFetch.migrationCommand.ok ? buildRemoteSummary(remoteFetch.migrationRows) : null
    liveSummary = remoteFetch.liveCommand.ok ? buildLiveSummary(remoteFetch.liveRows) : null
  }

  const report = generateReport({
    repoRoot,
    localSummary,
    remoteSummary,
    liveSummary,
    remoteFetch,
    generatedAt,
  })

  if (args.has('--write')) {
    const reportPath = path.join(repoRoot, REPORT_PATH)
    mkdirSync(path.dirname(reportPath), { recursive: true })
    writeFileSync(reportPath, report)
    console.log(`Wrote ${REPORT_PATH}`)
  }

  if (args.has('--json')) {
    console.log(JSON.stringify({
      generatedAt,
      repoRoot,
      localMigrationFiles: localSummary.migrations.length,
      duplicateVersions: localSummary.duplicates.map((row) => row.version),
      remoteRows: remoteSummary?.rows.length ?? null,
      liveChecksReady: liveSummary ? `${liveSummary.readyCount}/${liveSummary.rows.length}` : null,
    }, null, 2))
  } else if (!args.has('--write')) {
    console.log(report)
  }

  if (remoteFetch && (!remoteFetch.migrationCommand.ok || !remoteFetch.liveCommand.ok)) {
    process.exitCode = 1
  }
}

main()
