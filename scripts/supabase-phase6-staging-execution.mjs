#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const RECOVERY_CONFIRMATION = 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
const APPLY_CONFIRMATION = 'APPLY_TO_STAGING_ONLY'
const MANIFEST_PATH = path.join('docs', 'supabase-phase-5-application-manifest.json')

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
    else if (arg === '--stream') options.stream = argv[++index]
    else if (arg === '--version') options.version = argv[++index]
    else if (arg === '--evidence') options.evidence = argv[++index]
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

function selectedRows(manifest, options) {
  let rows = [...manifest.rows]
  if (options.stream) rows = rows.filter((row) => row.stream === options.stream)
  if (options.version) rows = rows.filter((row) => row.version === options.version)
  return rows
}

function runSupabase(repoRoot, args) {
  const result = spawnSync('npx', ['--yes', 'supabase@latest', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  })
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  }
}

function stagingTarget() {
  const projectRef = String(process.env.SUPABASE_STAGING_PROJECT_REF || '').trim()
  const dbUrl = String(process.env.SUPABASE_STAGING_DB_URL || '').trim()
  const recovery = String(process.env.SUPABASE_STAGING_RECOVERY_CONFIRMED || '').trim()

  if (!projectRef) throw new Error('SUPABASE_STAGING_PROJECT_REF is required.')
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error('Refusing to target the production Supabase project.')
  if (!dbUrl) throw new Error('SUPABASE_STAGING_DB_URL is required.')
  if (!decodeURIComponent(dbUrl).includes(projectRef)) {
    throw new Error('The staging database URL does not contain SUPABASE_STAGING_PROJECT_REF.')
  }
  if (recovery !== RECOVERY_CONFIRMATION) {
    throw new Error(`Set SUPABASE_STAGING_RECOVERY_CONFIRMED=${RECOVERY_CONFIRMATION} only after recovery has been tested.`)
  }
  return { projectRef, dbUrl }
}

function requireSingleRow(rows, options) {
  if (!options.version) throw new Error('A single --version is required for staging mutations.')
  if (rows.length !== 1) throw new Error(`Expected one manifest row for ${options.version}; found ${rows.length}.`)
  return rows[0]
}

function migrationRecorded(repoRoot, target, version) {
  const sql = `select exists (select 1 from supabase_migrations.schema_migrations where version = '${version}') as already_applied`
  const result = runSupabase(repoRoot, ['db', 'query', '--db-url', target.dbUrl, sql, '--output-format', 'json'])
  if (!result.ok) throw new Error(`Could not read the staging migration ledger: ${result.stderr || result.error}`)
  return /"already_applied"\s*:\s*true/.test(result.stdout)
}

function validateEvidence(repoRoot, target, row, evidencePath) {
  if (!evidencePath) throw new Error('--evidence is required before recording a staging migration as applied.')
  const absolutePath = path.resolve(repoRoot, evidencePath)
  if (!existsSync(absolutePath)) throw new Error(`Evidence file not found: ${absolutePath}`)
  const evidence = readJson(absolutePath)
  const required = {
    version: row.version,
    targetProjectRef: target.projectRef,
    sqlApplied: true,
    catalogChecks: 'pass',
    behaviorChecks: 'pass',
    rollbackOrNoResidue: 'pass',
  }
  for (const [key, value] of Object.entries(required)) {
    if (evidence[key] !== value) throw new Error(`Evidence ${key} must equal ${JSON.stringify(value)}.`)
  }
  if (!String(evidence.reviewedBy || '').trim()) throw new Error('Evidence reviewedBy is required.')
  return absolutePath
}

function printPlan(rows, options) {
  if (options.json) {
    console.log(JSON.stringify({ mode: 'plan', count: rows.length, rows }, null, 2))
    return
  }
  console.log(`Staging plan rows: ${rows.length}`)
  for (const row of rows) {
    console.log(`${row.version}  ${row.stream}  ${row.action}  ${row.file}`)
  }
}

function printUsage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-phase6-staging-execution.mjs --plan [--stream <name>] [--version <version>] [--json]')
  console.log('  node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version <version> --confirm APPLY_TO_STAGING_ONLY')
  console.log('  node scripts/supabase-phase6-staging-execution.mjs --record-applied --version <version> --evidence <file> --confirm APPLY_TO_STAGING_ONLY')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  const repoRoot = findRepoRoot(process.cwd())
  const manifest = readJson(path.join(repoRoot, MANIFEST_PATH))
  if (manifest.linkedProjectRef !== PRODUCTION_PROJECT_REF || !Array.isArray(manifest.rows)) {
    throw new Error('The Phase 5 manifest is missing or has an unexpected project identity.')
  }
  const rows = selectedRows(manifest, options)
  if (options.mode === 'plan') {
    printPlan(rows, options)
    return
  }

  if (options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Staging mutations require --confirm ${APPLY_CONFIRMATION}.`)
  }
  const row = requireSingleRow(rows, options)
  const target = stagingTarget()
  const migrationPath = path.join(repoRoot, 'supabase', 'migrations', row.file)
  if (!existsSync(migrationPath)) throw new Error(`Migration file not found: ${migrationPath}`)

  if (options.mode === 'apply_sql') {
    if (row.action !== 'apply_original_after_dependency_check') {
      throw new Error(`Refusing SQL replay for manifest action ${row.action}.`)
    }
    if (migrationRecorded(repoRoot, target, row.version)) {
      throw new Error(`Version ${row.version} is already recorded in the staging ledger.`)
    }
    const result = runSupabase(repoRoot, ['db', 'query', '--db-url', target.dbUrl, '--file', migrationPath])
    if (!result.ok) throw new Error(`Staging SQL application failed: ${result.stderr || result.error}`)
    console.log(`Applied SQL for ${row.version} to staging project ${target.projectRef}.`)
    console.log('The migration ledger was not changed. Run verification and prepare evidence before --record-applied.')
    return
  }

  if (options.mode === 'record_applied') {
    if (['corrective_migration_required', 'manual_data_review'].includes(row.action)) {
      throw new Error(`Manifest action ${row.action} cannot be ledger-recorded by this runner.`)
    }
    validateEvidence(repoRoot, target, row, options.evidence)
    if (migrationRecorded(repoRoot, target, row.version)) {
      throw new Error(`Version ${row.version} is already recorded in the staging ledger.`)
    }
    const result = runSupabase(repoRoot, ['migration', 'repair', '--db-url', target.dbUrl, '--status', 'applied', row.version])
    if (!result.ok) throw new Error(`Staging ledger update failed: ${result.stderr || result.error}`)
    console.log(`Recorded ${row.version} as applied on staging project ${target.projectRef}.`)
  }
}

try {
  main()
} catch (error) {
  console.error(`Phase 6 staging gate blocked: ${error.message}`)
  process.exitCode = 1
}
