#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const ACCESS_MODE = 'linked_ephemeral'
const RECOVERY_CONFIRMATION = 'I_HAVE_TESTED_PRODUCTION_RECOVERY'
const CONFIGURE_CONFIRMATION = 'CONFIGURE_PRODUCTION_ACCESS'
const EXPECTED_PRODUCTION_LEDGER_COUNT = 433
const RECOVERY_EVIDENCE_PATH = path.join('migration-evidence', '2026-07-20-production-recovery-phase12', 'production-database-recovery.json')

function parseArgs(argv) {
  const options = { attest: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--verify') options.attest = false
    else if (argument === '--attest') options.attest = true
    else if (argument === '--approved-by') options.approvedBy = argv[++index]
    else if (argument === '--confirm') options.confirm = argv[++index]
    else if (argument === '--json') options.json = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-phase13-production-access.mjs --verify [--json]')
  console.log(`  node scripts/supabase-phase13-production-access.mjs --attest --approved-by <name> --confirm ${CONFIGURE_CONFIRMATION} [--json]`)
}

function parseJsonLoose(value) {
  const text = String(value || '').trim()
  try { return JSON.parse(text) } catch {
    const starts = [text.indexOf('{'), text.indexOf('[')].filter((index) => index >= 0).sort((a, b) => a - b)
    if (starts.length === 0) throw new Error('Supabase CLI did not return JSON.')
    return JSON.parse(text.slice(starts[0]))
  }
}

function runSupabase(args) {
  return execFileSync('npx', ['--yes', 'supabase@latest', ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
}

function requireLocalConfiguration() {
  const projectRef = String(process.env.SUPABASE_PRODUCTION_PROJECT_REF || '').trim()
  const accessMode = String(process.env.SUPABASE_PRODUCTION_ACCESS_MODE || '').trim()
  const recovery = String(process.env.SUPABASE_PRODUCTION_RECOVERY_CONFIRMED || '').trim()
  if (projectRef !== PRODUCTION_PROJECT_REF) throw new Error(`SUPABASE_PRODUCTION_PROJECT_REF must equal ${PRODUCTION_PROJECT_REF}.`)
  if (accessMode !== ACCESS_MODE) throw new Error(`SUPABASE_PRODUCTION_ACCESS_MODE must equal ${ACCESS_MODE}.`)
  if (recovery !== RECOVERY_CONFIRMATION) throw new Error(`SUPABASE_PRODUCTION_RECOVERY_CONFIRMED must equal ${RECOVERY_CONFIRMATION}.`)
  if (process.env.SUPABASE_PRODUCTION_DB_URL) throw new Error('Static SUPABASE_PRODUCTION_DB_URL credentials are not permitted in linked_ephemeral mode.')

  const linkedRefPath = path.join('supabase', '.temp', 'project-ref')
  const linkedRef = existsSync(linkedRefPath) ? readFileSync(linkedRefPath, 'utf8').trim() : ''
  if (linkedRef !== PRODUCTION_PROJECT_REF) throw new Error(`The linked Supabase project must equal ${PRODUCTION_PROJECT_REF}.`)

  const recoveryEvidence = JSON.parse(readFileSync(RECOVERY_EVIDENCE_PATH, 'utf8'))
  if (recoveryEvidence.status !== 'PRODUCTION_DATABASE_RECOVERY_PROVEN'
    || recoveryEvidence.productionProjectRef !== PRODUCTION_PROJECT_REF
    || recoveryEvidence.databaseRestoreValidation !== 'pass'
    || !String(recoveryEvidence.approvedBy || '').trim()) {
    throw new Error('Approved Phase 12 production recovery evidence is required.')
  }
}

function verifyPlatformAccess() {
  const projects = parseJsonLoose(runSupabase(['projects', 'list', '--output', 'json']))
  const production = projects.find((project) => project.ref === PRODUCTION_PROJECT_REF)
  if (!production || production.status !== 'ACTIVE_HEALTHY') throw new Error('Production project access is unavailable or unhealthy.')

  const query = parseJsonLoose(runSupabase([
    'db', 'query', '--linked',
    `select current_user, current_database(), current_setting('transaction_read_only') as transaction_read_only,
            (select count(*)::int from supabase_migrations.schema_migrations) as migration_count`,
    '--output-format', 'json',
  ]))
  const row = query.rows?.[0]
  if (!row) throw new Error('The ephemeral production database probe returned no result.')
  if (row.current_database !== 'postgres') throw new Error('The production database probe reached an unexpected database.')
  if (row.migration_count !== EXPECTED_PRODUCTION_LEDGER_COUNT) {
    throw new Error(`Expected ${EXPECTED_PRODUCTION_LEDGER_COUNT} production migrations; found ${row.migration_count}.`)
  }
  return { production, row }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return usage()
  if (options.attest) {
    if (!String(options.approvedBy || '').trim()) throw new Error('--approved-by is required for access attestation.')
    if (options.confirm !== CONFIGURE_CONFIRMATION) throw new Error(`Access attestation requires --confirm ${CONFIGURE_CONFIRMATION}.`)
  }
  requireLocalConfiguration()
  const { production, row } = verifyPlatformAccess()
  const result = {
    generatedAt: new Date().toISOString(),
    status: options.attest ? 'PRODUCTION_ACCESS_CONFIGURED' : 'PRODUCTION_ACCESS_VERIFIED',
    productionProjectRef: PRODUCTION_PROJECT_REF,
    productionProjectStatus: production.status,
    accessMode: ACCESS_MODE,
    credentialType: 'supabase_cli_short_lived_login_role',
    linkedProjectVerified: true,
    databaseConnectivityCheck: 'pass',
    databaseName: row.current_database,
    databaseRoleAcquired: Boolean(String(row.current_user || '').trim()),
    transactionReadOnly: row.transaction_read_only === 'on',
    productionLedgerCount: row.migration_count,
    staticDatabaseUrlConfigured: false,
    recoveryEvidenceValidated: true,
    runtimeRecoveryConfirmationConfigured: true,
    approvedBy: options.attest ? String(options.approvedBy).trim() : '',
    approvalSource: options.attest ? 'explicit_phase13_user_instruction' : '',
    productionMutated: false,
  }
  console.log(options.json ? JSON.stringify(result, null, 2) : `${result.status}: linked ephemeral production access is healthy.`)
}

try {
  main()
} catch (error) {
  console.error(`Phase 13 production access blocked: ${error.message}`)
  process.exitCode = 1
}
