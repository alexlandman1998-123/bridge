#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = path.join('docs', 'supabase-migration-phase-3-ledger-repair-report.md')
const LIVE_OBJECT_SQL_PATH = path.join('sql', 'supabase-phase1-live-object-checks.sql')
const BEHAVIOR_SQL_PATH = path.join('sql', 'supabase-phase2-onboarding-behavior-checks.sql')

const PHASE3_CANDIDATES = [
  {
    version: '202606170002',
    label: 'principal claim invite RPC',
    localFile: 'supabase/migrations/202606170002_principal_claim_invites.sql',
    evidence: ['principal_claim_invite_rpc', 'invites_principal_claim_type_constraint'],
  },
  {
    version: '202606170003',
    label: 'principal claim completion RPC',
    localFile: 'supabase/migrations/202606170003_principal_claim_completion.sql',
    evidence: [
      'principal_claim_completion_rpc',
      'principal_claim_sync_trigger_function',
      'principal_claim_sync_trigger',
      'workspace_preference_principal_claim_source_constraint',
    ],
  },
  {
    version: '202606190001',
    label: 'email-claim onboarding repair',
    localFile: 'supabase/migrations/202606190001_repair_workspace_onboarding_email_claim.sql',
    evidence: ['workspace_repair_email_claim_function'],
  },
  {
    version: '202607020002',
    label: 'principal-claim invite RLS hardening',
    localFile: 'supabase/migrations/202607020002_harden_invites_insert_rls.sql',
    evidence: ['invites_insert_workspace_admin_policy', 'invites_insert_member_fallback_policy'],
  },
  {
    version: '202607120002',
    label: 'branch-scope onboarding fix',
    localFile: 'supabase/migrations/202607120002_fix_workspace_onboarding_branch_scope.sql',
    evidence: ['workspace_onboarding_branch_scope_fix'],
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

function parseMigrationRows(stdout) {
  const parsed = parseJsonLoose(stdout)
  const jsonRows = extractRows(parsed, (item) => {
    return ['local', 'remote', 'local_version', 'remote_version', 'version'].some((key) => {
      return Object.prototype.hasOwnProperty.call(item, key)
    })
  })

  if (jsonRows.length) {
    return jsonRows
      .map((row) => ({
        local: normalizeVersion(getField(row, ['local', 'local_version', 'localVersion', 'LOCAL'])),
        remote: normalizeVersion(getField(row, ['remote', 'remote_version', 'remoteVersion', 'REMOTE'])),
        raw: row,
      }))
      .filter((row) => row.local || row.remote)
  }

  return stdout
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
      return { local: first || '', remote: second || '', raw: line }
    })
    .filter((row) => row.local || row.remote)
}

function parseCheckRows(stdout) {
  const parsed = parseJsonLoose(stdout)
  const rows = extractRows(parsed, (item) => Object.prototype.hasOwnProperty.call(item, 'check_key'))

  return rows.map((row) => ({
    checkKey: String(getField(row, ['check_key', 'checkKey'])),
    ready: normalizeBool(getField(row, ['ready'])),
    details: String(getField(row, ['details']) || ''),
    raw: row,
  }))
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

function localCandidateChecks(repoRoot) {
  return PHASE3_CANDIDATES.map((candidate) => {
    const filePath = path.join(repoRoot, candidate.localFile)
    return {
      ...candidate,
      localExists: existsSync(filePath),
    }
  })
}

function duplicateLocalVersions(repoRoot) {
  const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
  if (!existsSync(migrationsDir)) return []

  const byVersion = new Map()
  for (const file of readdirSync(migrationsDir).filter((item) => item.endsWith('.sql'))) {
    const version = file.split('_')[0]
    const entries = byVersion.get(version) || []
    entries.push(file)
    byVersion.set(version, entries)
  }

  return [...byVersion.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([version, files]) => ({ version, files }))
    .sort((a, b) => a.version.localeCompare(b.version))
}

function ledgerState(rows) {
  return {
    rows,
    remoteAppliedVersions: new Set(rows.map((row) => row.remote).filter(Boolean)),
    localListedVersions: new Set(rows.map((row) => row.local).filter(Boolean)),
  }
}

function candidateState(candidate, state) {
  return {
    ...candidate,
    localListed: state.localListedVersions.has(candidate.version),
    remoteApplied: state.remoteAppliedVersions.has(candidate.version),
  }
}

function allEvidenceReady(liveRows, behaviorRows) {
  const rows = [...liveRows, ...behaviorRows]
  const byKey = new Map(rows.map((row) => [row.checkKey, row]))

  const missing = []
  for (const candidate of PHASE3_CANDIDATES) {
    for (const key of candidate.evidence) {
      if (!byKey.get(key)?.ready) missing.push(`${candidate.version}:${key}`)
    }
  }

  const failedBehavior = behaviorRows.filter((row) => !row.ready).map((row) => row.checkKey)
  return {
    ready: missing.length === 0 && failedBehavior.length === 0,
    missing,
    failedBehavior,
  }
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

function statusForRun({ options, localChecks, evidence, repairCommand, beforeCandidates, afterCandidates }) {
  if (localChecks.some((row) => !row.localExists)) return 'BLOCKED_LOCAL_FILES'
  if (!evidence.ready) return 'BLOCKED_EVIDENCE'
  if (!options.apply) return beforeCandidates.every((row) => row.remoteApplied) ? 'NOOP_ALREADY_REPAIRED' : 'PLAN_READY'
  if (!repairCommand) return 'NOOP_ALREADY_REPAIRED'
  if (!repairCommand.ok) return 'REPAIR_FAILED'
  if (afterCandidates.some((row) => !row.remoteApplied)) return 'VERIFY_FAILED'
  return 'REPAIRED'
}

function recommendation(status) {
  if (status === 'REPAIRED') return 'Phase 3 ledger repair is complete for onboarding-critical migrations. Rerun Phase 1 and Phase 2 as the final evidence refresh.'
  if (status === 'NOOP_ALREADY_REPAIRED') return 'No repair was needed; all Phase 3 candidates are already recorded applied.'
  if (status === 'PLAN_READY') return 'Repair is ready. Run `npm run supabase:phase3` to mark only the verified-live onboarding migrations as applied.'
  if (status === 'BLOCKED_EVIDENCE') return 'Do not repair the ledger. Rerun/fix Phase 2 evidence first.'
  if (status === 'BLOCKED_LOCAL_FILES') return 'Do not repair the ledger. Restore the missing local migration file(s) first.'
  return 'Do not continue. Inspect command evidence and repair manually only after review.'
}

function generateReport({
  repoRoot,
  generatedAt,
  options,
  localChecks,
  duplicates,
  liveCommand,
  behaviorCommand,
  beforeCommand,
  repairCommand,
  afterCommand,
  beforeCandidates,
  afterCandidates,
  evidence,
  neededVersions,
}) {
  const status = statusForRun({
    options,
    localChecks,
    evidence,
    repairCommand,
    beforeCandidates,
    afterCandidates,
  })

  const lines = []
  lines.push('# Supabase Migration Phase 3 Ledger Repair Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Repo: ${repoRoot}`)
  lines.push('')
  lines.push('## Safety Scope')
  lines.push('')
  lines.push('Phase 3 updates only the Supabase migration history for onboarding-critical migrations that Phase 1 and Phase 2 proved are already live. It does not run `db push`, `db reset`, schema migrations, or data-changing application SQL.')
  lines.push('')
  lines.push('## Decision')
  lines.push('')
  lines.push(markdownTable(
    ['Field', 'Value'],
    [
      ['Status', status],
      ['Recommendation', recommendation(status)],
      ['Apply mode', options.apply ? 'yes' : 'no'],
      ['Versions targeted', neededVersions.length ? neededVersions.join(', ') : 'none'],
      ['Evidence ready', evidence.ready ? 'yes' : 'no'],
      ['Duplicate local timestamps still present', duplicates.length],
    ],
  ))
  lines.push('')
  lines.push('## Candidate Matrix')
  lines.push('')
  lines.push(markdownTable(
    ['Version', 'Migration', 'Local file', 'Before ledger', 'After ledger', 'Evidence'],
    PHASE3_CANDIDATES.map((candidate) => {
      const local = localChecks.find((row) => row.version === candidate.version)
      const before = beforeCandidates.find((row) => row.version === candidate.version)
      const after = afterCandidates.find((row) => row.version === candidate.version)
      return [
        candidate.version,
        candidate.label,
        local?.localExists ? 'present' : 'missing',
        before?.remoteApplied ? 'recorded applied' : 'not recorded',
        after?.remoteApplied ? 'recorded applied' : options.apply ? 'not recorded' : 'not applied in plan mode',
        candidate.evidence.join(', '),
      ]
    }),
  ))
  lines.push('')
  lines.push('## Evidence Gate')
  lines.push('')
  lines.push(markdownTable(
    ['Gate', 'Status', 'Details'],
    [
      ['Local migration files', localChecks.every((row) => row.localExists) ? 'PASS' : 'FAIL', localChecks.filter((row) => !row.localExists).map((row) => row.localFile).join(', ') || 'all present'],
      ['Live object evidence', evidence.missing.length ? 'FAIL' : 'PASS', evidence.missing.join(', ') || 'all candidate evidence keys ready'],
      ['Behavior evidence', evidence.failedBehavior.length ? 'FAIL' : 'PASS', evidence.failedBehavior.join(', ') || 'all behavior checks ready'],
    ],
  ))
  lines.push('')
  lines.push('## Duplicate Local Timestamp Warning')
  lines.push('')
  if (duplicates.length) {
    lines.push('These duplicate local timestamps are still outside the onboarding-critical repair batch and must be handled in a later phase:')
    lines.push('')
    lines.push(markdownTable(['Version', 'Files'], duplicates.map((row) => [row.version, row.files.join(', ')])))
  } else {
    lines.push('No duplicate local timestamps detected.')
  }
  lines.push('')
  lines.push('## Command Evidence')
  lines.push('')
  lines.push(markdownTable(
    ['Command', 'Status', 'Notes'],
    [
      [beforeCommand.command, beforeCommand.ok ? 'ok' : `failed (${beforeCommand.status ?? 'unknown'})`, commandNote(beforeCommand)],
      [liveCommand.command, liveCommand.ok ? 'ok' : `failed (${liveCommand.status ?? 'unknown'})`, commandNote(liveCommand)],
      [behaviorCommand.command, behaviorCommand.ok ? 'ok' : `failed (${behaviorCommand.status ?? 'unknown'})`, commandNote(behaviorCommand)],
      [
        repairCommand?.command || 'migration repair not run',
        repairCommand ? (repairCommand.ok ? 'ok' : `failed (${repairCommand.status ?? 'unknown'})`) : 'skipped',
        repairCommand ? commandNote(repairCommand) : (options.apply ? 'nothing to repair' : 'plan mode'),
      ],
      [afterCommand.command, afterCommand.ok ? 'ok' : `failed (${afterCommand.status ?? 'unknown'})`, commandNote(afterCommand)],
    ],
  ))
  lines.push('')
  lines.push('## Next Step')
  lines.push('')
  if (status === 'REPAIRED' || status === 'NOOP_ALREADY_REPAIRED') {
    lines.push('Regenerate Phase 1 and Phase 2 reports. Phase 1 should show the five onboarding-critical migrations as recorded applied, and Phase 2 should remain `READY_FOR_PHASE_3`.')
  } else if (status === 'PLAN_READY') {
    lines.push('Run `npm run supabase:phase3` from the repo root after reviewing this report.')
  } else {
    lines.push('Stop here and resolve the blocking evidence before touching the migration ledger.')
  }
  lines.push('')

  return { status, report: `${lines.join('\n')}\n` }
}

function printUsage() {
  console.log('Usage: node scripts/supabase-phase3-ledger-repair.mjs [--apply] [--write] [--json]')
  console.log('')
  console.log('Options:')
  console.log('  --apply  Run supabase migration repair --linked --status applied for verified-live Phase 3 candidates.')
  console.log('  --write  Write docs/supabase-migration-phase-3-ledger-repair-report.md.')
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
  const localChecks = localCandidateChecks(repoRoot)
  const duplicates = duplicateLocalVersions(repoRoot)

  const beforeCommand = runSupabase(repoRoot, ['migration', 'list', '--linked', '--output-format', 'json'])
  const liveCommand = runSupabase(repoRoot, [
    'db',
    'query',
    '--linked',
    '--file',
    path.join(repoRoot, LIVE_OBJECT_SQL_PATH),
    '--output-format',
    'json',
  ])
  const behaviorCommand = runSupabase(repoRoot, [
    'db',
    'query',
    '--linked',
    '--file',
    path.join(repoRoot, BEHAVIOR_SQL_PATH),
    '--output-format',
    'json',
  ])

  const beforeState = ledgerState(beforeCommand.ok ? parseMigrationRows(beforeCommand.stdout) : [])
  const beforeCandidates = PHASE3_CANDIDATES.map((candidate) => candidateState(candidate, beforeState))
  const liveRows = liveCommand.ok ? parseCheckRows(liveCommand.stdout) : []
  const behaviorRows = behaviorCommand.ok ? parseCheckRows(behaviorCommand.stdout) : []
  const evidence = allEvidenceReady(liveRows, behaviorRows)
  const neededVersions = beforeCandidates.filter((row) => !row.remoteApplied).map((row) => row.version)

  let repairCommand = null
  if (options.apply && localChecks.every((row) => row.localExists) && evidence.ready && neededVersions.length) {
    repairCommand = runSupabase(repoRoot, [
      'migration',
      'repair',
      '--linked',
      '--status',
      'applied',
      ...neededVersions,
    ])
  }

  const afterCommand = runSupabase(repoRoot, ['migration', 'list', '--linked', '--output-format', 'json'])
  const afterState = ledgerState(afterCommand.ok ? parseMigrationRows(afterCommand.stdout) : [])
  const afterCandidates = PHASE3_CANDIDATES.map((candidate) => candidateState(candidate, afterState))

  const { status, report } = generateReport({
    repoRoot,
    generatedAt,
    options,
    localChecks,
    duplicates,
    liveCommand,
    behaviorCommand,
    beforeCommand,
    repairCommand,
    afterCommand,
    beforeCandidates,
    afterCandidates,
    evidence,
    neededVersions,
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
      apply: options.apply,
      targetedVersions: neededVersions,
      afterRecorded: afterCandidates.filter((row) => row.remoteApplied).map((row) => row.version),
    }, null, 2))
  } else if (!options.write) {
    console.log(report)
  }

  if (['BLOCKED_LOCAL_FILES', 'BLOCKED_EVIDENCE', 'REPAIR_FAILED', 'VERIFY_FAILED'].includes(status)) {
    process.exitCode = 1
  }
}

main()
