#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = path.join('docs', 'supabase-migration-phase-6-split-ledger-investigation-report.md')

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

function normalizeMigrationName(value = '') {
  return String(value || '')
    .replace(/\.sql$/i, '')
    .replace(/^\d{12,14}_/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function classifyModule(name = '') {
  const normalized = normalizeMigrationName(name)
  for (const [moduleName, pattern] of MODULE_RULES) {
    if (pattern.test(normalized)) return moduleName
  }
  return 'other'
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
      const filePath = path.join(migrationsDir, file)
      const sql = readFileSync(filePath, 'utf8')
      return {
        version,
        name,
        file,
        path: filePath,
        module: classifyModule(name),
        localSqlHash: createHash('sha256').update(sql).digest('hex').slice(0, 16),
      }
    })
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

function ledgerBuckets(rows) {
  const matched = []
  const localOnly = []
  const remoteOnly = []
  const divergent = []

  for (const row of rows) {
    if (row.local && row.remote && row.local === row.remote) matched.push(row)
    else if (row.local && row.remote) divergent.push(row)
    else if (row.local) localOnly.push(row)
    else if (row.remote) remoteOnly.push(row)
  }

  const localOnlyVersions = new Set(localOnly.map((row) => row.local))
  const remoteOnlyVersions = new Set(remoteOnly.map((row) => row.remote))
  const splitVersions = [...localOnlyVersions].filter((version) => remoteOnlyVersions.has(version)).sort()

  return {
    matched,
    localOnly,
    remoteOnly,
    divergent,
    splitVersions,
  }
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
  if (!command) return 'not run'
  const note = command.stderr.trim() || command.error || command.stdout.trim() || 'none'
  return note.length > 700 ? `${note.slice(0, 700)}...` : note
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

function buildHistorySql(versions) {
  const rows = versions.map((version) => `    (${sqlLiteral(version)})`)

  return `with split_versions(version) as (
  values
${rows.join(',\n')}
)
select
  v.version,
  to_jsonb(sm) as ledger_row,
  coalesce(to_jsonb(sm)->>'name', '') as remote_name,
  case
    when jsonb_typeof(to_jsonb(sm)->'statements') = 'array'
      then jsonb_array_length(to_jsonb(sm)->'statements')
    else null
  end as statement_count,
  md5(coalesce(to_jsonb(sm)->>'statements', '')) as statement_hash
from split_versions v
left join supabase_migrations.schema_migrations sm
  on sm.version = v.version
order by v.version;
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

function parseHistoryRows(stdout) {
  const parsed = parseJsonLoose(stdout)
  const rows = extractRows(parsed, (item) => Object.prototype.hasOwnProperty.call(item, 'version'))

  return rows.map((row) => {
    const ledgerValue = getField(row, ['ledger_row', 'ledgerRow'])
    const ledgerRow = typeof ledgerValue === 'string'
      ? parseJsonLoose(ledgerValue) || {}
      : ledgerValue || {}
    const statementCount = getField(row, ['statement_count', 'statementCount'])

    return {
      version: String(getField(row, ['version'])),
      remoteHistoryFound: Boolean(ledgerRow && Object.keys(ledgerRow).length),
      remoteName: String(getField(row, ['remote_name', 'remoteName']) || getField(ledgerRow, ['name']) || ''),
      statementCount: statementCount === null || statementCount === undefined ? null : Number(statementCount),
      statementHash: String(getField(row, ['statement_hash', 'statementHash']) || ''),
      ledgerColumns: Object.keys(ledgerRow || {}).sort(),
    }
  })
}

function objectStatus(objects) {
  const objectCount = objects.length
  const liveCount = objects.filter((object) => object.liveExists).length
  if (objectCount === 0) return { objectStatus: 'no_static_objects', objectCount, liveCount }
  if (liveCount === objectCount) return { objectStatus: 'all_live', objectCount, liveCount }
  if (liveCount === 0) return { objectStatus: 'none_live', objectCount, liveCount }
  return { objectStatus: 'partial_live', objectCount, liveCount }
}

function remoteNameStatus(localName, remoteName, remoteHistoryFound) {
  if (!remoteHistoryFound) return 'remote_history_missing'
  if (!remoteName) return 'remote_name_unavailable'
  return normalizeMigrationName(localName) === normalizeMigrationName(remoteName)
    ? 'remote_name_matches'
    : 'remote_name_differs'
}

function splitDecision(row) {
  if (!row.remoteHistoryFound) return 'remote_history_missing'
  if (row.objectStatus === 'partial_live' || row.objectStatus === 'none_live') return 'object_review_required'
  if (row.objectStatus === 'no_static_objects') return 'manual_sql_review'
  if (row.remoteNameStatus === 'remote_name_differs') return 'metadata_name_drift'
  if (row.remoteNameStatus === 'remote_name_matches') return 'confirmed_live_split'
  return 'confirmed_live_name_unavailable'
}

function decisionRecommendation(decision) {
  if (decision === 'confirmed_live_split') return 'Do not repair; this split row is already recorded remote and its static objects are live.'
  if (decision === 'confirmed_live_name_unavailable') return 'Do not repair; static objects are live, but this project does not expose remote migration names.'
  if (decision === 'metadata_name_drift') return 'Do not repair as local-only; compare local filename with schema_migrations metadata.'
  if (decision === 'manual_sql_review') return 'Manual SQL review needed because no static catalog objects were extracted.'
  if (decision === 'object_review_required') return 'Do not batch repair; inspect missing/partial objects first.'
  if (decision === 'remote_history_missing') return 'Stop; CLI reported a remote split row but schema_migrations did not return it.'
  return 'Review manually.'
}

function buildSplitRows({ splitVersions, files, historyRows, objectRowsByVersion }) {
  const filesByVersion = new Map(files.map((file) => [file.version, file]))
  const historyByVersion = new Map(historyRows.map((row) => [row.version, row]))

  return splitVersions.map((version) => {
    const migration = filesByVersion.get(version)
    const history = historyByVersion.get(version) || {
      version,
      remoteHistoryFound: false,
      remoteName: '',
      statementCount: null,
      statementHash: '',
      ledgerColumns: [],
    }
    const objects = objectRowsByVersion.get(version) || []
    const status = objectStatus(objects)
    const nameStatus = remoteNameStatus(migration?.name || '', history.remoteName, history.remoteHistoryFound)
    const row = {
      version,
      module: migration?.module || 'unknown',
      localFile: migration?.file || '(missing local file)',
      localName: migration?.name || '',
      localSqlHash: migration?.localSqlHash || '',
      remoteHistoryFound: history.remoteHistoryFound,
      remoteName: history.remoteName,
      remoteNameStatus: nameStatus,
      statementCount: history.statementCount,
      statementHash: history.statementHash,
      ledgerColumns: history.ledgerColumns,
      ...status,
    }
    return {
      ...row,
      decision: splitDecision(row),
    }
  })
}

function summarizeModules(splitRows) {
  const byModule = new Map()
  for (const row of splitRows) {
    const summary = byModule.get(row.module) || {
      module: row.module,
      splitRows: 0,
      allLive: 0,
      partialLive: 0,
      noneLive: 0,
      noStaticObjects: 0,
      nameMatches: 0,
      nameDiffers: 0,
      nameUnavailable: 0,
      objectReviewRequired: 0,
      manualSqlReview: 0,
    }

    summary.splitRows += 1
    if (row.objectStatus === 'all_live') summary.allLive += 1
    if (row.objectStatus === 'partial_live') summary.partialLive += 1
    if (row.objectStatus === 'none_live') summary.noneLive += 1
    if (row.objectStatus === 'no_static_objects') summary.noStaticObjects += 1
    if (row.remoteNameStatus === 'remote_name_matches') summary.nameMatches += 1
    if (row.remoteNameStatus === 'remote_name_differs') summary.nameDiffers += 1
    if (row.remoteNameStatus === 'remote_name_unavailable') summary.nameUnavailable += 1
    if (row.decision === 'object_review_required') summary.objectReviewRequired += 1
    if (row.decision === 'manual_sql_review') summary.manualSqlReview += 1
    byModule.set(row.module, summary)
  }

  return [...byModule.values()].sort((a, b) => {
    if (a.splitRows !== b.splitRows) return b.splitRows - a.splitRows
    return a.module.localeCompare(b.module)
  })
}

function statusForRun({ options, duplicates, migrationCommand, historyCommand, objectCommand, splitRows }) {
  if (duplicates.length) return 'BLOCKED_DUPLICATES'
  if (!options.fetchRemote) return 'LOCAL_PREFLIGHT'
  if (!migrationCommand?.ok || !historyCommand?.ok || (objectCommand && !objectCommand.ok)) return 'REMOTE_CHECK_FAILED'
  if (splitRows.length === 0) return 'NO_SPLIT_ROWS'
  if (splitRows.some((row) => ['remote_history_missing', 'object_review_required'].includes(row.decision))) {
    return 'SPLIT_REVIEW_REQUIRED'
  }
  return 'SPLIT_BASELINE_READY'
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

function countRows(rows, predicate) {
  return rows.filter(predicate).length
}

function generateReport({
  repoRoot,
  generatedAt,
  options,
  files,
  duplicates,
  migrationCommand,
  historyCommand,
  objectCommand,
  buckets,
  splitRows,
  moduleSummaries,
  extractedObjects,
  objectRows,
}) {
  const status = statusForRun({
    options,
    duplicates,
    migrationCommand,
    historyCommand,
    objectCommand,
    splitRows,
  })
  const objectReviewRows = splitRows.filter((row) => row.decision === 'object_review_required')
  const metadataRows = splitRows.filter((row) => row.decision === 'metadata_name_drift')
  const manualRows = splitRows.filter((row) => row.decision === 'manual_sql_review')

  const lines = []
  lines.push('# Supabase Migration Phase 6 Split Ledger Investigation Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Repo: ${repoRoot}`)
  lines.push('')
  lines.push('## Safety Scope')
  lines.push('')
  lines.push('Phase 6 is read-only. It investigates split local/remote migration versions from Phase 5, checks the live catalog for objects declared by those local migration files, and reads `supabase_migrations.schema_migrations` metadata. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.')
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
      ['Split versions investigated', options.fetchRemote ? splitRows.length : 'not fetched'],
      ['All static objects live', countRows(splitRows, (row) => row.objectStatus === 'all_live')],
      ['Partial static objects live', countRows(splitRows, (row) => row.objectStatus === 'partial_live')],
      ['No static objects extracted', countRows(splitRows, (row) => row.objectStatus === 'no_static_objects')],
      ['Remote migration names matched', countRows(splitRows, (row) => row.remoteNameStatus === 'remote_name_matches')],
      ['Remote migration names unavailable', countRows(splitRows, (row) => row.remoteNameStatus === 'remote_name_unavailable')],
      ['Static objects checked', options.fetchRemote ? objectRows.length : 'not fetched'],
    ],
  ))
  lines.push('')
  lines.push('## Module Summary')
  lines.push('')
  if (moduleSummaries.length) {
    lines.push(markdownTable(
      ['Module', 'Split Rows', 'All Live', 'Partial Live', 'None Live', 'No Static Objects', 'Name Matches', 'Name Unavailable', 'Review Required'],
      moduleSummaries.map((summary) => [
        summary.module,
        summary.splitRows,
        summary.allLive,
        summary.partialLive,
        summary.noneLive,
        summary.noStaticObjects,
        summary.nameMatches,
        summary.nameUnavailable,
        summary.objectReviewRequired + summary.manualSqlReview,
      ]),
    ))
  } else {
    lines.push('No split rows were available. Run `npm run supabase:phase6` to fetch the remote ledger.')
  }
  lines.push('')
  lines.push('## Object Review Required')
  lines.push('')
  if (objectReviewRows.length) {
    lines.push(markdownTable(
      ['Version', 'Module', 'Local File', 'Object Status', 'Objects Live', 'Recommendation'],
      objectReviewRows.map((row) => [
        row.version,
        row.module,
        row.localFile,
        row.objectStatus,
        `${row.liveCount}/${row.objectCount}`,
        decisionRecommendation(row.decision),
      ]),
    ))
  } else {
    lines.push('No split rows had partial or missing static object evidence.')
  }
  lines.push('')
  lines.push('## Manual SQL Review')
  lines.push('')
  if (manualRows.length) {
    lines.push(markdownTable(
      ['Version', 'Module', 'Local File', 'Reason', 'Recommendation'],
      manualRows.map((row) => [
        row.version,
        row.module,
        row.localFile,
        row.objectStatus,
        decisionRecommendation(row.decision),
      ]),
    ))
  } else {
    lines.push('No split rows required manual SQL review because of empty static object extraction.')
  }
  lines.push('')
  lines.push('## Metadata Name Drift')
  lines.push('')
  if (metadataRows.length) {
    lines.push(markdownTable(
      ['Version', 'Module', 'Local Name', 'Remote Name', 'Recommendation'],
      metadataRows.map((row) => [
        row.version,
        row.module,
        row.localName,
        row.remoteName,
        decisionRecommendation(row.decision),
      ]),
    ))
  } else {
    lines.push('No split row exposed a remote migration name that differed from the local file name.')
  }
  lines.push('')
  lines.push('## Split Row Detail')
  lines.push('')
  if (splitRows.length) {
    lines.push(markdownTable(
      ['Version', 'Module', 'Local File', 'Remote Name', 'Name Status', 'Object Status', 'Objects Live', 'Statements', 'Decision'],
      splitRows.map((row) => [
        row.version,
        row.module,
        row.localFile,
        row.remoteName || 'unavailable',
        row.remoteNameStatus,
        row.objectStatus,
        row.objectCount ? `${row.liveCount}/${row.objectCount}` : 'n/a',
        row.statementCount === null ? 'unavailable' : row.statementCount,
        row.decision,
      ]),
    ))
  } else {
    lines.push('No split local/remote versions were available.')
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
      ['History metadata command', historyCommand ? (historyCommand.ok ? 'ok' : `failed (${historyCommand.status ?? 'unknown'})`) : 'not run'],
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
          historyCommand?.command || 'history metadata check not run',
          historyCommand ? (historyCommand.ok ? 'ok' : `failed (${historyCommand.status ?? 'unknown'})`) : 'skipped',
          commandNote(historyCommand),
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
  if (status === 'SPLIT_REVIEW_REQUIRED') {
    lines.push('Exclude split rows from any ledger repair batch. Review the object-review/manual rows first, then continue with small pure-local-only batches from Phase 5 that have module smoke evidence.')
  } else if (status === 'SPLIT_BASELINE_READY') {
    lines.push('Treat split rows as already remote-recorded and leave them out of repair batches. Continue with the smallest pure-local-only module batch that has live-object and smoke-test evidence.')
  } else if (status === 'LOCAL_PREFLIGHT') {
    lines.push('Run `npm run supabase:phase6` from the repo root to fetch the remote split-row evidence.')
  } else if (status === 'BLOCKED_DUPLICATES') {
    lines.push('Run Phase 4 again before continuing; duplicate local timestamps are still present.')
  } else {
    lines.push('Inspect failed command evidence before continuing.')
  }
  lines.push('')

  return { status, report: `${lines.join('\n')}\n` }
}

function printUsage() {
  console.log('Usage: node scripts/supabase-phase6-split-ledger-investigation.mjs [--fetch-remote] [--write] [--json]')
  console.log('')
  console.log('Options:')
  console.log('  --fetch-remote  Fetch linked Supabase migration list and run read-only split-row checks.')
  console.log('  --write         Write docs/supabase-migration-phase-6-split-ledger-investigation-report.md.')
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
  let historyCommand = null
  let objectCommand = null
  let buckets = {
    matched: [],
    localOnly: [],
    remoteOnly: [],
    divergent: [],
    splitVersions: [],
  }
  let extractedObjects = []
  let objectRows = []
  let historyRows = []
  let splitRows = []
  let moduleSummaries = []

  if (options.fetchRemote) {
    migrationCommand = runSupabase(repoRoot, ['migration', 'list', '--linked', '--output-format', 'json'])
    const migrationRows = migrationCommand.ok ? parseMigrationRows(migrationCommand.stdout) : []
    buckets = ledgerBuckets(migrationRows)

    const filesByVersion = new Map(files.map((file) => [file.version, file]))
    const splitMigrations = buckets.splitVersions.map((version) => filesByVersion.get(version)).filter(Boolean)
    extractedObjects = splitMigrations.flatMap((file) => extractObjectsFromSql(file, repoRoot))

    if (buckets.splitVersions.length) {
      const historySqlPath = path.join(os.tmpdir(), `supabase-phase6-history-${process.pid}.sql`)
      writeFileSync(historySqlPath, buildHistorySql(buckets.splitVersions))
      historyCommand = runSupabase(repoRoot, ['db', 'query', '--linked', '--file', historySqlPath, '--output-format', 'json'])
      historyRows = historyCommand.ok ? parseHistoryRows(historyCommand.stdout) : []
    }

    if (extractedObjects.length) {
      const objectSqlPath = path.join(os.tmpdir(), `supabase-phase6-object-checks-${process.pid}.sql`)
      writeFileSync(objectSqlPath, buildObjectCheckSql(extractedObjects))
      objectCommand = runSupabase(repoRoot, ['db', 'query', '--linked', '--file', objectSqlPath, '--output-format', 'json'])
      objectRows = objectCommand.ok ? parseObjectRows(objectCommand.stdout) : []
    }

    const objectRowsByVersion = new Map()
    for (const row of objectRows) {
      const entries = objectRowsByVersion.get(row.migrationVersion) || []
      entries.push(row)
      objectRowsByVersion.set(row.migrationVersion, entries)
    }

    splitRows = buildSplitRows({
      splitVersions: buckets.splitVersions,
      files,
      historyRows,
      objectRowsByVersion,
    })
    moduleSummaries = summarizeModules(splitRows)
  }

  const { status, report } = generateReport({
    repoRoot,
    generatedAt,
    options,
    files,
    duplicates,
    migrationCommand,
    historyCommand,
    objectCommand,
    buckets,
    splitRows,
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
      splitVersions: buckets.splitVersions.length,
      matchedRows: buckets.matched.length,
      splitRows: splitRows.map((row) => ({
        version: row.version,
        module: row.module,
        objectStatus: row.objectStatus,
        remoteNameStatus: row.remoteNameStatus,
        decision: row.decision,
      })),
      modules: moduleSummaries,
    }, null, 2))
  } else if (!options.write) {
    console.log(report)
  }

  if (
    status === 'BLOCKED_DUPLICATES'
    || status === 'REMOTE_CHECK_FAILED'
    || (options.fetchRemote && migrationCommand && !migrationCommand.ok)
  ) {
    process.exitCode = 1
  }
}

main()
