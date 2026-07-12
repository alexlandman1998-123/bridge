#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = path.join('docs', 'supabase-migration-phase-2-onboarding-critical-report.md')
const LIVE_OBJECT_SQL_PATH = path.join('sql', 'supabase-phase1-live-object-checks.sql')
const BEHAVIOR_SQL_PATH = path.join('sql', 'supabase-phase2-onboarding-behavior-checks.sql')

const REST_RPC_EXPECTATIONS = [
  {
    rpc: 'bridge_complete_workspace_onboarding',
    expectedCode: 'permission_denied',
    payload: {
      workspace_type: 'agency',
      workspace_kind: 'agency',
      organisation: { name: 'Phase 2 REST unauthenticated probe' },
      owner: { workspace_role: 'principal' },
      branches: [{ name: 'Head Office' }],
      settings: { source: 'phase2_rest_probe' },
    },
  },
  {
    rpc: 'bridge_create_principal_claim_invite',
    expectedCode: 'not_authenticated',
    payload: {},
  },
  {
    rpc: 'bridge_complete_principal_claim_onboarding',
    expectedCode: 'not_authenticated',
    payload: {},
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
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
    fetchRemote: false,
    restProbe: false,
    write: false,
    json: false,
  }

  for (const arg of argv) {
    if (arg === '--fetch-remote') {
      options.fetchRemote = true
    } else if (arg === '--rest-probe') {
      options.restProbe = true
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

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {}

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^["']|["']$/g, ''),
        ]
      }),
  )
}

function loadEnv(repoRoot) {
  const appRoot = path.join(repoRoot, 'the-it-guy')
  const env = {
    ...parseEnvFile(path.join(appRoot, '.env')),
    ...parseEnvFile(path.join(appRoot, '.env.staging.local')),
    ...parseEnvFile(path.join(appRoot, '.env.production.local')),
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value))),
  }

  if (!env.VITE_SUPABASE_URL && env.SUPABASE_URL) env.VITE_SUPABASE_URL = env.SUPABASE_URL
  if (!env.SUPABASE_URL && env.VITE_SUPABASE_URL) env.SUPABASE_URL = env.VITE_SUPABASE_URL
  if (!env.VITE_SUPABASE_ANON_KEY && env.VITE_SUPABASE_KEY) env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_KEY
  if (!env.VITE_SUPABASE_ANON_KEY && env.SUPABASE_ANON_KEY) env.VITE_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY

  return env
}

function projectRefFromUrl(url = '') {
  try {
    return new URL(url).hostname.split('.')[0] || ''
  } catch {
    return ''
  }
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

function normalizeBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return ['1', 't', 'true', 'yes'].includes(value.toLowerCase())
  return false
}

function parseCheckRows(stdout, keyField = 'check_key') {
  const parsed = parseJsonLoose(stdout)
  const rows = extractRows(parsed, (item) => Object.prototype.hasOwnProperty.call(item, keyField))

  return rows.map((row) => ({
    checkKey: String(getField(row, ['check_key', 'checkKey'])),
    checkType: String(getField(row, ['check_type', 'checkType', 'object_type', 'objectType']) || ''),
    expected: String(getField(row, ['expected']) || ''),
    observed: String(getField(row, ['observed']) || ''),
    ready: normalizeBool(getField(row, ['ready'])),
    liveExists: normalizeBool(getField(row, ['live_exists', 'liveExists'])),
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

function localContractChecks(repoRoot) {
  const files = [
    {
      checkKey: 'local_branch_scope_fix_migration',
      file: path.join(repoRoot, 'supabase/migrations/202607120002_fix_workspace_onboarding_branch_scope.sql'),
      expected: 'branch_scope null guard migration exists locally',
      patterns: ['v_branch_scope is null or v_branch_scope not in', 'branch_scope = v_branch_scope'],
    },
    {
      checkKey: 'local_principal_claim_invite_migration',
      file: path.join(repoRoot, 'supabase/migrations/202606170002_principal_claim_invites.sql'),
      expected: 'principal claim invite RPC migration exists locally',
      patterns: ['bridge_create_principal_claim_invite', 'principal_claim_invite'],
    },
    {
      checkKey: 'local_principal_claim_completion_migration',
      file: path.join(repoRoot, 'supabase/migrations/202606170003_principal_claim_completion.sql'),
      expected: 'principal claim completion RPC migration exists locally',
      patterns: ['bridge_complete_principal_claim_onboarding', 'bridge_sync_principal_claim_membership'],
    },
  ]

  return files.map((item) => {
    const source = existsSync(item.file) ? readFileSync(item.file, 'utf8') : ''
    const missing = item.patterns.filter((pattern) => !source.includes(pattern))
    return {
      checkKey: item.checkKey,
      checkType: 'local_contract',
      expected: item.expected,
      observed: missing.length ? `missing: ${missing.join(', ')}` : 'all local markers present',
      ready: missing.length === 0,
      details: path.relative(repoRoot, item.file),
    }
  })
}

function summarizeChecks(rows = []) {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.ready).length,
    failed: rows.filter((row) => !row.ready),
  }
}

function commandNote(command) {
  const note = command.stderr.trim() || command.error || command.stdout.trim() || 'none'
  return note.length > 500 ? `${note.slice(0, 500)}...` : note
}

async function runRestProbe({ supabaseUrl, anonKey, rpc, payload, expectedCode }) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${rpc}`
  const startedAt = Date.now()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ payload }),
    })
    const text = await response.text()
    const body = parseJsonLoose(text)
    const code = normalizeText(body?.code || body?.error?.code || body?.message)
    const schemaCacheMiss =
      response.status === 404 ||
      code === 'PGRST202' ||
      `${body?.message || ''} ${body?.details || ''}`.toLowerCase().includes('could not find the function')
    const ready = response.ok && body?.success === false && body?.code === expectedCode

    return {
      checkKey: `rest_${rpc}`,
      checkType: 'postgrest_rpc_probe',
      expected: `HTTP 200; success=false; code=${expectedCode}`,
      observed: `HTTP ${response.status}; code=${body?.code || code || '(none)'}`,
      ready,
      details: schemaCacheMiss
        ? 'schema cache miss or missing RPC'
        : `durationMs=${Date.now() - startedAt}`,
      httpStatus: response.status,
      body,
    }
  } catch (error) {
    return {
      checkKey: `rest_${rpc}`,
      checkType: 'postgrest_rpc_probe',
      expected: `HTTP 200; success=false; code=${expectedCode}`,
      observed: 'request failed',
      ready: false,
      details: error instanceof Error ? error.message : String(error),
      httpStatus: 0,
      body: null,
    }
  }
}

async function runRestProbes(repoRoot) {
  const env = loadEnv(repoRoot)
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const anonKey = normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY)
  const projectRef = projectRefFromUrl(supabaseUrl)

  if (!supabaseUrl || !anonKey) {
    return {
      configured: false,
      projectRef,
      checks: [{
        checkKey: 'rest_probe_environment',
        checkType: 'environment',
        expected: 'SUPABASE_URL/VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY',
        observed: 'missing REST probe configuration',
        ready: false,
        details: [
          supabaseUrl ? '' : 'missing url',
          anonKey ? '' : 'missing anon key',
        ].filter(Boolean).join(', '),
      }],
    }
  }

  const checks = []
  for (const expectation of REST_RPC_EXPECTATIONS) {
    checks.push(await runRestProbe({ supabaseUrl, anonKey, ...expectation }))
  }

  return {
    configured: true,
    projectRef,
    checks,
  }
}

function runRemoteChecks(repoRoot) {
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

  return {
    liveCommand,
    behaviorCommand,
    liveRows: liveCommand.ok ? parseCheckRows(liveCommand.stdout) : [],
    behaviorRows: behaviorCommand.ok ? parseCheckRows(behaviorCommand.stdout) : [],
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

function statusFromSummaries({ localSummary, liveSummary, behaviorSummary, restSummary, remoteFetched, restProbed }) {
  const criticalFailures = [
    ...localSummary.failed,
    ...(remoteFetched ? liveSummary.failed : []),
    ...(remoteFetched ? behaviorSummary.failed : []),
    ...(restProbed ? restSummary.failed : []),
  ]

  if (criticalFailures.length) return 'PATCH_REQUIRED'
  if (!remoteFetched || !restProbed) return 'PREFLIGHT_ONLY'
  return 'READY_FOR_PHASE_3'
}

function recommendationFromStatus(status) {
  if (status === 'READY_FOR_PHASE_3') {
    return 'No Phase 2 onboarding object patch is needed. Continue to Phase 3 ledger repair planning.'
  }
  if (status === 'PATCH_REQUIRED') {
    return 'Stop before ledger repair. Patch the failed onboarding-critical object or schema-cache path first.'
  }
  return 'Run the remote Phase 2 command before making a production migration decision.'
}

function generateReport({ repoRoot, localRows, remoteChecks, restProbe, options, generatedAt }) {
  const liveRows = remoteChecks?.liveRows || []
  const behaviorRows = remoteChecks?.behaviorRows || []
  const restRows = restProbe?.checks || []
  const localSummary = summarizeChecks(localRows)
  const liveSummary = summarizeChecks(liveRows)
  const behaviorSummary = summarizeChecks(behaviorRows)
  const restSummary = summarizeChecks(restRows)
  const status = statusFromSummaries({
    localSummary,
    liveSummary,
    behaviorSummary,
    restSummary,
    remoteFetched: options.fetchRemote,
    restProbed: options.restProbe,
  })

  const lines = []
  lines.push('# Supabase Migration Phase 2 Onboarding-Critical Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Repo: ${repoRoot}`)
  lines.push('')
  lines.push('## Safety Scope')
  lines.push('')
  lines.push('Phase 2 validates onboarding-critical live objects and runtime visibility. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL. The SQL behavior checks call the onboarding RPCs only in unauthenticated mode, where they must return before writing data.')
  lines.push('')
  lines.push('## Decision')
  lines.push('')
  lines.push(markdownTable(
    ['Field', 'Value'],
    [
      ['Status', status],
      ['Recommendation', recommendationFromStatus(status)],
      ['Patch applied', 'no'],
      ['Remote catalog fetched', options.fetchRemote ? 'yes' : 'no'],
      ['REST RPC probes run', options.restProbe ? 'yes' : 'no'],
      ['REST project ref', restProbe?.projectRef || 'not fetched'],
    ],
  ))
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(markdownTable(
    ['Gate', 'Ready', 'Total', 'Failures'],
    [
      ['Local migration contracts', localSummary.ready, localSummary.total, localSummary.failed.length],
      ['Live object catalog', options.fetchRemote ? liveSummary.ready : 'not fetched', options.fetchRemote ? liveSummary.total : 'not fetched', options.fetchRemote ? liveSummary.failed.length : 'not fetched'],
      ['Onboarding behavior contracts', options.fetchRemote ? behaviorSummary.ready : 'not fetched', options.fetchRemote ? behaviorSummary.total : 'not fetched', options.fetchRemote ? behaviorSummary.failed.length : 'not fetched'],
      ['PostgREST RPC visibility', options.restProbe ? restSummary.ready : 'not fetched', options.restProbe ? restSummary.total : 'not fetched', options.restProbe ? restSummary.failed.length : 'not fetched'],
    ],
  ))
  lines.push('')
  lines.push('## Local Contract Checks')
  lines.push('')
  lines.push(markdownTable(
    ['Check', 'Ready', 'Expected', 'Observed', 'Details'],
    localRows.map((row) => [row.checkKey, row.ready ? 'yes' : 'no', row.expected, row.observed, row.details]),
  ))
  lines.push('')
  lines.push('## Live Object Catalog')
  lines.push('')
  if (options.fetchRemote) {
    lines.push(markdownTable(
      ['Check', 'Type', 'Ready', 'Expected', 'Details'],
      liveRows.map((row) => [row.checkKey, row.checkType, row.ready ? 'yes' : 'no', row.expected, row.details]),
    ))
  } else {
    lines.push('Not fetched. Run `npm run supabase:phase2` from the repo root.')
  }
  lines.push('')
  lines.push('## Onboarding Behavior Contracts')
  lines.push('')
  if (options.fetchRemote) {
    lines.push(markdownTable(
      ['Check', 'Type', 'Ready', 'Expected', 'Observed'],
      behaviorRows.map((row) => [row.checkKey, row.checkType, row.ready ? 'yes' : 'no', row.expected, row.observed]),
    ))
  } else {
    lines.push('Not fetched. Run `npm run supabase:phase2` from the repo root.')
  }
  lines.push('')
  lines.push('## PostgREST RPC Visibility')
  lines.push('')
  if (options.restProbe) {
    lines.push(markdownTable(
      ['Check', 'Ready', 'Expected', 'Observed', 'Details'],
      restRows.map((row) => [row.checkKey, row.ready ? 'yes' : 'no', row.expected, row.observed, row.details]),
    ))
  } else {
    lines.push('Not fetched. Run `npm run supabase:phase2` from the repo root.')
  }
  lines.push('')
  lines.push('## Command Evidence')
  lines.push('')
  if (options.fetchRemote && remoteChecks) {
    lines.push(markdownTable(
      ['Command', 'Status', 'Parsed rows', 'Notes'],
      [
        [
          remoteChecks.liveCommand.command,
          remoteChecks.liveCommand.ok ? 'ok' : `failed (${remoteChecks.liveCommand.status ?? 'unknown'})`,
          liveRows.length,
          commandNote(remoteChecks.liveCommand),
        ],
        [
          remoteChecks.behaviorCommand.command,
          remoteChecks.behaviorCommand.ok ? 'ok' : `failed (${remoteChecks.behaviorCommand.status ?? 'unknown'})`,
          behaviorRows.length,
          commandNote(remoteChecks.behaviorCommand),
        ],
      ],
    ))
  } else {
    lines.push('Remote commands were not run for this report.')
  }
  lines.push('')
  lines.push('## Phase 3 Handoff')
  lines.push('')
  if (status === 'READY_FOR_PHASE_3') {
    lines.push('Onboarding-critical functions, policies, constraints, and PostgREST RPC visibility are ready. The remaining onboarding-critical work is ledger-only: prepare a reviewed `migration repair --status applied` batch for the Phase 1 candidates.')
  } else if (status === 'PATCH_REQUIRED') {
    lines.push('Do not perform ledger repair yet. Resolve every failed Phase 2 check first, then regenerate this report.')
  } else {
    lines.push('This report is local/preflight only. Run the remote command before Phase 3.')
  }
  lines.push('')

  return `${lines.join('\n')}\n`
}

function printUsage() {
  console.log('Usage: node scripts/supabase-phase2-onboarding-readiness.mjs [--fetch-remote] [--rest-probe] [--write] [--json]')
  console.log('')
  console.log('Options:')
  console.log('  --fetch-remote  Run read-only Supabase catalog and behavior checks against the linked project.')
  console.log('  --rest-probe    Probe onboarding RPC visibility through PostgREST using the configured anon key.')
  console.log('  --write         Write docs/supabase-migration-phase-2-onboarding-critical-report.md.')
  console.log('  --json          Print a compact machine-readable summary.')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  const repoRoot = findRepoRoot(process.cwd())
  const generatedAt = new Date().toISOString()
  const localRows = localContractChecks(repoRoot)
  const remoteChecks = options.fetchRemote ? runRemoteChecks(repoRoot) : null
  const restProbe = options.restProbe ? await runRestProbes(repoRoot) : null
  const report = generateReport({ repoRoot, localRows, remoteChecks, restProbe, options, generatedAt })
  const allRows = [
    ...localRows,
    ...(remoteChecks?.liveRows || []),
    ...(remoteChecks?.behaviorRows || []),
    ...(restProbe?.checks || []),
  ]
  const summary = summarizeChecks(allRows)
  const status = statusFromSummaries({
    localSummary: summarizeChecks(localRows),
    liveSummary: summarizeChecks(remoteChecks?.liveRows || []),
    behaviorSummary: summarizeChecks(remoteChecks?.behaviorRows || []),
    restSummary: summarizeChecks(restProbe?.checks || []),
    remoteFetched: options.fetchRemote,
    restProbed: options.restProbe,
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
      ready: summary.ready,
      total: summary.total,
      failures: summary.failed.map((row) => row.checkKey),
      restProjectRef: restProbe?.projectRef || null,
    }, null, 2))
  } else if (!options.write) {
    console.log(report)
  }

  if (status === 'PATCH_REQUIRED') {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
