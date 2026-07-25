#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PHASE5_PATH = path.join('docs', 'supabase-push-phase-5-production-promotion.json')
const JSON_REPORT_PATH = path.join('docs', 'supabase-push-production-one-version.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-production-one-version-report.md')
const PRODUCTION_RUNNER = path.join('scripts', 'supabase-phase7-production-execution.mjs')
const APPLY_CONFIRMATION = 'APPLY_TO_PRODUCTION'

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseArgs(argv) {
  const options = { mode: 'plan', json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--plan') options.mode = 'plan'
    else if (arg === '--apply-sql') options.mode = 'apply_sql'
    else if (arg === '--record-applied') options.mode = 'record_applied'
    else if (arg === '--version') options.version = argv[++index]
    else if (arg === '--confirm') options.confirm = argv[++index]
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function selectedRow(phase5, version) {
  if (!version) throw new Error('A single --version is required.')
  const rows = Array.isArray(phase5.rows) ? phase5.rows.filter((row) => row.version === version) : []
  if (rows.length !== 1) throw new Error(`Expected one Phase 5 row for ${version}; found ${rows.length}.`)
  return rows[0]
}

function commandFor(row, mode) {
  const base = [
    'node', PRODUCTION_RUNNER,
    mode === 'apply_sql' ? '--apply-sql' : '--record-applied',
    '--version', row.version,
    '--staging-evidence', row.stagingEvidenceFile,
  ]
  if (mode === 'record_applied') {
    base.push('--production-evidence', row.productionEvidenceFile)
  }
  base.push('--confirm', APPLY_CONFIRMATION)
  return base
}

function shellCommand(parts) {
  return parts.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ')
}

function plannedCommands(row) {
  if (!row.readyForProduction) return []
  if (row.productionRoute === 'production_apply_sql') {
    return [
      shellCommand(commandFor(row, 'apply_sql')),
      shellCommand(commandFor(row, 'record_applied')),
    ]
  }
  if (row.productionRoute === 'production_no_sql_record_after_smoke') {
    return [shellCommand(commandFor(row, 'record_applied'))]
  }
  return []
}

function validateRequestedMode(row, mode) {
  const blockers = []
  if (mode === 'apply_sql' && row.productionRoute !== 'production_apply_sql') {
    blockers.push('selected_version_is_not_sql_apply_route')
  }
  if (mode === 'record_applied' && ![
    'production_apply_sql',
    'production_no_sql_record_after_smoke',
  ].includes(row.productionRoute)) {
    blockers.push('selected_version_is_not_recordable_route')
  }
  return blockers
}

function runProductionRunner(repoRoot, row, mode) {
  const command = commandFor(row, mode).slice(1)
  const result = spawnSync(process.execPath, command, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  })
  return {
    attempted: true,
    command: shellCommand([process.execPath, ...command]),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  }
}

function markdownList(values) {
  if (!values.length) return 'None'
  return values.map((value) => `- \`${value}\``).join('\n')
}

function buildMarkdown(report) {
  return `# Supabase Production One-Version Promotion

Generated: ${report.generatedAt}

## Selected Version

| Field | Value |
| --- | --- |
| Status | \`${report.status}\` |
| Mode | \`${report.mode}\` |
| Version | \`${report.selected.version}\` |
| Stream | \`${report.selected.stream}\` |
| Route | \`${report.selected.productionRoute}\` |
| Ready from Phase 5 | ${report.selected.readyForProduction ? 'Yes' : 'No'} |
| Mutation attempted | ${report.execution.attempted ? 'Yes' : 'No'} |
| Mutation succeeded | ${report.execution.attempted ? (report.execution.ok ? 'Yes' : 'No') : 'Not attempted'} |

## Blockers

${markdownList(report.blockers)}

## Commands

${report.commands.length ? report.commands.map((command) => `- \`${command}\``).join('\n') : 'No commands are enabled for this selected version.'}

Use this wrapper for one migration version at a time. It delegates mutations to \`${PRODUCTION_RUNNER}\` only after Phase 5 marks the selected version ready.
`
}

function printUsage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-push-promote-production-one-version.mjs --version <version> --plan [--json]')
  console.log('  node scripts/supabase-push-promote-production-one-version.mjs --version <version> --apply-sql --confirm APPLY_TO_PRODUCTION')
  console.log('  node scripts/supabase-push-promote-production-one-version.mjs --version <version> --record-applied --confirm APPLY_TO_PRODUCTION')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return printUsage()

  const repoRoot = findRepoRoot(process.cwd())
  const phase5Path = path.join(repoRoot, PHASE5_PATH)
  if (!existsSync(phase5Path)) throw new Error(`Phase 5 production promotion report is required: ${PHASE5_PATH}`)
  const phase5 = readJson(phase5Path)
  const row = selectedRow(phase5, options.version)
  const modeBlockers = validateRequestedMode(row, options.mode)
  const phase5Blockers = Array.isArray(row.blockers) ? row.blockers : []
  const blockers = [
    ...(row.readyForProduction ? [] : ['phase5_production_promotion_not_ready']),
    ...phase5Blockers.map((blocker) => `phase5_${blocker}`),
    ...modeBlockers,
  ]
  const blocked = blockers.length > 0

  if (options.mode !== 'plan' && options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Production mutations require --confirm ${APPLY_CONFIRMATION}.`)
  }

  let execution = {
    attempted: false,
    ok: false,
    status: null,
    command: '',
    stdout: '',
    stderr: '',
    error: '',
  }
  if (options.mode !== 'plan' && !blocked) {
    execution = runProductionRunner(repoRoot, row, options.mode)
  }

  const status = blocked
    ? 'PROMOTION_BLOCKED'
    : (options.mode === 'plan'
      ? 'PROMOTION_READY'
      : (execution.ok ? 'PROMOTION_MUTATION_SUCCEEDED' : 'PROMOTION_MUTATION_FAILED'))

  const report = {
    generatedAt: new Date().toISOString(),
    sourceReport: PHASE5_PATH,
    status,
    mode: options.mode,
    selected: {
      version: row.version,
      stream: row.stream,
      file: row.file,
      productionRoute: row.productionRoute,
      stagingEvidenceFile: row.stagingEvidenceFile,
      productionEvidenceFile: row.productionEvidenceFile,
      readyForProduction: Boolean(row.readyForProduction),
    },
    blockers,
    commands: plannedCommands(row),
    execution,
  }

  writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(report))

  if (options.json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`Wrote ${JSON_REPORT_PATH}`)
    console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
    console.log(`Status: ${status}`)
  }

  if ((options.mode !== 'plan' && blocked) || status === 'PROMOTION_MUTATION_FAILED') {
    process.exitCode = 1
  }
}

try {
  main()
} catch (error) {
  console.error(`Production one-version promotion failed: ${error.message}`)
  process.exitCode = 1
}
