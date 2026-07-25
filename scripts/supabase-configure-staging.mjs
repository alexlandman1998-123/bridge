#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ENV_FILE = path.join('the-it-guy', '.env.staging.local')
const ROUTING_PATH = path.join('docs', 'supabase-push-phase-3-action-routing.json')
const PHASE1_RECEIPT_PATH = path.join('the-it-guy', 'config', 'legal-document-rollout-phase1-staging.json')
const JSON_REPORT_PATH = path.join('docs', 'supabase-staging-configuration.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-staging-configuration-report.md')
const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const REQUIRED_RECOVERY_CONFIRMATION = 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP'

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseArgs(argv) {
  const options = { envFile: DEFAULT_ENV_FILE, write: true, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--env-file') options.envFile = argv[++index]
    else if (arg === '--check') options.write = false
    else if (arg === '--write') options.write = true
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function parseEnvFile(source) {
  const values = {}
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

function stagingTarget(repoRoot, envFile) {
  const absolutePath = path.resolve(repoRoot, envFile)
  if (!existsSync(absolutePath)) throw new Error(`Staging env file not found: ${envFile}`)
  const env = parseEnvFile(readFileSync(absolutePath, 'utf8'))
  const projectRef = String(env.SUPABASE_STAGING_PROJECT_REF || '').trim()
  if (!/^[a-z0-9]{8,64}$/.test(projectRef)) throw new Error('SUPABASE_STAGING_PROJECT_REF is invalid or missing.')
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error('Refusing to configure staging as the production project.')
  if (env.SUPABASE_STAGING_RECOVERY_CONFIRMED !== REQUIRED_RECOVERY_CONFIRMATION) {
    throw new Error(`SUPABASE_STAGING_RECOVERY_CONFIRMED must equal ${REQUIRED_RECOVERY_CONFIRMATION}.`)
  }
  const dbUrl = new URL(env.SUPABASE_STAGING_DB_URL)
  const directHost = `db.${projectRef}.supabase.co`
  const sourceHost = dbUrl.hostname.toLowerCase()
  const isDirectHost = sourceHost === directHost
  const isPoolerHost = sourceHost.endsWith('.pooler.supabase.com')
  if (!isDirectHost && !isPoolerHost) {
    throw new Error('SUPABASE_STAGING_DB_URL must identify a Supabase pooler or direct database host.')
  }
  if (isPoolerHost) {
    const usernameProjectRef = decodeURIComponent(dbUrl.username || '').split('.')[1]
    if (usernameProjectRef !== projectRef) throw new Error('SUPABASE_STAGING_DB_URL pooler username must identify the staging project ref.')
    if (dbUrl.port && !['5432', '6543'].includes(dbUrl.port)) throw new Error('SUPABASE_STAGING_DB_URL pooler port must be 5432 or 6543.')
  }
  if (isDirectHost && dbUrl.port && dbUrl.port !== '5432') throw new Error('SUPABASE_STAGING_DB_URL direct port must be 5432.')
  return {
    envFile,
    projectRef,
    sourceHost,
    dbUrlContract: isPoolerHost ? 'supabase_pooler_project_bound_v1' : 'supabase_direct_project_bound_v1',
  }
}

function evidencePath(row) {
  return row.evidenceFile || path.join('docs', 'staging-evidence', `${row.version}-${row.stream}.json`)
}

function updateEvidence(repoRoot, row, target, write) {
  const relativePath = evidencePath(row)
  const absolutePath = path.join(repoRoot, relativePath)
  if (!existsSync(absolutePath)) {
    return {
      version: row.version,
      stream: row.stream,
      evidenceFile: relativePath,
      changed: false,
      status: 'missing',
    }
  }
  const evidence = readJson(absolutePath)
  const before = {
    targetProjectRef: evidence.targetProjectRef || null,
    stagingProjectRef: evidence.stagingProjectRef || null,
  }
  evidence.targetProjectRef = target.projectRef
  evidence.stagingProjectRef = target.projectRef
  const changed = before.targetProjectRef !== evidence.targetProjectRef || before.stagingProjectRef !== evidence.stagingProjectRef
  if (write && changed) writeFileSync(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`)
  return {
    version: row.version,
    stream: row.stream,
    evidenceFile: relativePath,
    changed,
    status: changed ? 'configured' : 'already_configured',
  }
}

function updatePhase1ReceiptEnvironment(repoRoot, target, write) {
  const absolutePath = path.join(repoRoot, PHASE1_RECEIPT_PATH)
  if (!existsSync(absolutePath)) {
    return { path: PHASE1_RECEIPT_PATH, status: 'missing', changed: false }
  }
  const receipt = readJson(absolutePath)
  const environment = receipt.environment && typeof receipt.environment === 'object' ? receipt.environment : {}
  const before = JSON.stringify(environment)
  receipt.environment = {
    ...environment,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    stagingProjectRef: target.projectRef,
    stagingOrigin: `https://${target.projectRef}.supabase.co`,
  }
  const changed = before !== JSON.stringify(receipt.environment)
  if (write && changed) writeFileSync(absolutePath, `${JSON.stringify(receipt, null, 2)}\n`)
  return {
    path: PHASE1_RECEIPT_PATH,
    status: changed ? 'configured' : 'already_configured',
    changed,
  }
}

function markdownTable(headers, rows) {
  if (!rows.length) return 'No rows.'
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function buildMarkdown(result) {
  return `# Supabase Staging Configuration

Generated: ${result.generatedAt}

## Decision

| Field | Value |
| --- | --- |
| Status | \`${result.status}\` |
| Write mode | ${result.write ? 'Yes' : 'No'} |
| Staging project ref | \`${result.target.projectRef}\` |
| Source DB host | \`${result.target.sourceHost}\` |
| DB URL contract | \`${result.target.dbUrlContract}\` |
| Runner-eligible evidence rows | ${result.rows.length} |
| Configured now | ${result.configuredCount} |
| Already configured | ${result.alreadyConfiguredCount} |
| Missing evidence files | ${result.missingCount} |
| Phase 1 receipt environment | \`${result.phase1ReceiptEnvironment.status}\` |

## Evidence Rows

${markdownTable(
    ['Version', 'Stream', 'Status', 'Evidence'],
    result.rows.map((row) => [
      `\`${row.version}\``,
      `\`${row.stream}\``,
      `\`${row.status}\``,
      `\`${row.evidenceFile}\``,
    ]),
  )}

This only configures staging identity fields. It does not claim SQL was applied, ledger rows were recorded, or checks passed.
`
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-configure-staging.mjs [--env-file <path>] [--write|--check] [--json]')
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) usage()
  else {
    const repoRoot = findRepoRoot(process.cwd())
    const target = stagingTarget(repoRoot, options.envFile)
    const routing = readJson(path.join(repoRoot, ROUTING_PATH))
    const rows = routing.rows.filter((row) => !row.blocked).map((row) => updateEvidence(repoRoot, row, target, options.write))
    const phase1ReceiptEnvironment = updatePhase1ReceiptEnvironment(repoRoot, target, options.write)
    const result = {
      generatedAt: new Date().toISOString(),
      status: rows.some((row) => row.status === 'missing') || phase1ReceiptEnvironment.status === 'missing'
        ? 'STAGING_CONFIGURATION_INCOMPLETE'
        : 'STAGING_CONFIGURED',
      write: options.write,
      sourceRouting: ROUTING_PATH,
      target,
      phase1ReceiptEnvironment,
      rows,
      configuredCount: rows.filter((row) => row.status === 'configured').length,
      alreadyConfiguredCount: rows.filter((row) => row.status === 'already_configured').length,
      missingCount: rows.filter((row) => row.status === 'missing').length,
    }
    writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
    writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(result))
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else {
      console.log(`Wrote ${JSON_REPORT_PATH}`)
      console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
      console.log(`Status: ${result.status}`)
    }
  }
} catch (error) {
  console.error(`Configure staging failed: ${error.message}`)
  process.exitCode = 1
}
