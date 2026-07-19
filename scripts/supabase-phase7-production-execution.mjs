#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const RECOVERY_CONFIRMATION = 'I_HAVE_TESTED_PRODUCTION_RECOVERY'
const APPLY_CONFIRMATION = 'APPLY_TO_PRODUCTION'
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
    else if (arg === '--staging-evidence') options.stagingEvidence = argv[++index]
    else if (arg === '--production-evidence') options.productionEvidence = argv[++index]
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
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  }
}

function productionTarget() {
  const projectRef = String(process.env.SUPABASE_PRODUCTION_PROJECT_REF || '').trim()
  const dbUrl = String(process.env.SUPABASE_PRODUCTION_DB_URL || '').trim()
  const recovery = String(process.env.SUPABASE_PRODUCTION_RECOVERY_CONFIRMED || '').trim()

  if (projectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error(`SUPABASE_PRODUCTION_PROJECT_REF must equal ${PRODUCTION_PROJECT_REF}.`)
  }
  if (!dbUrl) throw new Error('SUPABASE_PRODUCTION_DB_URL is required.')
  let decodedDbUrl = dbUrl
  try { decodedDbUrl = decodeURIComponent(dbUrl) } catch { /* retain the original for identity checking */ }
  if (!decodedDbUrl.includes(projectRef)) {
    throw new Error('The production database URL does not contain SUPABASE_PRODUCTION_PROJECT_REF.')
  }
  if (recovery !== RECOVERY_CONFIRMATION) {
    throw new Error(`Set SUPABASE_PRODUCTION_RECOVERY_CONFIRMED=${RECOVERY_CONFIRMATION} only after recovery has been tested.`)
  }
  return { projectRef, dbUrl }
}

function requireSingleRow(rows, options) {
  if (!options.version) throw new Error('A single --version is required for production mutations.')
  if (rows.length !== 1) throw new Error(`Expected one manifest row for ${options.version}; found ${rows.length}.`)
  return rows[0]
}

function evidenceFile(repoRoot, filePath, label) {
  if (!filePath) throw new Error(`${label} is required.`)
  const absolutePath = path.resolve(repoRoot, filePath)
  if (!existsSync(absolutePath)) throw new Error(`Evidence file not found: ${absolutePath}`)
  return readJson(absolutePath)
}

function validateStagingEvidence(repoRoot, row, filePath) {
  const evidence = evidenceFile(repoRoot, filePath, '--staging-evidence')
  const required = {
    version: row.version,
    stagingLedgerRecorded: true,
    catalogChecks: 'pass',
    behaviorChecks: 'pass',
    rollbackOrNoResidue: 'pass',
  }
  for (const [key, value] of Object.entries(required)) {
    if (evidence[key] !== value) throw new Error(`Staging evidence ${key} must equal ${JSON.stringify(value)}.`)
  }
  const stagingProjectRef = String(evidence.stagingProjectRef || '').trim()
  if (!stagingProjectRef) throw new Error('Staging evidence stagingProjectRef is required.')
  if (stagingProjectRef === PRODUCTION_PROJECT_REF) throw new Error('Staging evidence cannot identify the production project.')
  if (!String(evidence.approvedBy || '').trim()) throw new Error('Staging evidence approvedBy is required.')
}

function validateProductionEvidence(repoRoot, target, row, filePath) {
  const evidence = evidenceFile(repoRoot, filePath, '--production-evidence')
  const required = {
    version: row.version,
    targetProjectRef: target.projectRef,
    sqlApplied: row.action === 'apply_original_after_dependency_check',
    targetStateVerified: true,
    catalogChecks: 'pass',
    behaviorChecks: 'pass',
    rollbackOrNoResidue: 'pass',
  }
  for (const [key, value] of Object.entries(required)) {
    if (evidence[key] !== value) throw new Error(`Production evidence ${key} must equal ${JSON.stringify(value)}.`)
  }
  if (!String(evidence.reviewedBy || '').trim()) throw new Error('Production evidence reviewedBy is required.')
}

function requireRecoverableProduction(repoRoot, target) {
  const result = runSupabase(repoRoot, [
    'backups', 'list', '--project-ref', target.projectRef, '--output-format', 'json',
  ])
  if (!result.ok) throw new Error(`Could not verify production recovery: ${result.stderr || result.error}`)
  let status
  try { status = JSON.parse(result.stdout) } catch {
    throw new Error('Could not parse the production backup status.')
  }
  const backups = Array.isArray(status.backups) ? status.backups : (Array.isArray(status) ? status : [])
  if (status.pitr_enabled !== true && backups.length === 0) {
    throw new Error('Production has neither PITR nor a physical backup; mutation is blocked.')
  }
}

function migrationRecorded(repoRoot, target, version) {
  const sql = `select exists (select 1 from supabase_migrations.schema_migrations where version = '${version}') as already_applied`
  const result = runSupabase(repoRoot, ['db', 'query', '--db-url', target.dbUrl, sql, '--output-format', 'json'])
  if (!result.ok) throw new Error(`Could not read the production migration ledger: ${result.stderr || result.error}`)
  return /"already_applied"\s*:\s*true/.test(result.stdout)
}

function requireDependency(repoRoot, target, row) {
  if (!/^\d{12,14}$/.test(String(row.dependsOn || ''))) return
  if (!migrationRecorded(repoRoot, target, row.dependsOn)) {
    throw new Error(`Dependency ${row.dependsOn} is not recorded in the production ledger.`)
  }
}

function printPlan(rows, options) {
  if (options.json) {
    console.log(JSON.stringify({ mode: 'plan', count: rows.length, rows }, null, 2))
    return
  }
  console.log(`Production plan rows: ${rows.length}`)
  for (const row of rows) console.log(`${row.version}  ${row.stream}  ${row.action}  ${row.file}`)
}

function printUsage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-phase7-production-execution.mjs --plan [--stream <name>] [--version <version>] [--json]')
  console.log('  node scripts/supabase-phase7-production-execution.mjs --apply-sql --version <version> --staging-evidence <file> --confirm APPLY_TO_PRODUCTION')
  console.log('  node scripts/supabase-phase7-production-execution.mjs --record-applied --version <version> --staging-evidence <file> --production-evidence <file> --confirm APPLY_TO_PRODUCTION')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return printUsage()

  const repoRoot = findRepoRoot(process.cwd())
  const manifest = readJson(path.join(repoRoot, MANIFEST_PATH))
  if (manifest.linkedProjectRef !== PRODUCTION_PROJECT_REF || !Array.isArray(manifest.rows)) {
    throw new Error('The Phase 5 manifest is missing or has an unexpected production identity.')
  }
  const rows = selectedRows(manifest, options)
  if (options.mode === 'plan') return printPlan(rows, options)

  if (options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Production mutations require --confirm ${APPLY_CONFIRMATION}.`)
  }
  const row = requireSingleRow(rows, options)
  if (['corrective_migration_required', 'manual_data_review'].includes(row.action)) {
    throw new Error(`Manifest action ${row.action} cannot be mutated by this runner.`)
  }
  if (options.mode === 'apply_sql' && row.action !== 'apply_original_after_dependency_check') {
    throw new Error(`Refusing production SQL replay for manifest action ${row.action}.`)
  }

  validateStagingEvidence(repoRoot, row, options.stagingEvidence)
  const target = productionTarget()
  if (options.mode === 'record_applied') {
    validateProductionEvidence(repoRoot, target, row, options.productionEvidence)
  }
  requireRecoverableProduction(repoRoot, target)
  requireDependency(repoRoot, target, row)

  if (migrationRecorded(repoRoot, target, row.version)) {
    throw new Error(`Version ${row.version} is already recorded in the production ledger.`)
  }

  if (options.mode === 'apply_sql') {
    const migrationPath = path.join(repoRoot, 'supabase', 'migrations', row.file)
    if (!existsSync(migrationPath)) throw new Error(`Migration file not found: ${migrationPath}`)
    const result = runSupabase(repoRoot, ['db', 'query', '--db-url', target.dbUrl, '--file', migrationPath])
    if (!result.ok) throw new Error(`Production SQL application failed: ${result.stderr || result.error}`)
    console.log(`Applied SQL for ${row.version} to production project ${target.projectRef}.`)
    console.log('The production ledger was not changed. Verify the target and prepare production evidence before --record-applied.')
    return
  }

  const result = runSupabase(repoRoot, [
    'migration', 'repair', '--db-url', target.dbUrl, '--status', 'applied', row.version,
  ])
  if (!result.ok) throw new Error(`Production ledger update failed: ${result.stderr || result.error}`)
  console.log(`Recorded ${row.version} as applied on production project ${target.projectRef}.`)
}

try {
  main()
} catch (error) {
  console.error(`Phase 7 production gate blocked: ${error.message}`)
  process.exitCode = 1
}
