#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = path.join('docs', 'supabase-migration-phase-7-canonical-ledger-repair-report.md')

const PHASE7_CANDIDATE = {
  version: '202607120003',
  module: 'canonical_documents',
  label: 'canonical document verification snapshot RPC',
  localFile: 'supabase/migrations/202607120003_canonical_document_verification_snapshot_scoped.sql',
  functionName: 'canonical_document_verification_snapshot',
  requiredEvidence: [
    'canonical_document_verification_snapshot_function',
    'canonical_document_verification_snapshot_signature',
    'canonical_document_verification_snapshot_bounded_call',
  ],
}

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
    apply: false,
    write: false,
    json: false,
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
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

function readMigrationFiles(repoRoot) {
  const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
  if (!existsSync(migrationsDir)) return []

  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const match = file.match(/^(\d{12,14})_(.+)\.sql$/)
      return {
        version: match?.[1] || file.split('_')[0],
        name: match?.[2] || file.replace(/\.sql$/, ''),
        file,
        path: path.join(migrationsDir, file),
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

function ledgerState(rows) {
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
  const splitSet = new Set(splitVersions)

  return {
    rows,
    matched,
    localOnly,
    remoteOnly,
    divergent,
    splitVersions,
    pureLocalOnly: localOnly.filter((row) => !splitSet.has(row.local)),
    pureRemoteOnly: remoteOnly.filter((row) => !splitSet.has(row.remote)),
    localListedVersions: new Set(rows.map((row) => row.local).filter(Boolean)),
    remoteAppliedVersions: new Set(rows.map((row) => row.remote).filter(Boolean)),
  }
}

function candidateLedgerState(state) {
  const version = PHASE7_CANDIDATE.version
  const inSplit = state.splitVersions.includes(version)
  return {
    localListed: state.localListedVersions.has(version),
    remoteApplied: state.remoteAppliedVersions.has(version),
    pureLocalOnly: state.pureLocalOnly.some((row) => row.local === version),
    inSplit,
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

function extractObjectsFromSql(repoRoot) {
  const migrationPath = path.join(repoRoot, PHASE7_CANDIDATE.localFile)
  const source = readFileSync(migrationPath, 'utf8')
  const objects = []
  const add = (objectType, objectName, relationName = '') => {
    const normalizedName = normalizeIdentifier(objectName)
    const normalizedRelation = normalizeIdentifier(relationName)
    if (!normalizedName) return
    objects.push({
      migrationVersion: PHASE7_CANDIDATE.version,
      migrationFile: path.basename(PHASE7_CANDIDATE.localFile),
      module: PHASE7_CANDIDATE.module,
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
  return [...unique.values()]
}

function sqlLiteral(value = '') {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function buildEvidenceSql(objects) {
  const objectRows = objects.map((object) => `    (${[
    object.migrationVersion,
    object.migrationFile,
    object.module,
    object.objectType,
    object.objectName,
    object.relationName,
  ].map(sqlLiteral).join(', ')})`)

  return `with expected(migration_version, migration_file, module, object_type, object_name, relation_name) as (
  values
${objectRows.join(',\n')}
),
object_checks as (
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
    end as ready,
    jsonb_build_object('relation_name', relation_name) as details
  from expected
),
function_checks as (
  select
    'canonical_document_verification_snapshot_function' as check_key,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'canonical_document_verification_snapshot'
    ) as ready,
    jsonb_build_object('function', 'public.canonical_document_verification_snapshot') as details
  union all
  select
    'canonical_document_verification_snapshot_signature' as check_key,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'canonical_document_verification_snapshot'
        and pg_get_function_identity_arguments(p.oid) = 'p_purpose text, p_transaction_id uuid, p_fixture text, p_max_rows integer'
        and p.prorettype = 'jsonb'::regtype
    ) as ready,
    jsonb_build_object('identity_arguments', 'p_purpose text, p_transaction_id uuid, p_fixture text, p_max_rows integer') as details
  union all
  select
    'canonical_document_verification_snapshot_bounded_call' as check_key,
    jsonb_typeof(public.canonical_document_verification_snapshot('canonical_staging_verification', null, null, 1)) = 'object' as ready,
    jsonb_build_object('purpose', 'canonical_staging_verification', 'max_rows', 1) as details
)
select
  'object:' || object_type || ':' || object_name as check_key,
  ready,
  details
from object_checks
union all
select check_key, ready, details
from function_checks
order by check_key;
`
}

function parseEvidenceRows(stdout) {
  const parsed = parseJsonLoose(stdout)
  const rows = extractRows(parsed, (item) => Object.prototype.hasOwnProperty.call(item, 'check_key'))

  return rows.map((row) => ({
    checkKey: String(getField(row, ['check_key', 'checkKey'])),
    ready: normalizeBool(getField(row, ['ready'])),
    details: getField(row, ['details']) || {},
  }))
}

function evidenceState(rows) {
  const missingRequired = PHASE7_CANDIDATE.requiredEvidence.filter((key) => !rows.find((row) => row.checkKey === key && row.ready))
  const failedObjects = rows.filter((row) => row.checkKey.startsWith('object:') && !row.ready).map((row) => row.checkKey)
  return {
    ready: missingRequired.length === 0 && failedObjects.length === 0,
    missingRequired,
    failedObjects,
    objectChecks: rows.filter((row) => row.checkKey.startsWith('object:')),
  }
}

function statusForRun({
  options,
  localExists,
  duplicates,
  evidence,
  beforeCandidate,
  repairCommand,
  afterCandidate,
  beforeCommand,
  evidenceCommand,
}) {
  if (!localExists) return 'BLOCKED_LOCAL_FILE'
  if (duplicates.length) return 'BLOCKED_DUPLICATES'
  if (!beforeCommand.ok || !evidenceCommand.ok) return 'REMOTE_CHECK_FAILED'
  if (!beforeCandidate.localListed && !beforeCandidate.remoteApplied) return 'BLOCKED_LEDGER_STATE'
  if (beforeCandidate.inSplit) return 'BLOCKED_SPLIT_ROW'
  if (!evidence.ready) return 'BLOCKED_EVIDENCE'
  if (!options.apply) return beforeCandidate.remoteApplied ? 'NOOP_ALREADY_REPAIRED' : 'PLAN_READY'
  if (beforeCandidate.remoteApplied) return 'NOOP_ALREADY_REPAIRED'
  if (!repairCommand) return 'REPAIR_SKIPPED'
  if (!repairCommand.ok) return 'REPAIR_FAILED'
  if (!afterCandidate.remoteApplied) return 'VERIFY_FAILED'
  return 'REPAIRED'
}

function recommendation(status) {
  if (status === 'REPAIRED') return 'Phase 7 repaired the canonical-document pilot ledger row. Refresh Phase 5 before choosing the next pure-local batch.'
  if (status === 'NOOP_ALREADY_REPAIRED') return 'No repair needed; the Phase 7 candidate is already recorded applied.'
  if (status === 'PLAN_READY') return 'Repair is ready. Run `npm run supabase:phase7` to mark only the canonical snapshot migration as applied.'
  if (status === 'BLOCKED_SPLIT_ROW') return 'Do not repair this candidate; it appears in the split ledger set.'
  if (status === 'BLOCKED_EVIDENCE') return 'Do not repair. Resolve missing canonical snapshot evidence first.'
  if (status === 'BLOCKED_LEDGER_STATE') return 'Do not repair. The candidate is not visible as local-only in the Supabase CLI ledger comparison.'
  if (status === 'BLOCKED_DUPLICATES') return 'Run Phase 4 again before continuing; duplicate local timestamps are present.'
  if (status === 'BLOCKED_LOCAL_FILE') return 'Restore the Phase 7 local migration file before continuing.'
  return 'Stop here and inspect command evidence.'
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
  localExists,
  duplicates,
  beforeCommand,
  evidenceCommand,
  repairCommand,
  afterCommand,
  beforeState,
  afterState,
  beforeCandidate,
  afterCandidate,
  evidence,
  evidenceRows,
  extractedObjects,
}) {
  const status = statusForRun({
    options,
    localExists,
    duplicates,
    evidence,
    beforeCandidate,
    repairCommand,
    afterCandidate,
    beforeCommand,
    evidenceCommand,
  })

  const lines = []
  lines.push('# Supabase Migration Phase 7 Canonical Ledger Repair Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Repo: ${repoRoot}`)
  lines.push('')
  lines.push('## Safety Scope')
  lines.push('')
  lines.push('Phase 7 is a single-candidate ledger repair for the canonical document verification snapshot migration. It only runs `supabase migration repair --status applied` for `202607120003` after proving the migration is pure local-only and the live RPC evidence passes. It does not run `db push`, `db reset`, schema migrations, or data-changing application SQL.')
  lines.push('')
  lines.push('## Decision')
  lines.push('')
  lines.push(markdownTable(
    ['Field', 'Value'],
    [
      ['Status', status],
      ['Recommendation', recommendation(status)],
      ['Apply mode', options.apply ? 'yes' : 'no'],
      ['Candidate version', PHASE7_CANDIDATE.version],
      ['Candidate module', PHASE7_CANDIDATE.module],
      ['Local migration files', files.length],
      ['Duplicate local timestamps', duplicates.length],
      ['Before ledger state', beforeCandidate.remoteApplied ? 'recorded applied' : beforeCandidate.pureLocalOnly ? 'pure local-only' : beforeCandidate.inSplit ? 'split row' : 'unexpected'],
      ['After ledger state', afterCandidate.remoteApplied ? 'recorded applied' : afterCandidate.pureLocalOnly ? 'pure local-only' : afterCandidate.inSplit ? 'split row' : 'unexpected'],
      ['Evidence ready', evidence.ready ? 'yes' : 'no'],
      ['Object checks', `${evidence.objectChecks.filter((row) => row.ready).length}/${evidence.objectChecks.length}`],
      ['Matched rows before', beforeState.matched.length],
      ['Matched rows after', afterState.matched.length],
      ['Pure local-only rows before', beforeState.pureLocalOnly.length],
      ['Pure local-only rows after', afterState.pureLocalOnly.length],
    ],
  ))
  lines.push('')
  lines.push('## Candidate Matrix')
  lines.push('')
  lines.push(markdownTable(
    ['Version', 'Module', 'Migration', 'Local File', 'Before', 'After', 'Evidence Keys'],
    [[
      PHASE7_CANDIDATE.version,
      PHASE7_CANDIDATE.module,
      PHASE7_CANDIDATE.label,
      localExists ? 'present' : 'missing',
      beforeCandidate.remoteApplied ? 'recorded applied' : beforeCandidate.pureLocalOnly ? 'pure local-only' : beforeCandidate.inSplit ? 'split row' : 'unexpected',
      afterCandidate.remoteApplied ? 'recorded applied' : afterCandidate.pureLocalOnly ? 'pure local-only' : afterCandidate.inSplit ? 'split row' : 'unexpected',
      PHASE7_CANDIDATE.requiredEvidence.join(', '),
    ]],
  ))
  lines.push('')
  lines.push('## Evidence Gate')
  lines.push('')
  lines.push(markdownTable(
    ['Gate', 'Status', 'Details'],
    [
      ['Local migration file', localExists ? 'PASS' : 'FAIL', PHASE7_CANDIDATE.localFile],
      ['Duplicate timestamps', duplicates.length ? 'FAIL' : 'PASS', duplicates.map((row) => `${row.version}: ${row.files.join(', ')}`).join('; ') || 'none'],
      ['Pure local-only ledger state', beforeCandidate.pureLocalOnly || beforeCandidate.remoteApplied ? 'PASS' : 'FAIL', beforeCandidate.remoteApplied ? 'already recorded applied' : beforeCandidate.pureLocalOnly ? 'pure local-only' : beforeCandidate.inSplit ? 'split row' : 'not visible as local-only'],
      ['Required live evidence', evidence.missingRequired.length ? 'FAIL' : 'PASS', evidence.missingRequired.join(', ') || 'all required evidence keys ready'],
      ['Static object evidence', evidence.failedObjects.length ? 'FAIL' : 'PASS', evidence.failedObjects.join(', ') || 'all static objects live'],
    ],
  ))
  lines.push('')
  lines.push('## Evidence Detail')
  lines.push('')
  lines.push(markdownTable(
    ['Check', 'Ready', 'Details'],
    evidenceRows.map((row) => [
      row.checkKey,
      row.ready ? 'yes' : 'no',
      typeof row.details === 'string' ? row.details : JSON.stringify(row.details),
    ]),
  ))
  lines.push('')
  lines.push('## Extracted Objects')
  lines.push('')
  lines.push(markdownTable(
    ['Type', 'Name', 'Relation'],
    extractedObjects.map((object) => [object.objectType, object.objectName, object.relationName || '']),
  ))
  lines.push('')
  lines.push('## Command Evidence')
  lines.push('')
  lines.push(markdownTable(
    ['Command', 'Status', 'Notes'],
    [
      [beforeCommand.command, beforeCommand.ok ? 'ok' : `failed (${beforeCommand.status ?? 'unknown'})`, commandNote(beforeCommand)],
      [evidenceCommand.command, evidenceCommand.ok ? 'ok' : `failed (${evidenceCommand.status ?? 'unknown'})`, commandNote(evidenceCommand)],
      [
        repairCommand?.command || 'migration repair not run',
        repairCommand ? (repairCommand.ok ? 'ok' : `failed (${repairCommand.status ?? 'unknown'})`) : 'skipped',
        repairCommand ? commandNote(repairCommand) : (options.apply ? 'repair gate blocked or already applied' : 'plan mode'),
      ],
      [afterCommand.command, afterCommand.ok ? 'ok' : `failed (${afterCommand.status ?? 'unknown'})`, commandNote(afterCommand)],
    ],
  ))
  lines.push('')
  lines.push('## Next Step')
  lines.push('')
  if (status === 'REPAIRED' || status === 'NOOP_ALREADY_REPAIRED') {
    lines.push('Regenerate Phase 5 so the pure local-only counts reflect the repaired canonical snapshot row, then choose the next smallest all-live pure-local batch with module smoke evidence.')
  } else if (status === 'PLAN_READY') {
    lines.push('Run `npm run supabase:phase7` from the repo root after reviewing this report.')
  } else {
    lines.push('Stop here and resolve the blocking evidence before touching the migration ledger.')
  }
  lines.push('')

  return { status, report: `${lines.join('\n')}\n` }
}

function printUsage() {
  console.log('Usage: node scripts/supabase-phase7-canonical-ledger-repair.mjs [--apply] [--write] [--json]')
  console.log('')
  console.log('Options:')
  console.log('  --apply  Run supabase migration repair --linked --status applied for the single Phase 7 candidate.')
  console.log('  --write  Write docs/supabase-migration-phase-7-canonical-ledger-repair-report.md.')
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
  const files = readMigrationFiles(repoRoot)
  const duplicates = duplicateVersions(files)
  const localExists = existsSync(path.join(repoRoot, PHASE7_CANDIDATE.localFile))
  const extractedObjects = localExists ? extractObjectsFromSql(repoRoot) : []

  const beforeCommand = runSupabase(repoRoot, ['migration', 'list', '--linked', '--output-format', 'json'])
  const beforeState = ledgerState(beforeCommand.ok ? parseMigrationRows(beforeCommand.stdout) : [])
  const beforeCandidate = candidateLedgerState(beforeState)

  const evidenceSqlPath = path.join(os.tmpdir(), `supabase-phase7-canonical-evidence-${process.pid}.sql`)
  writeFileSync(evidenceSqlPath, buildEvidenceSql(extractedObjects))
  const evidenceCommand = runSupabase(repoRoot, ['db', 'query', '--linked', '--file', evidenceSqlPath, '--output-format', 'json'])
  const evidenceRows = evidenceCommand.ok ? parseEvidenceRows(evidenceCommand.stdout) : []
  const evidence = evidenceState(evidenceRows)

  let repairCommand = null
  if (
    options.apply
    && localExists
    && duplicates.length === 0
    && beforeCommand.ok
    && evidenceCommand.ok
    && evidence.ready
    && beforeCandidate.pureLocalOnly
    && !beforeCandidate.inSplit
    && !beforeCandidate.remoteApplied
  ) {
    repairCommand = runSupabase(repoRoot, [
      'migration',
      'repair',
      '--linked',
      '--status',
      'applied',
      PHASE7_CANDIDATE.version,
    ])
  }

  const afterCommand = runSupabase(repoRoot, ['migration', 'list', '--linked', '--output-format', 'json'])
  const afterState = ledgerState(afterCommand.ok ? parseMigrationRows(afterCommand.stdout) : [])
  const afterCandidate = candidateLedgerState(afterState)

  const { status, report } = generateReport({
    repoRoot,
    generatedAt,
    options,
    files,
    localExists,
    duplicates,
    beforeCommand,
    evidenceCommand,
    repairCommand,
    afterCommand,
    beforeState,
    afterState,
    beforeCandidate,
    afterCandidate,
    evidence,
    evidenceRows,
    extractedObjects,
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
      candidateVersion: PHASE7_CANDIDATE.version,
      candidateModule: PHASE7_CANDIDATE.module,
      duplicateVersions: duplicates.map((row) => row.version),
      beforeCandidate,
      afterCandidate,
      evidenceReady: evidence.ready,
      missingRequired: evidence.missingRequired,
      failedObjects: evidence.failedObjects,
      matchedRowsBefore: beforeState.matched.length,
      matchedRowsAfter: afterState.matched.length,
      pureLocalOnlyBefore: beforeState.pureLocalOnly.length,
      pureLocalOnlyAfter: afterState.pureLocalOnly.length,
    }, null, 2))
  } else if (!options.write) {
    console.log(report)
  }

  if (
    status === 'BLOCKED_LOCAL_FILE'
    || status === 'BLOCKED_DUPLICATES'
    || status === 'BLOCKED_LEDGER_STATE'
    || status === 'BLOCKED_SPLIT_ROW'
    || status === 'BLOCKED_EVIDENCE'
    || status === 'REMOTE_CHECK_FAILED'
    || status === 'REPAIR_FAILED'
    || status === 'VERIFY_FAILED'
  ) {
    process.exitCode = 1
  }
}

main()
