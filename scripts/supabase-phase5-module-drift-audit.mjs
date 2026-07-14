#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = path.join('docs', 'supabase-migration-phase-5-module-drift-report.md')

const MODULE_RULES = [
  ['bond_finance', /(?:^|_)(?:bond|finance|originator|bank|commission|revenue)(?:_|$)/],
  ['commercial', /(?:^|_)(?:commercial|landlord|vacanc[a-z]*|brokerage|broker|mandate|viewing|asset)(?:_|$)/],
  ['developer_referral', /(?:^|_)(?:developer|development|referral|preferred_partner)(?:_|$)/],
  ['lead_capture_crm', /(?:^|_)(?:lead|crm|contact|capture|alias|parser|enquiry|canvassing|listing|private_listing|seller_portal|seller|offer)(?:_|$)/],
  ['notification_automation', /(?:^|_)(?:notification|automation|reminder|communication_delivery|email)(?:_|$)/],
  ['transaction_network', /(?:^|_)(?:transaction|invite|partner|participant|client_invite|partner_invite|partner_portal|routing|assignment|connection|network)(?:_|$)/],
  ['canonical_documents', /(?:^|_)(?:canonical|document|packet|template|legal_template|requirement)(?:_|$)/],
  ['attorney', /(?:^|_)(?:attorney|matter|transfer|conveyancer|firm)(?:_|$)/],
  ['workspace_platform', /(?:^|_)(?:workspace|onboarding|signup|organisation|organization|profile|avatar|settings|entitlement|billing|module|hierarchy|arch9|hq|demo|admin)(?:_|$)/],
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
    fetchRemote: false,
    write: false,
    json: false,
  }

  for (const arg of argv) {
    if (arg === '--fetch-remote') {
      options.fetchRemote = true
    } else if (arg === '--write') {
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

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeVersion(value) {
  const match = String(value || '').match(/\b\d{12,14}\b/)
  return match?.[0] || ''
}

function normalizeBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return ['1', 't', 'true', 'yes'].includes(value.toLowerCase())
  return false
}

function readMigrationFiles(repoRoot) {
  const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
  if (!existsSync(migrationsDir)) return []

  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const match = file.match(/^(\d{12,14})_(.+)\.sql$/)
      const version = match?.[1] || file.split('_')[0]
      const name = match?.[2] || file.replace(/\.sql$/, '')
      return {
        version,
        name,
        file,
        path: path.join(migrationsDir, file),
        module: classifyModule(name),
      }
    })
}

function classifyModule(name = '') {
  const normalized = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
  for (const [moduleName, pattern] of MODULE_RULES) {
    if (pattern.test(normalized)) return moduleName
  }
  return 'other'
}

function duplicateVersions(files) {
  const byVersion = new Map()
  for (const file of files) {
    const entries = byVersion.get(file.version) || []
    entries.push(file.file)
    byVersion.set(file.version, entries)
  }

  return [...byVersion.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([version, entries]) => ({ version, files: entries }))
    .sort((a, b) => a.version.localeCompare(b.version))
}

function parseJsonLoose(text) {
  const trimmed = normalizeText(text)
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    const firstArray = trimmed.indexOf('[')
    const firstObject = trimmed.indexOf('{')
    const firstJson = [firstArray, firstObject].filter((index) => index >= 0).sort((a, b) => a - b)[0]
    if (firstJson === undefined) return null

    try {
      return JSON.parse(trimmed.slice(firstJson))
    } catch {
      return null
    }
  }
}

function collectArrays(value, predicate, matches = []) {
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === 'object' && predicate(item))) matches.push(value)
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
  return collectArrays(parsed, predicate).sort((a, b) => b.length - a.length)[0] || []
}

function getField(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name]
  }

  const keys = Object.keys(row).reduce((map, key) => {
    map.set(key.toLowerCase(), key)
    return map
  }, new Map())

  for (const name of names) {
    const realKey = keys.get(name.toLowerCase())
    if (realKey) return row[realKey]
  }

  return undefined
}

function parseMigrationRows(stdout) {
  const parsed = parseJsonLoose(stdout)
  const rows = extractRows(parsed, (item) => {
    return ['local', 'remote', 'local_version', 'remote_version', 'version'].some((key) => {
      return Object.prototype.hasOwnProperty.call(item, key)
    })
  })

  return rows
    .map((row) => ({
      local: normalizeVersion(getField(row, ['local', 'local_version', 'localVersion', 'LOCAL'])),
      remote: normalizeVersion(getField(row, ['remote', 'remote_version', 'remoteVersion', 'REMOTE'])),
      raw: row,
    }))
    .filter((row) => row.local || row.remote)
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

function commandNote(command) {
  const note = command.stderr.trim() || command.error || command.stdout.trim() || 'none'
  return note.length > 700 ? `${note.slice(0, 700)}...` : note
}

function ledgerBuckets(rows) {
  const matched = []
  const localOnly = []
  const remoteOnly = []
  const divergent = []

  // Supabase CLI can emit the same version as two separate rows when a longer
  // timestamp sorts between its local and remote entries, for example:
  //
  //   remote 202606010001
  //   local+remote 20260601000101
  //   local  202606010001
  //
  // Compare version presence across the complete result instead of treating
  // each display row as authoritative. Otherwise a fully matched version is
  // incorrectly reported as both local-only and remote-only.
  const localVersions = new Set(rows.map((row) => row.local).filter(Boolean))
  const remoteVersions = new Set(rows.map((row) => row.remote).filter(Boolean))
  const matchedVersions = new Set(
    [...localVersions].filter((version) => remoteVersions.has(version)),
  )
  const matchedSeen = new Set()

  for (const row of rows) {
    const version = row.local || row.remote
    if (version && matchedVersions.has(version)) {
      if (!matchedSeen.has(version)) {
        matched.push({ ...row, local: version, remote: version })
        matchedSeen.add(version)
      }
    }
    else if (row.local && row.remote) divergent.push(row)
    else if (row.local) localOnly.push(row)
    else if (row.remote) remoteOnly.push(row)
  }

  return {
    matched,
    localOnly,
    remoteOnly,
    divergent,
    splitVersions: [],
    pureLocalOnly: localOnly,
    pureRemoteOnly: remoteOnly,
  }
}

function extractObjectsFromSql(migration, repoRoot) {
  const source = readFileSync(migration.path, 'utf8')
  const objects = []
  const add = (objectType, objectName, relationName = '') => {
    const normalizedName = normalizeIdentifier(objectName)
    const normalizedRelation = normalizeIdentifier(relationName)
    if (!normalizedName) return
    objects.push({
      migrationVersion: migration.version,
      migrationFile: migration.file,
      module: migration.module,
      objectType,
      objectName: normalizedName,
      relationName: normalizedRelation,
    })
  }

  matchAll(source, /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('table', name))
  matchAll(source, /\bcreate\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('view', name))
  matchAll(source, /\bcreate\s+(?:or\s+replace\s+)?materialized\s+view\s+(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('view', name))
  matchAll(source, /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(/gi, ([, name]) => add('function', name))
  matchAll(source, /\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('index', name))
  matchAll(source, /\badd\s+constraint\s+([a-zA-Z_][\w]*)/gi, ([, name]) => add('constraint', name))
  matchAll(source, /\bcreate\s+trigger\s+([a-zA-Z_][\w]*)/gi, ([, name]) => add('trigger', name))
  matchAll(source, /\bcreate\s+policy\s+([a-zA-Z_][\w]*)\s+on\s+(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name, table]) => add('policy', name, table))
  matchAll(source, /\bcreate\s+type\s+(?:public\.)?([a-zA-Z_][\w]*)/gi, ([, name]) => add('type', name))

  const unique = new Map()
  for (const object of objects) {
    const key = [
      object.migrationVersion,
      object.objectType,
      object.objectName,
      object.relationName,
    ].join('|')
    unique.set(key, object)
  }

  return [...unique.values()].map((object) => ({
    ...object,
    migrationPath: path.relative(repoRoot, migration.path),
  }))
}

function matchAll(source, pattern, onMatch) {
  let match = pattern.exec(source)
  while (match) {
    onMatch(match)
    match = pattern.exec(source)
  }
}

function normalizeIdentifier(value = '') {
  return String(value || '').replace(/"/g, '').trim()
}

function sqlLiteral(value = '') {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function buildObjectCheckSql(objects) {
  const rows = objects.map((object) => `    (${[
    object.migrationVersion,
    object.migrationFile,
    object.module,
    object.objectType,
    object.objectName,
    object.relationName,
  ].map(sqlLiteral).join(', ')})`)

  return `with expected(migration_version, migration_file, module, object_type, object_name, relation_name) as (
  values
${rows.join(',\n')}
)
select
  migration_version,
  migration_file,
  module,
  object_type,
  object_name,
  relation_name,
  case object_type
    when 'table' then to_regclass('public.' || object_name) is not null
    when 'view' then to_regclass('public.' || object_name) is not null
    when 'index' then to_regclass('public.' || object_name) is not null
    when 'type' then exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = object_name
    )
    when 'function' then exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = object_name
    )
    when 'policy' then exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.policyname = object_name
        and (relation_name = '' or p.tablename = relation_name)
    )
    when 'constraint' then exists (
      select 1
      from pg_constraint c
      where c.conname = object_name
    )
    when 'trigger' then exists (
      select 1
      from pg_trigger t
      where t.tgname = object_name
        and not t.tgisinternal
    )
    else false
  end as live_exists
from expected
order by migration_version, migration_file, object_type, object_name;
`
}

function parseObjectRows(stdout) {
  const parsed = parseJsonLoose(stdout)
  const rows = extractRows(parsed, (item) => Object.prototype.hasOwnProperty.call(item, 'migration_version'))

  return rows.map((row) => ({
    migrationVersion: String(getField(row, ['migration_version', 'migrationVersion'])),
    migrationFile: String(getField(row, ['migration_file', 'migrationFile'])),
    module: String(getField(row, ['module'])),
    objectType: String(getField(row, ['object_type', 'objectType'])),
    objectName: String(getField(row, ['object_name', 'objectName'])),
    relationName: String(getField(row, ['relation_name', 'relationName']) || ''),
    liveExists: normalizeBool(getField(row, ['live_exists', 'liveExists'])),
  }))
}

function buildMigrationDrift({ files, buckets, objectRowsByFile, fetchRemote }) {
  const byVersion = new Map(files.map((file) => [file.version, file]))
  const splitSet = new Set(buckets.splitVersions)
  const localRows = [...buckets.localOnly]

  return localRows
    .map((row) => {
      const migration = byVersion.get(row.local)
      const objects = migration ? objectRowsByFile.get(migration.file) || [] : []
      const liveCount = objects.filter((object) => object.liveExists).length
      const objectStatus = !fetchRemote
        ? 'not_fetched'
        : objects.length === 0
          ? 'no_static_objects'
          : liveCount === objects.length
            ? 'all_live'
            : liveCount === 0
              ? 'none_live'
              : 'partial_live'

      return {
        version: row.local,
        file: migration?.file || '(missing local file)',
        module: migration?.module || 'unknown',
        bucket: splitSet.has(row.local) ? 'split_local_remote' : 'pure_local_only',
        objectCount: objects.length,
        liveCount,
        objectStatus,
      }
    })
    .sort((a, b) => {
      const moduleCompare = a.module.localeCompare(b.module)
      if (moduleCompare) return moduleCompare
      return a.version.localeCompare(b.version)
    })
}

function summarizeModules(driftRows) {
  const byModule = new Map()
  for (const row of driftRows) {
    const summary = byModule.get(row.module) || {
      module: row.module,
      pureLocalOnly: 0,
      splitRows: 0,
      allLive: 0,
      partialLive: 0,
      noneLive: 0,
      noStaticObjects: 0,
      notFetched: 0,
      files: [],
    }

    if (row.bucket === 'pure_local_only') summary.pureLocalOnly += 1
    if (row.bucket === 'split_local_remote') summary.splitRows += 1
    if (row.objectStatus === 'all_live') summary.allLive += 1
    if (row.objectStatus === 'partial_live') summary.partialLive += 1
    if (row.objectStatus === 'none_live') summary.noneLive += 1
    if (row.objectStatus === 'no_static_objects') summary.noStaticObjects += 1
    if (row.objectStatus === 'not_fetched') summary.notFetched += 1
    summary.files.push(row.file)
    byModule.set(row.module, summary)
  }

  return [...byModule.values()].sort((a, b) => {
    const aTotal = a.pureLocalOnly + a.splitRows
    const bTotal = b.pureLocalOnly + b.splitRows
    if (aTotal !== bTotal) return bTotal - aTotal
    return a.module.localeCompare(b.module)
  })
}

function moduleRecommendation(summary) {
  if (summary.splitRows > 0) {
    return 'Resolve split ledger rows before any module repair batch.'
  }
  if (summary.pureLocalOnly === 0) return 'No local-only work.'
  if (summary.allLive === summary.pureLocalOnly && summary.pureLocalOnly > 0) {
    return 'Candidate for reviewed ledger repair after module smoke evidence.'
  }
  if (summary.partialLive > 0 || summary.noneLive > 0) {
    return 'Needs object-level review; do not repair as a batch yet.'
  }
  return 'Needs module owner review; static objects were limited or not fetched.'
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

function generateReport({
  repoRoot,
  generatedAt,
  options,
  files,
  duplicates,
  migrationCommand,
  objectCommand,
  buckets,
  driftRows,
  moduleSummaries,
  extractedObjects,
  objectRows,
}) {
  const status = duplicates.length
    ? 'BLOCKED_DUPLICATES'
    : options.fetchRemote
      ? 'MODULE_AUDIT_READY'
      : 'LOCAL_PREFLIGHT'
  const repairCandidateRows = driftRows.filter((row) => {
    return row.bucket === 'pure_local_only' && row.objectStatus === 'all_live'
  })
  const rowsNeedingObjectReview = driftRows.filter((row) => {
    return row.bucket === 'pure_local_only' && ['partial_live', 'none_live'].includes(row.objectStatus)
  })

  const lines = []
  lines.push('# Supabase Migration Phase 5 Module Drift Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Repo: ${repoRoot}`)
  lines.push('')
  lines.push('## Safety Scope')
  lines.push('')
  lines.push('Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.')
  lines.push('')
  lines.push('## Decision')
  lines.push('')
  lines.push(markdownTable(
    ['Field', 'Value'],
    [
      ['Status', status],
      ['Local migration files', files.length],
      ['Duplicate local timestamps', duplicates.length],
      ['Remote ledger fetched', options.fetchRemote ? 'yes' : 'no'],
      ['Matched rows', options.fetchRemote ? buckets.matched.length : 'not fetched'],
      ['Split local/remote versions', options.fetchRemote ? buckets.splitVersions.length : 'not fetched'],
      ['Pure local-only rows', options.fetchRemote ? buckets.pureLocalOnly.length : 'not fetched'],
      ['Pure remote-only rows', options.fetchRemote ? buckets.pureRemoteOnly.length : 'not fetched'],
      ['Extracted objects checked', options.fetchRemote ? objectRows.length : 'not fetched'],
    ],
  ))
  lines.push('')
  lines.push('## Module Summary')
  lines.push('')
  if (moduleSummaries.length) {
    lines.push(markdownTable(
      ['Module', 'Pure Local-Only', 'Split Rows', 'All Live', 'Partial Live', 'None Live', 'No Static Objects', 'Recommendation'],
      moduleSummaries.map((summary) => [
        summary.module,
        summary.pureLocalOnly,
        summary.splitRows,
        summary.allLive,
        summary.partialLive,
        summary.noneLive,
        summary.noStaticObjects,
        moduleRecommendation(summary),
      ]),
    ))
  } else {
    lines.push('No module drift rows were available. Run `npm run supabase:phase5` to fetch the remote ledger.')
  }
  lines.push('')
  lines.push('## Split Ledger Rows')
  lines.push('')
  if (buckets.splitVersions.length) {
    lines.push('These versions appear as both local-only and remote-only in the Supabase CLI comparison. Treat them as ledger/tooling mismatches, not missing migrations:')
    lines.push('')
    lines.push(buckets.splitVersions.map((version) => `- ${version}`).join('\n'))
  } else {
    lines.push('No split local/remote versions detected.')
  }
  lines.push('')
  lines.push('## Reviewed Repair Candidates')
  lines.push('')
  if (repairCandidateRows.length) {
    lines.push('These pure local-only migrations have all statically extracted objects present in the live catalog. They are candidates for later reviewed ledger repair only after module smoke evidence:')
    lines.push('')
    lines.push(markdownTable(
      ['Version', 'Module', 'File', 'Objects Live'],
      repairCandidateRows.map((row) => [row.version, row.module, row.file, `${row.liveCount}/${row.objectCount}`]),
    ))
  } else {
    lines.push('No pure local-only migration is ready for repair from static object evidence alone.')
  }
  lines.push('')
  lines.push('## Needs Object Review')
  lines.push('')
  if (rowsNeedingObjectReview.length) {
    lines.push(markdownTable(
      ['Version', 'Module', 'File', 'Object Status', 'Objects Live'],
      rowsNeedingObjectReview.map((row) => [row.version, row.module, row.file, row.objectStatus, `${row.liveCount}/${row.objectCount}`]),
    ))
  } else {
    lines.push('No pure local-only migrations had partial or missing static object evidence.')
  }
  lines.push('')
  lines.push('## Local-Only Drift Detail')
  lines.push('')
  if (driftRows.length) {
    lines.push(markdownTable(
      ['Version', 'Bucket', 'Module', 'File', 'Object Status', 'Objects Live'],
      driftRows.map((row) => [
        row.version,
        row.bucket,
        row.module,
        row.file,
        row.objectStatus,
        row.objectCount ? `${row.liveCount}/${row.objectCount}` : 'n/a',
      ]),
    ))
  } else {
    lines.push('No local-only drift rows were available.')
  }
  lines.push('')
  lines.push('## Object Extraction')
  lines.push('')
  lines.push(markdownTable(
    ['Metric', 'Value'],
    [
      ['Static objects extracted', extractedObjects.length],
      ['Catalog rows returned', objectRows.length],
      ['Object check command', objectCommand ? (objectCommand.ok ? 'ok' : `failed (${objectCommand.status ?? 'unknown'})`) : 'not run'],
    ],
  ))
  lines.push('')
  lines.push('## Command Evidence')
  lines.push('')
  if (options.fetchRemote) {
    lines.push(markdownTable(
      ['Command', 'Status', 'Notes'],
      [
        [
          migrationCommand.command,
          migrationCommand.ok ? 'ok' : `failed (${migrationCommand.status ?? 'unknown'})`,
          commandNote(migrationCommand),
        ],
        [
          objectCommand?.command || 'object catalog check not run',
          objectCommand ? (objectCommand.ok ? 'ok' : `failed (${objectCommand.status ?? 'unknown'})`) : 'skipped',
          objectCommand ? commandNote(objectCommand) : 'no extracted objects',
        ],
      ],
    ))
  } else {
    lines.push('Remote commands were not run for this report.')
  }
  lines.push('')
  lines.push('## Next Step')
  lines.push('')
  if (status === 'MODULE_AUDIT_READY') {
    lines.push('Use this module matrix to choose the next small repair batch. Split ledger rows should be investigated before broad migration operations; pure local-only rows need module smoke evidence before any further `migration repair`.')
  } else if (status === 'BLOCKED_DUPLICATES') {
    lines.push('Run Phase 4 again before continuing; duplicate local timestamps are still present.')
  } else {
    lines.push('Run `npm run supabase:phase5` from the repo root to fetch the remote matrix.')
  }
  lines.push('')

  return { status, report: `${lines.join('\n')}\n` }
}

function printUsage() {
  console.log('Usage: node scripts/supabase-phase5-module-drift-audit.mjs [--fetch-remote] [--write] [--json]')
  console.log('')
  console.log('Options:')
  console.log('  --fetch-remote  Fetch linked Supabase migration list and run catalog-only object checks.')
  console.log('  --write         Write docs/supabase-migration-phase-5-module-drift-report.md.')
  console.log('  --json          Print a compact machine-readable summary.')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  const repoRoot = findRepoRoot(process.cwd())
  const generatedAt = new Date().toISOString()
  const files = readMigrationFiles(repoRoot)
  const duplicates = duplicateVersions(files)
  let migrationCommand = null
  let objectCommand = null
  let buckets = {
    matched: [],
    localOnly: [],
    remoteOnly: [],
    divergent: [],
    splitVersions: [],
    pureLocalOnly: [],
    pureRemoteOnly: [],
  }
  let extractedObjects = []
  let objectRows = []
  let driftRows = []
  let moduleSummaries = []

  if (options.fetchRemote) {
    migrationCommand = runSupabase(repoRoot, ['migration', 'list', '--linked', '--output-format', 'json'])
    const migrationRows = migrationCommand.ok ? parseMigrationRows(migrationCommand.stdout) : []
    buckets = ledgerBuckets(migrationRows)
    const localOnlyVersions = new Set(buckets.localOnly.map((row) => row.local))
    extractedObjects = files
      .filter((file) => localOnlyVersions.has(file.version))
      .flatMap((file) => extractObjectsFromSql(file, repoRoot))

    if (extractedObjects.length) {
      const tempSqlPath = path.join(os.tmpdir(), `supabase-phase5-object-checks-${process.pid}.sql`)
      writeFileSync(tempSqlPath, buildObjectCheckSql(extractedObjects))
      objectCommand = runSupabase(repoRoot, ['db', 'query', '--linked', '--file', tempSqlPath, '--output-format', 'json'])
      objectRows = objectCommand.ok ? parseObjectRows(objectCommand.stdout) : []
    }

    const objectRowsByFile = new Map()
    for (const row of objectRows) {
      const entries = objectRowsByFile.get(row.migrationFile) || []
      entries.push(row)
      objectRowsByFile.set(row.migrationFile, entries)
    }

    driftRows = buildMigrationDrift({ files, buckets, objectRowsByFile, fetchRemote: true })
    moduleSummaries = summarizeModules(driftRows)
  } else {
    driftRows = []
    moduleSummaries = []
  }

  const { status, report } = generateReport({
    repoRoot,
    generatedAt,
    options,
    files,
    duplicates,
    migrationCommand,
    objectCommand,
    buckets,
    driftRows,
    moduleSummaries,
    extractedObjects,
    objectRows,
  })

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
      matchedRows: buckets.matched.length,
      pureLocalOnlyRows: buckets.pureLocalOnly.length,
      pureRemoteOnlyRows: buckets.pureRemoteOnly.length,
      splitVersions: buckets.splitVersions.length,
      modules: moduleSummaries.map((summary) => ({
        module: summary.module,
        pureLocalOnly: summary.pureLocalOnly,
        splitRows: summary.splitRows,
        allLive: summary.allLive,
        partialLive: summary.partialLive,
        noneLive: summary.noneLive,
        noStaticObjects: summary.noStaticObjects,
      })),
    }, null, 2))
  } else if (!options.write) {
    console.log(report)
  }

  if (status === 'BLOCKED_DUPLICATES' || (options.fetchRemote && migrationCommand && !migrationCommand.ok)) {
    process.exitCode = 1
  }
}

main()
