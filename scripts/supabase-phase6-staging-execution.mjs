#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectRolloutSourceContinuity } from '../the-it-guy/scripts/legal-document-rollout-source-continuity.mjs'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const RECOVERY_CONFIRMATION = 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
const APPLY_CONFIRMATION = 'APPLY_TO_STAGING_ONLY'
const MANIFEST_PATH = path.join('docs', 'supabase-phase-5-application-manifest.json')
// The executor deliberately accepts a direct Supabase database host only.
// Pooler endpoints are not accepted because their host does not bind the URL
// to one project reference strongly enough for a destructive migration gate.
const DATABASE_TARGET_CONTRACT = 'direct_supabase_host_v1'
// Pin the mutating CLI so SQL/ledger behavior cannot change underneath a
// reviewed receipt. This version is available in the repository's local npm
// cache and must be deliberately changed/re-reviewed when upgraded.
const SUPABASE_CLI_VERSION = '2.109.1'
const PHASE1_RECEIPT_PATH = path.join('the-it-guy', 'config', 'legal-document-rollout-phase1-staging.json')
const PHASE0_FREEZE_PATH = path.join('the-it-guy', 'config', 'legal-document-rollout-phase0-freeze.json')
const PHASE1_LEGAL_MIGRATION_VERSIONS = new Set([
  '202607220002', '202607220003', '202607220004', '202607220005',
  '202607220006', '202607220007', '202607220008', '202607220009',
  '202607220010', '202607220011', '202607220012', '202607230004',
])
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

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
    else if (arg === '--phase1-receipt') options.phase1Receipt = argv[++index]
    else if (arg === '--phase1-receipt-digest') options.phase1ReceiptDigest = argv[++index]
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

function sha256Digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function receiptManifestDigest(receipt) {
  const canonical = { ...(receipt && typeof receipt === 'object' ? receipt : {}) }
  delete canonical.manifestDigest
  return sha256Digest(JSON.stringify(stableValue(canonical)))
}

function gitOutput(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function requireCleanReceiptWorktree(repoRoot) {
  if (gitOutput(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
    throw new Error('Phase 1 staging execution requires a clean receipt-only worktree.')
  }
}

function requirePhase1Receipt(repoRoot, target, row, migrationPath, options) {
  const required = PHASE1_LEGAL_MIGRATION_VERSIONS.has(String(options.version || ''))
  const supplied = Boolean(options.phase1Receipt || options.phase1ReceiptDigest)
  if (!required && !supplied) return null
  if (!options.phase1Receipt || !options.phase1ReceiptDigest) {
    throw new Error('Phase 1 legal migrations require both --phase1-receipt and --phase1-receipt-digest.')
  }
  if (!SHA256_DIGEST_PATTERN.test(String(options.phase1ReceiptDigest || '').trim())) {
    throw new Error('--phase1-receipt-digest must be a sha256:<64 lowercase hex> receipt digest.')
  }
  const expectedPath = path.resolve(repoRoot, PHASE1_RECEIPT_PATH)
  const receiptPath = path.resolve(repoRoot, options.phase1Receipt)
  if (receiptPath !== expectedPath) {
    throw new Error(`Phase 1 execution accepts only the committed receipt at ${PHASE1_RECEIPT_PATH}.`)
  }
  if (!existsSync(receiptPath)) throw new Error(`Phase 1 receipt not found: ${receiptPath}`)
  const receipt = readJson(receiptPath)
  const expectedDigest = String(options.phase1ReceiptDigest).trim()
  if (receipt?.manifestDigest !== expectedDigest || receiptManifestDigest(receipt) !== expectedDigest) {
    throw new Error('Phase 1 receipt digest does not match the committed receipt contents.')
  }
  if (receipt?.phase !== 'ROLL_OUT_1' || receipt?.contract !== 'legal-document-staging-release-v2' || receipt?.status !== 'pending_staging') {
    throw new Error('Phase 1 execution requires a committed pending_staging receipt under the current contract.')
  }
  const environment = receipt.environment || {}
  const source = receipt.source || {}
  if (environment.stagingProjectRef !== target.projectRef || environment.stagingOrigin !== `https://${target.projectRef}.supabase.co`) {
    throw new Error('Phase 1 receipt staging identity does not match the explicit staging target.')
  }
  if (source.b1EvidenceProjectRef !== target.projectRef) {
    throw new Error('Phase 1 receipt B1 evidence identity does not match the explicit staging target.')
  }
  if (environment.productionProjectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error('Phase 1 receipt production identity does not match this runner production guard.')
  }
  if (!/^[0-9a-f]{40}$/i.test(String(source.commitSha || ''))) {
    throw new Error('Phase 1 receipt must bind a full frozen source commit SHA.')
  }
  if (source.pendingReceiptManifestDigest !== null) {
    throw new Error('Phase 1 staging execution requires the original pending receipt, not an evidence-recorded receipt.')
  }
  const freezePath = path.resolve(repoRoot, PHASE0_FREEZE_PATH)
  if (!existsSync(freezePath)) throw new Error(`Phase 0 freeze receipt not found: ${freezePath}`)
  const freeze = readJson(freezePath)
  if (freeze?.manifestDigest !== source.phase0ManifestDigest || freeze?.productionProjectRef !== environment.productionProjectRef ||
    freeze?.source?.commitSha !== source.commitSha || freeze?.templateReview?.boundB1ManifestDigest !== source.b1ManifestDigest ||
    freeze?.templateReview?.evidenceProjectRef !== source.b1EvidenceProjectRef) {
    throw new Error('Phase 1 receipt does not match the committed Phase 0 freeze and B1 bindings.')
  }
  requireCleanReceiptWorktree(repoRoot)
  const currentCommit = gitOutput(repoRoot, ['rev-parse', 'HEAD'])
  const continuity = collectRolloutSourceContinuity({ repoRoot, sourceCommit: source.commitSha, currentCommit })
  if (continuity.status !== 'RECEIPT_ONLY_DESCENDANT') {
    throw new Error(`Phase 1 receipt source continuity is invalid: ${continuity.reason || continuity.status}.`)
  }
  const artifacts = receipt.artifacts || {}
  const migrations = Array.isArray(artifacts.migrations) ? artifacts.migrations : []
  const migrationIndex = migrations.findIndex((item) => item?.version === row.version)
  const migration = migrations[migrationIndex]
  if (migrationIndex < 0 || !migration || migration.file !== row.file || !SHA256_DIGEST_PATTERN.test(String(migration.sha256 || ''))) {
    throw new Error(`Phase 1 receipt does not bind migration ${row.version} to the selected manifest row.`)
  }
  const actualMigrationDigest = sha256Digest(readFileSync(migrationPath))
  if (actualMigrationDigest !== migration.sha256) {
    throw new Error(`Phase 1 receipt migration hash does not match ${row.file}.`)
  }
  if (migrationIndex === 0) {
    if (migration.dependsOn !== 'reviewed_legal_runtime_preflight') {
      throw new Error('The first Phase 1 migration must bind the reviewed legal-runtime preflight.')
    }
  } else {
    const predecessor = migrations[migrationIndex - 1]
    if (!predecessor || migration.dependsOn !== predecessor.version || !migrationRecorded(repoRoot, target, predecessor.version)) {
      throw new Error(`Phase 1 migration ${row.version} requires ledger-confirmed predecessor ${predecessor?.version || 'unknown'}.`)
    }
  }
  return { receipt, receiptDigest: expectedDigest, migration, actualMigrationDigest }
}

function selectedRows(manifest, options) {
  let rows = [...manifest.rows]
  if (options.stream) rows = rows.filter((row) => row.stream === options.stream)
  if (options.version) rows = rows.filter((row) => row.version === options.version)
  return rows
}

function runSupabase(repoRoot, args) {
  const result = spawnSync('npx', ['--yes', `supabase@${SUPABASE_CLI_VERSION}`, ...args], {
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
  if (!/^[a-z0-9]{8,64}$/.test(projectRef)) {
    throw new Error('SUPABASE_STAGING_PROJECT_REF must be a lowercase Supabase project reference.')
  }
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error('Refusing to target the production Supabase project.')
  if (!dbUrl) throw new Error('SUPABASE_STAGING_DB_URL is required.')
  let parsed
  try {
    parsed = new URL(dbUrl)
  } catch {
    throw new Error('SUPABASE_STAGING_DB_URL must be a valid PostgreSQL connection URL.')
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('SUPABASE_STAGING_DB_URL must use a postgres or postgresql protocol.')
  }
  const expectedHost = `db.${projectRef}.supabase.co`
  if (parsed.hostname.toLowerCase() !== expectedHost) {
    throw new Error(`SUPABASE_STAGING_DB_URL host must be exactly ${expectedHost}; substring matches are not accepted.`)
  }
  if (parsed.port && parsed.port !== '5432') {
    throw new Error('SUPABASE_STAGING_DB_URL must use the direct database port 5432 when a port is supplied.')
  }
  if (parsed.pathname !== '/postgres') {
    throw new Error('SUPABASE_STAGING_DB_URL must target the direct Supabase postgres database.')
  }
  // A PostgreSQL URI can carry connection parameters in its query string.
  // Do not allow host/port/service overrides (or two competing sslmodes) to
  // weaken the exact hostname/port binding checked above.  Phase 1 accepts
  // one, and only one, explicit TLS mode.
  const queryNames = [...parsed.searchParams.keys()]
  const sslModes = parsed.searchParams.getAll('sslmode')
  if (queryNames.length !== 1 || queryNames[0] !== 'sslmode' || sslModes.length !== 1) {
    throw new Error('SUPABASE_STAGING_DB_URL may contain only one sslmode query parameter; connection overrides are not accepted.')
  }
  const sslMode = String(sslModes[0] || '').trim().toLowerCase()
  if (!['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
    throw new Error('SUPABASE_STAGING_DB_URL must explicitly use sslmode=require, verify-ca, or verify-full.')
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

function validateEvidence(repoRoot, target, row, evidencePath, phase1Binding = null) {
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
  if (phase1Binding) {
    const requiredPhase1Evidence = {
      phase1ReceiptManifestDigest: phase1Binding.receiptDigest,
      migrationSha256: phase1Binding.actualMigrationDigest,
    }
    for (const [key, value] of Object.entries(requiredPhase1Evidence)) {
      if (evidence[key] !== value) throw new Error(`Phase 1 evidence ${key} must equal the committed receipt binding.`)
    }
    if (!SHA256_DIGEST_PATTERN.test(String(evidence.predecessorLedgerEvidenceDigest || '')) || !SHA256_DIGEST_PATTERN.test(String(evidence.ledgerEvidenceDigest || '')) || evidence.predecessorLedgerEvidenceDigest === evidence.ledgerEvidenceDigest) {
      throw new Error('Phase 1 evidence must contain distinct predecessorLedgerEvidenceDigest and ledgerEvidenceDigest values.')
    }
  }
  return { absolutePath, evidence, sha256: sha256Digest(readFileSync(absolutePath)) }
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
  console.log('  node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version <version> --confirm APPLY_TO_STAGING_ONLY [--phase1-receipt <path> --phase1-receipt-digest <sha256>]')
  console.log('  node scripts/supabase-phase6-staging-execution.mjs --record-applied --version <version> --evidence <file> --confirm APPLY_TO_STAGING_ONLY [--phase1-receipt <path> --phase1-receipt-digest <sha256>]')
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
  if (PHASE1_LEGAL_MIGRATION_VERSIONS.has(String(options.version || '')) && (!options.phase1Receipt || !options.phase1ReceiptDigest)) {
    throw new Error('Phase 1 legal migrations require both --phase1-receipt and --phase1-receipt-digest.')
  }
  const row = requireSingleRow(rows, options)
  const target = stagingTarget()
  const migrationPath = path.join(repoRoot, 'supabase', 'migrations', row.file)
  if (!existsSync(migrationPath)) throw new Error(`Migration file not found: ${migrationPath}`)
  const phase1Binding = requirePhase1Receipt(repoRoot, target, row, migrationPath, options)

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
    if (phase1Binding) console.log(JSON.stringify({ phase1ReceiptManifestDigest: phase1Binding.receiptDigest, version: row.version, migrationSha256: phase1Binding.actualMigrationDigest, targetProjectRef: target.projectRef, sqlApplied: true }, null, 2))
    console.log('The migration ledger was not changed. Run verification and prepare evidence before --record-applied.')
    return
  }

  if (options.mode === 'record_applied') {
    if (['corrective_migration_required', 'manual_data_review'].includes(row.action)) {
      throw new Error(`Manifest action ${row.action} cannot be ledger-recorded by this runner.`)
    }
    const evidence = validateEvidence(repoRoot, target, row, options.evidence, phase1Binding)
    if (migrationRecorded(repoRoot, target, row.version)) {
      throw new Error(`Version ${row.version} is already recorded in the staging ledger.`)
    }
    const result = runSupabase(repoRoot, ['migration', 'repair', '--db-url', target.dbUrl, '--status', 'applied', row.version])
    if (!result.ok) throw new Error(`Staging ledger update failed: ${result.stderr || result.error}`)
    console.log(`Recorded ${row.version} as applied on staging project ${target.projectRef}.`)
    if (phase1Binding) console.log(JSON.stringify({ phase1ReceiptManifestDigest: phase1Binding.receiptDigest, version: row.version, migrationSha256: phase1Binding.actualMigrationDigest, targetProjectRef: target.projectRef, evidenceSha256: evidence.sha256, ledgerRecorded: true }, null, 2))
  }
}

try {
  main()
} catch (error) {
  console.error(`Phase 6 staging gate blocked: ${error.message}`)
  process.exitCode = 1
}
